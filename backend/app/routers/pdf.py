"""PDF management endpoints — upload, URL import, serve, delete."""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from app.models.schemas import EpubInfo
from app.services import pdf_manager

router = APIRouter(prefix="/api/pdf", tags=["pdf"])


class PdfFromUrlRequest(BaseModel):
    url: str = Field(..., min_length=1, description="URL of the PDF to download")


@router.post("/upload", response_model=EpubInfo)
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF file to the library."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are accepted")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    info = await pdf_manager.save_pdf(content, file.filename)
    return EpubInfo(**info)


@router.post("/from-url", response_model=EpubInfo)
async def import_pdf_from_url(req: PdfFromUrlRequest):
    """Download a PDF from a URL and add it to the library."""
    try:
        info = await pdf_manager.download_pdf_from_url(req.url)
        return EpubInfo(**info)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to download PDF: {e}")


@router.get("/{book_id}")
async def serve_pdf(book_id: str):
    """Serve a PDF file for the reader."""
    filepath = pdf_manager.get_pdf_path(book_id)
    if not filepath:
        raise HTTPException(status_code=404, detail="PDF not found")

    return FileResponse(
        filepath,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline"},
    )


@router.get("/{book_id}/cover")
async def get_cover(book_id: str):
    """Get a rendered cover (page 1) of a PDF."""
    image_data = pdf_manager.get_pdf_cover(book_id)
    if not image_data:
        raise HTTPException(status_code=404, detail="Cover not found")

    return Response(
        content=image_data,
        media_type="image/jpeg",
    )


@router.delete("/{book_id}")
async def delete_pdf(book_id: str):
    """Remove a PDF from the library."""
    if pdf_manager.delete_pdf(book_id):
        return {"detail": "PDF deleted"}
    raise HTTPException(status_code=404, detail="PDF not found")
