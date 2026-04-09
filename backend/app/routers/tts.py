"""Text-to-speech endpoint — returns MP3 audio stream."""

from fastapi import APIRouter, Query
from fastapi.responses import Response
from app.services import tts_engine

router = APIRouter(prefix="/api", tags=["tts"])


@router.get("/tts")
async def text_to_speech(
    text: str = Query(..., min_length=1, max_length=500, description="Text to speak"),
    lang: str = Query(default="en", max_length=10, description="Language code"),
):
    """Generate speech audio for the given text."""
    audio_bytes = await tts_engine.synthesize(text=text, lang=lang)

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f'inline; filename="tts.mp3"',
            "Cache-Control": "public, max-age=3600",
        },
    )
