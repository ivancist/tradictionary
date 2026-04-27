"""Tradictionary — FastAPI application entrypoint."""

import asyncio
from contextlib import asynccontextmanager
from urllib.parse import quote

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models.schemas import (
    SearchRequest,
    UnifiedSearchResponse,
    TranslationResponse,
    DefinitionResponse,
    ImageResult,
    WordReferenceResponse,
)
from app.routers import translate, define, images, tts, epub, pdf, wordreference as wordref_router
from app.services import translator, ollama_client, dictionary, image_search, wordreference, it_wiktionary
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup: check Ollama connectivity
    if settings.ENABLE_OLLAMA:
        healthy = await ollama_client.check_health()
        if healthy:
            print("✅ Ollama is reachable")
        else:
            print("⚠️  Ollama is not reachable — translation features may fail")
    else:
        print("ℹ️  Ollama is disabled by configuration")
    yield
    # Shutdown: nothing to clean up
    print("👋 Shutting down Tradictionary")


app = FastAPI(
    title="Tradictionary",
    description="Language learning API — translation, definitions, images, and TTS",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ─────────────────────────────────────

app.include_router(translate.router)
app.include_router(define.router)
app.include_router(images.router)
app.include_router(tts.router)
app.include_router(epub.router)
app.include_router(pdf.router)
app.include_router(wordref_router.router)


# ── Unified Search endpoint ──────────────────────────────

@app.post("/api/search", response_model=UnifiedSearchResponse)
async def unified_search(req: SearchRequest):
    """Fan-out search: translation + definition + images in parallel."""

    async def _translate():
        try:
            result = await translator.translate_text(
                text=req.text,
                source_lang=req.source_lang,
                target_lang=req.target_lang,
            )
            return TranslationResponse(**result)
        except Exception as e:
            print(f"[search] Translation error: {e}")
            return None

    async def _images():
        try:
            results = await image_search.search_images(query=req.text)
            return [ImageResult(**r) for r in results]
        except Exception as e:
            print(f"[search] Image search error: {e}")
            return []

    async def _get_wordref_and_define():
        wordref = None
        try:
            result = await wordreference.lookup(
                word=req.text,
                source_lang=req.source_lang,
                target_lang=req.target_lang
            )
            wordref = WordReferenceResponse(**result) if result else None
        except Exception as e:
            print(f"[search] WordReference error: {e}")

        definition = None
        wiki_images = []

        if req.target_lang == "it":
            target_word = None
            if wordref and wordref.categories and wordref.categories[0].entries:
                target_word = wordref.categories[0].entries[0].target_word
            
            if target_word:
                try:
                    result = await it_wiktionary.lookup_italian_definition(word=target_word)
                    if result:
                        definition = DefinitionResponse(**result)
                        wiki_images = [ImageResult(**img) for img in result.get("images", [])]
                except Exception as e:
                    print(f"[search] it_wiktionary error: {e}")
        
        if not definition:
            try:
                result = await dictionary.lookup(word=req.text, lang=req.source_lang)
                definition = DefinitionResponse(**result) if result else None
            except Exception as e:
                print(f"[search] Definition error: {e}")

        return wordref, definition, wiki_images

    # Execute translation, images, and the combined wordref+definition tasks in parallel
    translation, image_results, (wordref, definition, wiki_images) = await asyncio.gather(
        _translate(), _images(), _get_wordref_and_define()
    )
    
    # Append wiktionary images to the main image results
    if image_results is not None:
        image_results.extend(wiki_images)
    else:
        image_results = wiki_images

    # Build TTS URL — use source_lang if specified, otherwise fall back to target_lang
    tts_lang = req.source_lang if req.source_lang != "auto" else req.target_lang
    audio_url = f"/api/tts?text={quote(req.text)}&lang={tts_lang}"

    return UnifiedSearchResponse(
        translation=translation,
        definition=definition,
        images=image_results or [],
        wordreference=wordref,
        audio_url=audio_url,
    )


# ── Health check ─────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    ollama_ok = False
    if settings.ENABLE_OLLAMA:
        ollama_ok = await ollama_client.check_health()
    return {
        "status": "ok",
        "ollama": "connected" if ollama_ok else ("disabled" if not settings.ENABLE_OLLAMA else "disconnected"),
    }
