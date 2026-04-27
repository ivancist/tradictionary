import asyncio
import httpx
from bs4 import BeautifulSoup
import re

async def debug_portare():
    url = "https://it.wiktionary.org/w/api.php"
    params = {
        "action": "parse",
        "page": "portare",
        "prop": "text",
        "format": "json"
    }
    headers = {"User-Agent": "Tradictionary/1.0"}

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params, headers=headers)
        data = resp.json()
        html = data["parse"]["text"]["*"]
        soup = BeautifulSoup(html, "html.parser")
        
        h3 = soup.find(id="Verbo")
        print(f"H3 found: {h3 is not None}")
        if h3:
            container = h3.parent if h3.parent and h3.parent.name == "div" and "mw-heading" in h3.parent.get("class", []) else h3
            print(f"Container: {container.name} classes={container.get('class')}")
            for i, sibling in enumerate(container.find_next_siblings()):
                print(f"Sibling {i}: {sibling.name} classes={sibling.get('class')}")
                if sibling.name == "ol":
                    print("FOUND OL!")
                    break
                if i > 5: break

asyncio.run(debug_portare())
