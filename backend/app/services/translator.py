"""Translation service wrapping deep-translator with Ollama fallback."""

import asyncio
from deep_translator import GoogleTranslator
from app.config import settings

async def translate_text(text: str, source_lang: str, target_lang: str, wr_context: str | None = None) -> dict:
    """Translate text using deep-translator or Ollama depending on configuration."""
    
    if settings.ENABLE_OLLAMA:
        from app.services import ollama_client
        return await ollama_client.translate_text(text, source_lang, target_lang, wr_context)
    
    # If using deep_translator
    # "auto" is standard for GoogleTranslator source language
    src = "auto" if source_lang == "auto" else source_lang
    # Google Translator uses standard lang codes (en, es, it, etc.)
    # We might need to handle slight variations but standard 2-letter codes work
    
    def _do_translation():
        try:
            translator = GoogleTranslator(source=src, target=target_lang)
            translated = translator.translate(text)
            return translated
        except Exception as e:
            print(f"deep_translator error: {e}")
            return text
            
    # Run in thread pool since it's a blocking sync call
    translated_text = await asyncio.to_thread(_do_translation)
    
    return {
        "translated_text": translated_text,
        "source_lang": source_lang,
        "target_lang": target_lang,
        "examples": [],
        "is_examples_only": False
    }
