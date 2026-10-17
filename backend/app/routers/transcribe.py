import asyncio
from pathlib import Path
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal, get_db
from ..models.transcript import TranscriptModel
from ..schemas.transcript import TranscribeRequest
from ..services.transcription_manager import transcription_manager

router = APIRouter(tags=["transcribe"])

@router.post("/api/transcribe")
async def start_transcription(
    req: TranscribeRequest,
    db: Session = Depends(get_db),
):
    """
    Initiates or restarts background speech-to-text processing for a transcript document.
    Runs persistently in the background decoupled from client browser sessions.
    """
    transcript = db.query(TranscriptModel).filter(TranscriptModel.id == req.transcriptId).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")

    audio_file = transcript.normalized_audio_filename or transcript.media_filename
    audio_path = settings.media_dir / audio_file
    if not audio_path.exists():
        raise HTTPException(status_code=400, detail="Normalized audio file missing on server")

    job = transcription_manager.start_or_attach(
        transcript_id=transcript.id,
        audio_path=audio_path,
        total_duration=transcript.duration or 1.0,
        model_size=req.modelSize or settings.whisper_model,
        force_restart=req.forceRestart,
    )

    return {
        "status": job.status,
        "transcriptId": transcript.id,
        "progress": job.progress,
    }


@router.websocket("/ws/transcribe/{transcript_id}")
async def websocket_transcribe(
    websocket: WebSocket,
    transcript_id: str,
):
    """
    Persistent WebSocket progressive streaming endpoint:
    - Attaches client to the background TranscriptionManager job
    - Streams live speech segments and progress updates in real time
    - Supports Pause, Resume, and Stop controls
    - Reconnection-safe: Client disconnections NEVER kill background transcription
    """
    await websocket.accept()
    db = SessionLocal()

    try:
        transcript = db.query(TranscriptModel).filter(TranscriptModel.id == transcript_id).first()
        if not transcript:
            await websocket.send_json({"type": "error", "message": "Transcript ID not found"})
            await websocket.close()
            return

        # If transcript is already completed, send completed state and close gracefully
        if transcript.status == "completed":
            meta = transcript.get_metadata()
            await websocket.send_json({
                "type": "completed",
                "progress": 100,
                "metadata": meta,
                "alreadyCompleted": True,
            })
            return

        audio_file = transcript.normalized_audio_filename or transcript.media_filename
        audio_path = settings.media_dir / audio_file
        if not audio_path.exists():
            await websocket.send_json({"type": "error", "message": f"Audio file not found: {audio_file}"})
            await websocket.close()
            return

        # Attach to existing running job or start a new background job
        job = transcription_manager.start_or_attach(
            transcript_id=transcript_id,
            audio_path=audio_path,
            total_duration=transcript.duration or 1.0,
            model_size=settings.whisper_model,
            force_restart=False,
        )

        # Register this WebSocket as an active subscriber
        job.add_subscriber(websocket)

        # Send initial status & progress to client
        await websocket.send_json({
            "type": "status",
            "status": job.status,
            "progress": job.progress,
        })

        # Listen for client commands (pause, resume, stop)
        while True:
            msg = await websocket.receive_json()
            action = msg.get("action")
            if action == "pause":
                job.pause()
            elif action == "resume":
                job.resume()
            elif action == "stop":
                job.stop()
                break

    except (WebSocketDisconnect, ConnectionResetError):
        # Client tab closed, refreshed, or connection lost — background transcription continues!
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        # Unsubscribe this specific WebSocket
        job = transcription_manager.get_job(transcript_id)
        if job:
            job.remove_subscriber(websocket)
        db.close()
