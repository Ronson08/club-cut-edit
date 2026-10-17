import uuid
import aiofiles
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models.transcript import TranscriptModel
from ..schemas.transcript import UploadResponse
from ..services.media import get_media_duration, extract_normalized_audio

router = APIRouter(prefix="/api/upload", tags=["upload"])

AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma"}
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".webm", ".avi"}
ALLOWED_EXTENSIONS = AUDIO_EXTENSIONS | VIDEO_EXTENSIONS

@router.post("", response_model=UploadResponse)
async def upload_media(
    file: UploadFile = File(...),
    title: str = Form(None),
    db: Session = Depends(get_db),
):
    """
    Upload an audio or video file:
    1. Validates supported media formats
    2. Persists original file
    3. Normalizes media to 16kHz mono WAV for optimal faster-whisper INT8 STT
    4. Probes exact duration via FFmpeg
    5. Saves initial transcript record in SQLite
    """
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    file_id = str(uuid.uuid4())
    is_video = ext in VIDEO_EXTENSIONS
    media_type = "video" if is_video else "audio"

    saved_filename = f"{file_id}{ext}"
    saved_filepath = settings.media_dir / saved_filename

    # Stream file to disk in chunks (handles gigabyte files safely)
    async with aiofiles.open(saved_filepath, "wb") as out_file:
        while content := await file.read(1024 * 1024):  # 1MB chunks
            await out_file.write(content)

    # Normalize to 16kHz mono WAV for Whisper
    normalized_filename = f"{file_id}_16k.wav"
    normalized_filepath = settings.media_dir / normalized_filename
    norm_ok = await extract_normalized_audio(saved_filepath, normalized_filepath)

    if not norm_ok:
        # If FFmpeg failed, fall back to using original path as normalized path
        normalized_filename = saved_filename

    # Probe duration
    duration = await get_media_duration(saved_filepath)

    # Document title
    doc_title = title or Path(file.filename).stem.replace("_", " ").title()

    # Save initial database record
    transcript = TranscriptModel(
        id=file_id,
        title=doc_title,
        media_type=media_type,
        media_filename=saved_filename,
        normalized_audio_filename=normalized_filename,
        duration=duration,
        status="queued",
        progress=0.0,
    )
    db.add(transcript)
    db.commit()
    db.refresh(transcript)

    return UploadResponse(
        id=transcript.id,
        title=transcript.title,
        mediaType=transcript.media_type,
        mediaUrl=f"/api/media/{transcript.media_filename}",
        normalizedAudioUrl=f"/api/media/{transcript.normalized_audio_filename}",
        duration=transcript.duration,
        status=transcript.status,
    )
