"""PDF file management — upload, URL download, list, serve, delete."""

import os
import uuid
import json
from pathlib import Path
from io import BytesIO

import fitz  # PyMuPDF
import httpx

from app.config import settings

METADATA_FILE = "library.json"


def _get_storage_path() -> Path:
    path = Path(settings.EPUB_STORAGE_PATH)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _get_metadata_path() -> Path:
    return _get_storage_path() / METADATA_FILE


def _load_metadata() -> list[dict]:
    meta_path = _get_metadata_path()
    if meta_path.exists():
        with open(meta_path, "r") as f:
            return json.load(f)
    return []


def _save_metadata(metadata: list[dict]) -> None:
    with open(_get_metadata_path(), "w") as f:
        json.dump(metadata, f, indent=2)


def _extract_pdf_info(filepath: str, book_id: str, filename: str) -> dict:
    """Extract title, author from PDF metadata."""
    try:
        doc = fitz.open(filepath)
        meta = doc.metadata or {}
        title = meta.get("title", "").strip() or filename
        author = meta.get("author", "").strip() or "Unknown"
        doc.close()

        return {
            "id": book_id,
            "title": title,
            "author": author,
            "filename": filename,
            "cover_url": f"/api/pdf/{book_id}/cover",
            "type": "pdf",
        }
    except Exception:
        return {
            "id": book_id,
            "title": filename,
            "author": "Unknown",
            "filename": filename,
            "cover_url": "",
            "type": "pdf",
        }


async def save_pdf(file_content: bytes, filename: str) -> dict:
    """Save an uploaded PDF file and extract its metadata."""
    book_id = str(uuid.uuid4())[:8]
    storage = _get_storage_path()

    # Save the file
    filepath = storage / f"{book_id}.pdf"
    with open(filepath, "wb") as f:
        f.write(file_content)

    # Extract metadata
    info = _extract_pdf_info(str(filepath), book_id, filename)

    # Update library metadata
    metadata = _load_metadata()
    metadata.append(info)
    _save_metadata(metadata)

    return info


async def download_pdf_from_url(url: str) -> dict:
    """Download a PDF from a URL and save it to the library."""
    async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
        response = await client.get(url)
        response.raise_for_status()

        content_type = response.headers.get("content-type", "")
        if "pdf" not in content_type and not url.lower().endswith(".pdf"):
            # Try to detect PDF by magic bytes
            if not response.content[:5] == b"%PDF-":
                raise ValueError(
                    f"URL does not appear to serve a PDF (content-type: {content_type})"
                )

        # Derive filename from URL
        filename = url.rstrip("/").split("/")[-1].split("?")[0]
        if not filename.lower().endswith(".pdf"):
            filename += ".pdf"

    return await save_pdf(response.content, filename)


def get_pdf_path(book_id: str) -> str | None:
    """Get the file path for a PDF by its ID."""
    filepath = _get_storage_path() / f"{book_id}.pdf"
    if filepath.exists():
        return str(filepath)
    return None


def delete_pdf(book_id: str) -> bool:
    """Remove a PDF from the library."""
    filepath = _get_storage_path() / f"{book_id}.pdf"

    # Remove from metadata
    metadata = _load_metadata()
    metadata = [m for m in metadata if m["id"] != book_id]
    _save_metadata(metadata)

    # Remove file
    if filepath.exists():
        filepath.unlink()
        return True
    return False


def get_pdf_cover(book_id: str) -> bytes | None:
    """Render the first page of a PDF as a JPEG thumbnail."""
    filepath = get_pdf_path(book_id)
    if not filepath:
        return None

    try:
        doc = fitz.open(filepath)
        if doc.page_count == 0:
            doc.close()
            return None

        page = doc[0]
        # Render at 2x for a nice thumbnail
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("jpeg")
        doc.close()
        return img_bytes
    except Exception as e:
        print(f"[cover] Error rendering PDF cover for {book_id}: {e}")
    return None
