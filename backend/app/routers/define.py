"""Dictionary definition endpoint."""

from fastapi import APIRouter, HTTPException
from app.models.schemas import DefineRequest, DefinitionResponse
from app.services import dictionary, it_wiktionary, image_search

router = APIRouter(prefix="/api", tags=["define"])


@router.post("/define", response_model=DefinitionResponse | None)
async def define(req: DefineRequest):
    """Look up a word definition (Free Dictionary API -> it.wiktionary for Italian)."""
    try:
        if req.lang == "it":
            print(f"[define] Querying Italian definition for: {req.word}")
            result = await it_wiktionary.lookup_italian_definition(word=req.word)
            if result:
                print(f"[define] Found Italian definition for: {req.word}")
                return DefinitionResponse(**result)
            print(f"[define] Italian definition NOT found for: {req.word}")

        result = await dictionary.lookup(word=req.word, lang=req.lang)
        if result and req.lang == "en":
            # Add English Wiktionary images if language is English
            wkt_images = await image_search._wiktionary_images(req.word)
            result["images"] = wkt_images
            
        return DefinitionResponse(**result) if result else None
    except Exception as e:
        print(f"[define] ERROR for {req.word} ({req.lang}): {e}")
        raise HTTPException(status_code=500, detail=f"Definition lookup failed: {str(e)}")
