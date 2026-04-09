"""Application configuration loaded from environment variables."""

import os


class Settings:
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.2")
    EPUB_STORAGE_PATH: str = os.getenv("EPUB_STORAGE_PATH", "/app/epubs")
    FREE_DICTIONARY_API: str = "https://api.dictionaryapi.dev/api/v2/entries"
    MAX_IMAGE_RESULTS: int = 6
    TTS_DEFAULT_VOICE: str = "en-US-AriaNeural"


settings = Settings()
