import asyncio
from app.services import it_wiktionary
async def test():
    try:
        res = await it_wiktionary.lookup_italian_definition("sedia")
        print(res)
    except Exception as e:
        print("ERROR:", e)

asyncio.run(test())
