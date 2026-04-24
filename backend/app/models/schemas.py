"""Pydantic models for API request and response validation."""

from pydantic import BaseModel, Field


# ── Requests ──────────────────────────────────────────────

class SearchRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500, description="Word or phrase to search")
    source_lang: str = Field(default="auto", max_length=10, description="Source language code (e.g. 'de', 'es')")
    target_lang: str = Field(default="en", max_length=10, description="Target language code")


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)
    source_lang: str = Field(default="auto", max_length=10)
    target_lang: str = Field(default="en", max_length=10)
    wr_context: str | None = Field(default=None)


class DefineRequest(BaseModel):
    word: str = Field(..., min_length=1, max_length=100)
    lang: str = Field(default="en", max_length=10)


# ── Responses ─────────────────────────────────────────────

class TranslationResponse(BaseModel):
    translated_text: str
    source_lang: str
    target_lang: str
    examples: list[str] = []
    is_examples_only: bool = False


class DefinitionMeaning(BaseModel):
    part_of_speech: str
    definitions: list[str]


class DefinitionResponse(BaseModel):
    word: str
    phonetic: str = ""
    meanings: list[DefinitionMeaning] = []
    source: str = "dictionary_api"


class ImageResult(BaseModel):
    url: str
    thumbnail: str = ""
    title: str = ""


class WRExample(BaseModel):
    source: str
    target: str


class WREntry(BaseModel):
    source_word: str
    source_pos: str
    context: str
    target_word: str
    target_pos: str
    examples: list[WRExample] = []


class WRCategory(BaseModel):
    title: str
    entries: list[WREntry] = []


class WordReferenceResponse(BaseModel):
    word: str
    categories: list[WRCategory] = []


class UnifiedSearchResponse(BaseModel):
    translation: TranslationResponse | None = None
    definition: DefinitionResponse | None = None
    images: list[ImageResult] = []
    wordreference: WordReferenceResponse | None = None
    audio_url: str = ""


class EpubInfo(BaseModel):
    id: str
    title: str
    author: str = ""
    filename: str
    cover_url: str = ""
    type: str = "epub"


class EpubLibraryResponse(BaseModel):
    books: list[EpubInfo]


class ErrorResponse(BaseModel):
    detail: str
