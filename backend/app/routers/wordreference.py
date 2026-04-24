"""WordReference scraping endpoint."""

from fastapi import APIRouter, HTTPException
from app.models.schemas import SearchRequest, WordReferenceResponse
from app.services import wordreference

router = APIRouter(prefix="/api", tags=["wordreference"])


@router.post("/wordreference", response_model=WordReferenceResponse)
async def get_wordreference(req: SearchRequest):
    """Scrape WordReference for definitions and examples."""
    try:
        result = await wordreference.lookup(
            word=req.text,
            source_lang=req.source_lang,
            target_lang=req.target_lang,
        )
        if not result:
            raise HTTPException(status_code=404, detail="No WordReference results found")
        return WordReferenceResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"WordReference lookup failed: {str(e)}")
