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


async def translate_text(text: str, source_lang: str, target_lang: str) -> dict:
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

    prompt = (
        f"You are a professional dictionary and translator software. Translate the following text from "
        f"{lang_from} to {lang_to}.\n\n"
        f"Rules:\n"
        f"- Ensure the translation is as accurate and natural as possible.\n"
        f"- The text may be a partial sentence, a single word, or a fragment. Translate it natively as it is.\n"
        f"- Include 1-2 example sentences showing the original word or phrase used in a short context.\n"
        f"- Respond ONLY with valid JSON, no markdown blockquotes (```), no extra text\n\n"
        f"Text to translate: \"{text}\"\n\n"
        f"JSON format:\n"
        f'{{"translated_text": "your translation here", "examples": ["example 1", "example 2"]}}'
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
            return {
                "translated_text": parsed.get("translated_text", raw),
                "source_lang": source_lang,
                "target_lang": target_lang,
                "examples": parsed.get("examples", []),
            }
    except json.JSONDecodeError:
        pass

    # Fallback: return raw text as translation
    return {
        "translated_text": raw,
        "source_lang": source_lang,
        "target_lang": target_lang,
        "examples": [],
    }


async def check_health() -> bool:
    """Check if Ollama is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False
