import asyncio
import json
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from app.services import it_wiktionary

async def main():
    word = sys.argv[1] if len(sys.argv) > 1 else "portare"
    m = await it_wiktionary.lookup_italian_definition(word)
    print(json.dumps(m, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
