"""Text-to-speech using Google Translate TTS (gTTS) — free and reliable."""

import io
import asyncio
from gtts import gTTS

# Supported language codes (gTTS supports 50+ languages natively)
SUPPORTED_LANGS = {
    "en", "es", "fr", "de", "it", "pt", "ru", "zh", "ja", "ko",
    "ar", "nl", "pl", "tr", "sv", "da", "no", "fi", "el", "hi",
    "cs", "ro", "hu", "uk", "th", "vi", "id", "ms", "tl",
}

DEFAULT_LANG = "en"


def _get_lang(lang: str) -> str:
    """Normalize and validate the language code."""
    if not lang or lang.lower() == "auto":
        return DEFAULT_LANG
    code = lang.lower().split("-")[0]
    return code if code in SUPPORTED_LANGS else DEFAULT_LANG


def _generate_audio(text: str, lang: str) -> bytes:
    """Generate MP3 audio bytes synchronously (runs in thread pool)."""
    tts = gTTS(text=text, lang=_get_lang(lang), slow=False)
    buffer = io.BytesIO()
    tts.write_to_fp(buffer)
    buffer.seek(0)
    return buffer.read()


async def synthesize(text: str, lang: str = "en") -> bytes:
    """Generate speech audio bytes (MP3) for the given text and language."""
    return await asyncio.to_thread(_generate_audio, text, lang)
