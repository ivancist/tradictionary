"""Wiktionary service for Italian definitions."""

import httpx
from bs4 import BeautifulSoup
import re

async def lookup_italian_definition(word: str) -> dict | None:
    """Query it.wiktionary.org for Italian definitions and images."""
    url = f"https://it.wiktionary.org/w/api.php"
    params = {
        "action": "parse",
        "page": word,
        "prop": "text|sections",
        "format": "json"
    }

    headers = {
        "User-Agent": "Tradictionary/1.0 (https://github.com/ivancist/tradictionary)"
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code != 200:
                return None

            data = resp.json()
            if "error" in data:
                return None

            parse_data = data.get("parse", {})
            html_content = parse_data.get("text", {}).get("*", "")
            sections = parse_data.get("sections", [])

            if not html_content:
                return None

            # Find sections with toclevel 2
            # Also ensure they belong to the "Italiano" toclevel 1 section
            is_italian = False
            target_anchors = []
            for sec in sections:
                line = sec.get("line", "")
                # Strip HTML tags from line (e.g. <i>Italiano</i> -> Italiano)
                line_text = re.sub(r'<[^>]+>', '', line).strip()
                
                if sec.get("toclevel") == 1:
                    is_italian = (line_text == "Italiano")
                elif sec.get("toclevel") == 2 and is_italian:
                    target_anchors.append((sec.get("anchor"), line))

            soup = BeautifulSoup(html_content, "html.parser")
            
            meanings = []
            
            for anchor, line in target_anchors:
                # Strip HTML tags from line (e.g. <i>Avverbio</i> -> Avverbio)
                pos = re.sub(r'<[^>]+>', '', line).strip()
                
                # Find the h3 tag with this id
                h3 = soup.find(id=anchor)
                if not h3:
                    continue
                
                # We need to find the parent div (mw-heading3) or the h3 itself, and get the next <ol>
                container = h3.parent if h3.parent and h3.parent.name == "div" and "mw-heading" in h3.parent.get("class", []) else h3
                
                # Find the next sibling that is an <ol>
                ol = None
                for sibling in container.find_next_siblings():
                    if sibling.name == "ol":
                        ol = sibling
                        break
                    # Stop if we hit a new major section (level 1 or 2)
                    if sibling.name in ["h2", "h3"]:
                        break
                    cls = sibling.get("class", []) if sibling.name else []
                    if sibling.name == "div" and ("mw-heading2" in cls or "mw-heading3" in cls):
                        break
                
                if ol:
                    definitions = []
                    for li in ol.find_all("li", recursive=False):
                        # Extract text, ignore sub-lists like <ul> inside <li> (which are often examples)
                        for sub in li.find_all(["ul", "dl"]):
                            sub.decompose()
                        
                        text = li.get_text(" ", strip=True)
                        if text:
                            definitions.append(text)
                            
                    if definitions:
                        meanings.append({
                            "part_of_speech": pos,
                            "definitions": definitions[:3] # cap at 3
                        })

            # Extract images from <figure> or .thumb
            images = []
            # Modern Wiktionary uses <figure>
            for figure in soup.find_all("figure"):
                img = figure.find("img")
                figcaption = figure.find("figcaption")
                if img and img.get("src"):
                    src = img["src"]
                    if src.startswith("//"): src = "https:" + src
                    title = figcaption.get_text(" ", strip=True) if figcaption else ""
                    images.append({"url": src, "thumbnail": src, "title": title})
            
            # Older versions or some pages might use .thumb
            if not images:
                for thumb in soup.find_all(class_="thumb"):
                    img = thumb.find("img")
                    caption = thumb.find(class_="thumbcaption")
                    if img and img.get("src"):
                        src = img["src"]
                        if src.startswith("//"): src = "https:" + src
                        title = caption.get_text(" ", strip=True) if caption else ""
                        images.append({"url": src, "thumbnail": src, "title": title})

            # Try to extract phonetic (usually an AFI section or IPA class)
            phonetic = ""
            ipa_span = soup.find("span", class_="IPA")
            if ipa_span:
                phonetic = ipa_span.get_text(strip=True)

            if not meanings:
                return None

            return {
                "word": word,
                "phonetic": phonetic,
                "meanings": meanings,
                "source": "it_wiktionary",
                "images": images
            }

    except Exception as e:
        print(f"[it_wiktionary] Error: {e}")
        return None
