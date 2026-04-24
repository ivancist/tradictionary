"""Async HTTP client for the Ollama API."""

import json
import httpx
from app.config import settings


async def generate(prompt: str, model: str | None = None) -> str:
    """Send a prompt to Ollama and return the full response text."""
    model = model or settings.OLLAMA_MODEL
    url = f"{settings.OLLAMA_BASE_URL}/api/generate"

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                url,
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("response", "").strip()
    except httpx.TimeoutException:
        raise Exception(f"Ollama request timed out (model may still be loading)")
    except httpx.HTTPStatusError as e:
        raise Exception(f"Ollama returned HTTP {e.response.status_code}: {e.response.text[:200]}")
    except httpx.ConnectError:
        raise Exception("Cannot connect to Ollama — is the service running?")


async def translate_text(text: str, source_lang: str, target_lang: str, wr_context: str | None = None) -> dict:
    """Use the LLM to translate text and provide example sentences."""
    
    LANG_MAP = {
        "en": "English", "es": "Spanish", "fr": "French", "de": "German", 
        "it": "Italian", "pt": "Portuguese", "ru": "Russian", "zh": "Chinese", 
        "ja": "Japanese", "ko": "Korean", "ar": "Arabic", "nl": "Dutch", 
        "pl": "Polish", "tr": "Turkish", "sv": "Swedish", "hi": "Hindi"
    }

    # Handle "auto" source language
    lang_from = "the detected language" if source_lang == "auto" else LANG_MAP.get(source_lang, source_lang)
    lang_to = LANG_MAP.get(target_lang, target_lang)

    is_only_examples = False

    word_count = len(text.split())
    if word_count <= 4 and wr_context:
        is_only_examples = True
        prompt = (
            f"You are a professional example-sentence generator. The user looked up the word/phrase '{text}' from {lang_from} to {lang_to}.\n"
            f"WordReference returned these EXACT entries (you must not invent any others):\n{wr_context}\n\n"
            f"CRITICAL RULES:\n"
            f"- Generate exactly ONE example sentence per entry listed above, in the same order.\n"
            f"- Each example MUST contain the word/phrase '{text}' (or a conjugated form) in {lang_from}.\n"
            f"- Prefix each example with the EXACT label shown in the entry (e.g. '(n - fortress)', '(vi - board a vehicle)') - copy it verbatim, do NOT rename or modify it.\n"
            f"- Do NOT invent new labels or contexts not listed above.\n"
            f"- Write examples ONLY in the SOURCE language ({lang_from}). No translations.\n"
            f"- Do NOT use naked double quotes (\") inside strings, use single quotes (').\n"
            f"- Respond ONLY with valid JSON, no markdown.\n\n"
            f"JSON format:\n"
            f'{{"translated_text": "", "examples": ["(n - fortress) example sentence...", "(n - figurative place) example sentence..."]}}'
        )
    elif word_count <= 4:
        prompt = (
            f"You are a professional bilingual dictionary. Translate the short word or phrase from "
            f"{lang_from} to {lang_to}.\n\n"
            f"CRITICAL RULES:\n"
            f"- The translation MUST be extremely accurate, returning the most common natural equivalent.\n"
            f"- Provide 1-2 example sentences showcasing the exact original word or phrase in a realistic context.\n"
            f"- The examples MUST STRICTLY CONTAIN the word/phrase '{text}' (or a valid conjugation of it).\n"
            f"- The examples MUST be written entirely in the SOURCE language ({lang_from}), NOT in the target language.\n"
            f"- IMPORTANT: Do NOT use naked double quotes (\") inside the example strings, use single quotes (') to prevent JSON breakage.\n"
            f"- Respond ONLY with valid JSON, no markdown blockquotes.\n\n"
            f"Text to translate: \"{text}\"\n\n"
            f"JSON format:\n"
            f'{{"translated_text": "your highly accurate translation here", "examples": ["example 1 strictly containing original text", "example 2 strictly containing original text"]}}'
        )
    else:
        prompt = (
            f"You are an expert native translator and interpreter. Translate the following sentence from "
            f"{lang_from} to {lang_to}.\n\n"
            f"CRITICAL RULES:\n"
            f"- DO NOT translate literal word-for-word. You MUST extract the true meaning, tone, and idioms, and rewrite it natively in {lang_to}.\n"
            f"- The final translation must flow profoundly naturally as if thought by a native speaker.\n"
            f"- DO NOT provide examples or variations. Keep the 'examples' array completely empty.\n"
            f"- IMPORTANT: Do NOT use naked double quotes (\") inside the translated text, use single quotes (') to prevent JSON breakage.\n"
            f"- Respond ONLY with valid JSON, no markdown blockquotes.\n\n"
            f"Text to translate: \"{text}\"\n\n"
            f"JSON format:\n"
            f'{{"translated_text": "your natural meaning-based translation", "examples": []}}'
        )

    raw = await generate(prompt)

    try:
        # Extract JSON from response (LLM sometimes wraps it in markdown)
        cleaned = raw
        if "```" in cleaned:
            # Remove markdown code fences
            parts = cleaned.split("```")
            for part in parts:
                stripped = part.strip()
                if stripped.startswith("json"):
                    stripped = stripped[4:].strip()
                if stripped.startswith("{"):
                    cleaned = stripped
                    break

        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start != -1 and end > start:
            parsed = json.loads(cleaned[start:end])
            
            examples_raw = parsed.get("examples", [])
            if examples_raw and isinstance(examples_raw[0], dict):
                examples_raw = examples_raw[0].get("examples", [])
            elif isinstance(examples_raw, dict):
                examples_raw = examples_raw.get("examples", [])

            return {
                "translated_text": parsed.get("translated_text", raw) or parsed.get("translated", "") or "",
                "source_lang": source_lang,
                "target_lang": target_lang,
                "examples": examples_raw,
                "is_examples_only": is_only_examples
            }
    except json.JSONDecodeError:
        pass

    # Fallback: return raw text as translation
    return {
        "translated_text": raw,
        "source_lang": source_lang,
        "target_lang": target_lang,
        "examples": [],
        "is_examples_only": False
    }


async def check_health() -> bool:
    """Check if Ollama is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False
