import asyncio
import httpx
from bs4 import BeautifulSoup
import re
import json

async def lookup_italian_definition(word: str) -> dict | None:
    url = f"https://it.wiktionary.org/w/api.php"
    params = {
        "action": "parse",
        "page": word,
        "prop": "text|sections",
        "format": "json"
    }
    headers = {
        "User-Agent": "Tradictionary/1.0 (https://github.com/ivancist/tradictionary; ivan@example.com)"
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, params=params, headers=headers)
            print(f"Status Code: {resp.status_code}")
            if resp.status_code != 200:
                print("Response Text:", resp.text[:200])
                return None
            data = resp.json()
        except Exception as e:
            print("Request/JSON Error:", e)
            return None
        
        if "error" in data:
            print("API Error:", data["error"])
            return None

        parse_data = data.get("parse", {})
        html_content = parse_data.get("text", {}).get("*", "")
        sections = parse_data.get("sections", [])

        is_italian = False
        target_anchors = []
        for sec in sections:
            line = sec.get("line", "")
            # Strip HTML from line for language check
            line_text = re.sub(r'<[^>]+>', '', line).strip()
            
            if sec.get("toclevel") == 1:
                is_italian = (line_text == "Italiano")
                print(f"Section Level 1: '{line_text}' -> is_italian={is_italian}")
            elif sec.get("toclevel") == 2 and is_italian:
                target_anchors.append((sec.get("anchor"), line))
                print(f"  Added Anchor: {sec.get('anchor')} ({line})")

        soup = BeautifulSoup(html_content, "html.parser")
        meanings = []
        
        for anchor, line in target_anchors:
            pos = re.sub(r'<[^>]+>', '', line).strip()
            h3 = soup.find(id=anchor)
            if not h3:
                print(f"    H3 not found for anchor {anchor}")
                continue
            
            container = h3.parent if h3.parent and h3.parent.name == "div" and "mw-heading" in h3.parent.get("class", []) else h3
            
            ol = None
            for sibling in container.find_next_siblings():
                if sibling.name == "ol":
                    ol = sibling
                    break
                cls = sibling.get("class", []) if sibling.name else []
                if sibling.name in ["h2", "h3", "div"] and "mw-heading" in cls:
                    break
            
            if ol:
                definitions = []
                for li in ol.find_all("li", recursive=False):
                    for sub in li.find_all(["ul", "dl"]):
                        sub.decompose()
                    text = li.get_text(strip=True)
                    if text:
                        definitions.append(text)
                
                if definitions:
                    meanings.append({"part_of_speech": pos, "definitions": definitions[:3]})
                    print(f"    Found definitions for {pos}: {len(definitions)}")
            else:
                print(f"    OL not found for {pos}")

        return meanings

async def main():
    words = ["portare"]
    for w in words:
        print(f"--- Testing '{w}' ---")
        m = await lookup_italian_definition(w)
        print(f"Result for {w}: {json.dumps(m, indent=2)}")

if __name__ == "__main__":
    asyncio.run(main())
