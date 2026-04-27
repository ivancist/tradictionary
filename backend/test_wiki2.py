import asyncio
import httpx
from bs4 import BeautifulSoup

async def test():
    url = "https://it.wiktionary.org/w/api.php"
    params = {"action": "parse", "page": "sedia", "prop": "text|sections", "format": "json"}
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params)
        data = resp.json()
        sections = data["parse"]["sections"]
        print("SECTIONS:")
        for sec in sections:
            print(sec["toclevel"], sec["line"], sec["anchor"])
            
test_task = test()
asyncio.run(test_task)
