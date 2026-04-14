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
from app.routers import translate, define, images, tts, epub, pdf
from app.services import ollama_client, dictionary, image_search, wordreference


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup: check Ollama connectivity
    healthy = await ollama_client.check_health()
    if healthy:
        print("✅ Ollama is reachable")
    else:
        print("⚠️  Ollama is not reachable — translation features may fail")
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


# ── Unified Search endpoint ──────────────────────────────

@app.post("/api/search", response_model=UnifiedSearchResponse)
async def unified_search(req: SearchRequest):
    """Fan-out search: translation + definition + images in parallel."""

    async def _translate():
        try:
            result = await ollama_client.translate_text(
                text=req.text,
                source_lang=req.source_lang,
                target_lang=req.target_lang,
            )
            return TranslationResponse(**result)
        except Exception as e:
            print(f"[search] Translation error: {e}")
            return None

    async def _define():
        try:
            result = await dictionary.lookup(word=req.text, lang=req.source_lang)
            return DefinitionResponse(**result)
        except Exception as e:
            print(f"[search] Definition error: {e}")
            return None

    async def _images():
        try:
            results = await image_search.search_images(query=req.text)
            return [ImageResult(**r) for r in results]
        except Exception as e:
            print(f"[search] Image search error: {e}")
            return []

    async def _wordreference():
        try:
            result = await wordreference.lookup(
                word=req.text,
                source_lang=req.source_lang,
                target_lang=req.target_lang
            )
            return WordReferenceResponse(**result) if result else None
        except Exception as e:
            print(f"[search] WordReference error: {e}")
            return None

    # Execute all in parallel
    translation, definition, image_results, wordref = await asyncio.gather(
        _translate(), _define(), _images(), _wordreference()
    )

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
    ollama_ok = await ollama_client.check_health()
    return {
        "status": "ok",
        "ollama": "connected" if ollama_ok else "disconnected",
    }
