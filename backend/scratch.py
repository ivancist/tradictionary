import asyncio
from app.services.ollama_client import translate_text

async def main():
    res = await translate_text(
        text="get on",
        source_lang="en",
        target_lang="it",
        wr_context="[vi] get on -> salire (board a vehicle); [vtr] get on -> mettere (put on clothing)"
    )
    print(res)

asyncio.run(main())
