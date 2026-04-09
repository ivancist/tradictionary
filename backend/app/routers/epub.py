"""EPUB management endpoints — upload, list, serve, delete."""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, Response
from app.models.schemas import EpubInfo, EpubLibraryResponse
from app.services import epub_manager

router = APIRouter(prefix="/api/epub", tags=["epub"])


@router.post("/upload", response_model=EpubInfo)
async def upload_epub(file: UploadFile = File(...)):
    """Upload an EPUB file to the library."""
    if not file.filename or not file.filename.lower().endswith(".epub"):
        raise HTTPException(status_code=400, detail="Only .epub files are accepted")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    info = await epub_manager.save_epub(content, file.filename)
    return EpubInfo(**info)


@router.get("/library", response_model=EpubLibraryResponse)
async def list_library():
    """List all EPUBs in the library."""
    books = epub_manager.list_books()
    return EpubLibraryResponse(books=[EpubInfo(**b) for b in books])


@router.get("/{book_id}")
async def serve_epub(book_id: str):
    """Serve an EPUB file for the reader."""
    filepath = epub_manager.get_epub_path(book_id)
    if not filepath:
        raise HTTPException(status_code=404, detail="Book not found")

    return FileResponse(
        filepath,
        media_type="application/epub+zip",
        headers={"Content-Disposition": f"inline"},
    )


@router.get("/{book_id}/cover")
async def get_cover(book_id: str):
    """Get the cover image of an EPUB."""
    image_data = epub_manager.get_cover_image(book_id)
    if not image_data:
        raise HTTPException(status_code=404, detail="Cover not found")

    return Response(
        content=image_data,
        media_type="image/jpeg",
    )


@router.delete("/{book_id}")
async def delete_epub(book_id: str):
    """Remove an EPUB from the library."""
    if epub_manager.delete_book(book_id):
        return {"detail": "Book deleted"}
    raise HTTPException(status_code=404, detail="Book not found")
