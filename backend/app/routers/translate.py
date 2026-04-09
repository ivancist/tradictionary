"""Translation endpoint — proxies to Ollama."""

from fastapi import APIRouter, HTTPException
from app.models.schemas import TranslateRequest, TranslationResponse
from app.services import ollama_client

router = APIRouter(prefix="/api", tags=["translate"])


@router.post("/translate", response_model=TranslationResponse)
async def translate(req: TranslateRequest):
    """Translate text using Ollama LLM."""
    try:
        result = await ollama_client.translate_text(
            text=req.text,
            source_lang=req.source_lang,
            target_lang=req.target_lang,
        )
        return TranslationResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")
