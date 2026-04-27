import asyncio
from app.services import it_wiktionary
async def test():
    res = await it_wiktionary.lookup_italian_definition("sedia")
    print("SEDIA:", res)
    res2 = await it_wiktionary.lookup_italian_definition("oggetto")
    print("OGGETTO:", res2)

asyncio.run(test())
