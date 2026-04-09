"""Image search using Wikimedia Commons API — free, no API key, no rate limits."""

import httpx
from urllib.parse import quote
from app.config import settings


async def search_images(query: str, max_results: int | None = None) -> list[dict]:
    """Search for images using the Wikimedia Commons API."""
    max_results = max_results or settings.MAX_IMAGE_RESULTS

    # Clean the query since Wikimedia Commons has poor full-text/phrase parsing
    import re
    clean_query = re.sub(r'[^\w\s]', '', query).strip()
    words = clean_query.split()
    if len(words) > 2:
        # Take the most meaningful words if it's a long phrase (usually nouns/verbs, we just take the first two for a best-effort visual)
        clean_query = " ".join(words[:2])
    if not clean_query:
        clean_query = "book"

    url = "https://commons.wikimedia.org/w/api.php"
    params = {
        "action": "query",
        "generator": "search",
        "gsrnamespace": "6",  # File namespace
        "gsrsearch": f"filetype:bitmap {clean_query}",
        "gsrlimit": str(max_results),
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": "400",
        "format": "json",
        "origin": "*",
    }

    try:
        headers = {
            "User-Agent": "Tradictionary/1.0 (https://github.com/tradictionary) httpx/0.24"
        }
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
                results.append({
                    "url": full_url or thumb_url,
                    "thumbnail": thumb_url,
                    "title": title,
                })

        return results[:max_results]

    except Exception as e:
        print(f"[image_search] Wikimedia error: {e}")
        return []
