"""Image search endpoint — DuckDuckGo integration."""

from fastapi import APIRouter, Query
from app.models.schemas import ImageResult
from app.services import image_search

router = APIRouter(prefix="/api", tags=["images"])


@router.get("/images", response_model=list[ImageResult])
async def search_images(
    q: str = Query(..., min_length=1, description="Search query"),
    max: int = Query(default=6, ge=1, le=20, description="Max results"),
):
    """Search for images using DuckDuckGo."""
    results = await image_search.search_images(query=q, max_results=max)
    return [ImageResult(**r) for r in results]
