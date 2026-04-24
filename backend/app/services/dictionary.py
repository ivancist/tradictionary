"""Free Dictionary API client with Ollama fallback."""

import httpx
from app.config import settings


async def lookup(word: str, lang: str = "en") -> dict:
    """Look up a word in the Free Dictionary API, fall back to Ollama if not found."""
    result = await _free_dictionary_lookup(word, lang)
    if result:
        return result

    # Fallback: ask Ollama for a definition
    return await _ollama_define(word, lang)


async def _free_dictionary_lookup(word: str, lang: str) -> dict | None:
    """Query dictionaryapi.dev for definitions."""
    url = f"{settings.FREE_DICTIONARY_API}/{lang}/{word}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return None

            data = resp.json()
            if not isinstance(data, list) or len(data) == 0:
                return None

            entry = data[0]
            phonetic = entry.get("phonetic", "")

            # Try to find a phonetic from phonetics array if main one is empty
            if not phonetic:
                for p in entry.get("phonetics", []):
                    if p.get("text"):
                        phonetic = p["text"]
                        break

            meanings = []
            for meaning in entry.get("meanings", []):
                defs = [
                    d["definition"]
                    for d in meaning.get("definitions", [])[:3]  # cap at 3 per POS
                ]
                if defs:
                    meanings.append({
                        "part_of_speech": meaning.get("partOfSpeech", ""),
                        "definitions": defs,
                    })

            return {
                "word": word,
                "phonetic": phonetic,
                "meanings": meanings,
                "source": "dictionary_api",
            }
    except Exception:
        return None


async def _ollama_define(word: str, lang: str) -> dict:
    """Fall back to Ollama for definitions when the dictionary API fails."""
    from app.services.ollama_client import generate
    import json

    LANG_MAP = {
        "en": "English", "es": "Spanish", "fr": "French", "de": "German", 
        "it": "Italian", "pt": "Portuguese", "ru": "Russian", "zh": "Chinese", 
        "ja": "Japanese", "ko": "Korean", "ar": "Arabic", "nl": "Dutch", 
        "pl": "Polish", "tr": "Turkish", "sv": "Swedish", "hi": "Hindi"
    }
    full_lang = LANG_MAP.get(lang, lang)

    prompt = (
        f"You are an expert monolingual {full_lang} dictionary. Provide the exact dictionary definition for the word or phrase: \"{word}\" \n"
        f"CRITICAL RULES:\n"
        f"- The descriptions, meanings, and part of speech MUST be written entirely in {full_lang}.\n"
        f"- NEVER use English unless {full_lang} IS English.\n"
        f"- If the text is a sentence fragment, select its most important word and define it, or define the overall phrase.\n"
        f"- IMPORTANT: Do NOT use naked double quotes (\") inside the string values. Use single quotes (') instead to prevent JSON breakage.\n\n"
        f"Respond ONLY in this JSON format. Absolutely no markdown, no surrounding text, no numbering:\n"
        f'{{"phonetic": "...", "meanings": [{{"part_of_speech": "...", "definitions": ["..."]}}]}}'
    )

    raw = await generate(prompt)

    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            parsed = json.loads(raw[start:end])
            return {
                "word": word,
                "phonetic": parsed.get("phonetic", ""),
                "meanings": parsed.get("meanings", []),
                "source": "ollama",
            }
    except json.JSONDecodeError:
        pass

    return {
        "word": word,
        "phonetic": "",
        "meanings": [{"part_of_speech": "unknown", "definitions": [raw]}],
        "source": "ollama",
    }
