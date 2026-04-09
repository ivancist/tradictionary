"""EPUB file management — upload, list, serve, delete."""

import os
import uuid
import json
from pathlib import Path

import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup

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


def _extract_epub_info(filepath: str, book_id: str, filename: str) -> dict:
    """Extract title, author from EPUB metadata."""
    try:
        book = epub.read_epub(filepath, options={"ignore_ncx": True})
        title = book.get_metadata("DC", "title")
        author = book.get_metadata("DC", "creator")

        return {
            "id": book_id,
            "title": title[0][0] if title else filename,
            "author": author[0][0] if author else "Unknown",
            "filename": filename,
            "cover_url": f"/api/epub/{book_id}/cover",
        }
    except Exception:
        return {
            "id": book_id,
            "title": filename,
            "author": "Unknown",
            "filename": filename,
            "cover_url": "",
        }


async def save_epub(file_content: bytes, filename: str) -> dict:
    """Save an uploaded EPUB file and extract its metadata."""
    book_id = str(uuid.uuid4())[:8]
    storage = _get_storage_path()

    # Save the file
    filepath = storage / f"{book_id}.epub"
    with open(filepath, "wb") as f:
        f.write(file_content)

    # Extract metadata
    info = _extract_epub_info(str(filepath), book_id, filename)

    # Update library metadata
    metadata = _load_metadata()
    metadata.append(info)
    _save_metadata(metadata)

    return info


def list_books() -> list[dict]:
    """List all books in the library."""
    return _load_metadata()


def get_epub_path(book_id: str) -> str | None:
    """Get the file path for an EPUB by its ID."""
    filepath = _get_storage_path() / f"{book_id}.epub"
    if filepath.exists():
        return str(filepath)
    return None


def delete_book(book_id: str) -> bool:
    """Remove a book from the library."""
    filepath = _get_storage_path() / f"{book_id}.epub"

    # Remove from metadata
    metadata = _load_metadata()
    metadata = [m for m in metadata if m["id"] != book_id]
    _save_metadata(metadata)

    # Remove file
    if filepath.exists():
        filepath.unlink()
        return True
    return False


def get_cover_image(book_id: str) -> bytes | None:
    """Extract the cover image from an EPUB, trying multiple strategies."""
    filepath = get_epub_path(book_id)
    if not filepath:
        return None

    try:
        book = epub.read_epub(filepath, options={"ignore_ncx": True})

        # Strategy 1: ITEM_COVER type
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_COVER:
                return item.get_content()

        # Strategy 2: Look for cover in metadata
        cover_id = None
        for meta in book.get_metadata("OPF", "cover"):
            if meta and meta[1] and "content" in meta[1]:
                cover_id = meta[1]["content"]
                break

        if cover_id:
            item = book.get_item_with_id(cover_id)
            if item:
                return item.get_content()

        # Strategy 3: Check for common cover image names
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_IMAGE:
                name = item.get_name().lower()
                item_id = (item.get_id() or "").lower()
                if any(kw in name for kw in ("cover", "frontcover", "title")):
                    return item.get_content()
                if any(kw in item_id for kw in ("cover", "frontcover")):
                    return item.get_content()

        # Strategy 4: First image in the book as last resort
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_IMAGE:
                content = item.get_content()
                if len(content) > 5000:  # Skip tiny icons
                    return content

    except Exception as e:
        print(f"[cover] Error extracting cover for {book_id}: {e}")
    return None
