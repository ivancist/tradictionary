"""Image search: Wiktionary media-list first, padded with Wikimedia Commons."""

import httpx
from urllib.parse import quote
from app.config import settings


async def _wiktionary_images(query: str) -> list[dict]:
    """Fetch images from the English Wiktionary media-list API."""
    encoded = quote(query, safe="")
    url = f"https://en.wiktionary.org/api/rest_v1/page/media-list/{encoded}"

    try:
        headers = {"User-Agent": "Tradictionary/1.0 httpx/0.24"}
        async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return []
            data = resp.json()

        results = []
        for item in data.get("items", []):
            if item.get("type") != "image":
                continue
            srcset = item.get("srcset", [])
            if not srcset:
                continue
            # Take the first src and ensure it has a scheme
            src = srcset[0].get("src", "")
            if src.startswith("//"):
                src = "https:" + src
            elif not src.startswith("http"):
                continue
            title = item.get("title", "").replace("File:", "").rsplit(".", 1)[0].replace("_", " ")
            caption = item.get("caption", {}).get("text", title)
            results.append({
                "url": src,
                "thumbnail": src,
                "title": caption or title,
            })
        return results

    except Exception as e:
        print(f"[wiktionary_images] error: {e}")
        return []


async def _wikimedia_images(query: str, limit: int) -> list[dict]:
    """Search Wikimedia Commons for bitmap images."""
    import re
    clean_query = re.sub(r'[^\w\s]', '', query).strip()
    words = clean_query.split()
    if len(words) > 2:
        clean_query = " ".join(words[:2])
    if not clean_query:
        clean_query = "book"

    url = "https://commons.wikimedia.org/w/api.php"
    params = {
        "action": "query",
        "generator": "search",
        "gsrnamespace": "6",
        "gsrsearch": f"filetype:bitmap {clean_query}",
        "gsrlimit": str(limit),
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": "400",
        "format": "json",
        "origin": "*",
    }

    try:
        headers = {"User-Agent": "Tradictionary/1.0 httpx/0.24"}
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        pages = data.get("query", {}).get("pages", {})
        results = []
        for page in pages.values():
            imageinfo = page.get("imageinfo", [{}])[0]
            thumb_url = imageinfo.get("thumburl", "")
            full_url = imageinfo.get("url", "")
            title = page.get("title", "").replace("File:", "").rsplit(".", 1)[0].replace("_", " ")
            if thumb_url:
                results.append({"url": full_url or thumb_url, "thumbnail": thumb_url, "title": title})
        return results

    except Exception as e:
        print(f"[image_search] Wikimedia error: {e}")
        return []


async def search_images(query: str, max_results: int | None = None) -> list[dict]:
    """Search images: ONLY Wikimedia Commons (used as padding)."""
    max_results = max_results or settings.MAX_IMAGE_RESULTS
    return await _wikimedia_images(query, max_results)
