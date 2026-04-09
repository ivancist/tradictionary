"""Dictionary definition endpoint."""

from fastapi import APIRouter, HTTPException
from app.models.schemas import DefineRequest, DefinitionResponse
from app.services import dictionary

router = APIRouter(prefix="/api", tags=["define"])


@router.post("/define", response_model=DefinitionResponse)
async def define(req: DefineRequest):
    """Look up a word definition (Free Dictionary API → Ollama fallback)."""
    try:
        result = await dictionary.lookup(word=req.word, lang=req.lang)
        return DefinitionResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Definition lookup failed: {str(e)}")
