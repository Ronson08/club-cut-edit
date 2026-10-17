import json
import logging
import asyncio
import threading
from pathlib import Path
from typing import Dict, Set, Optional

from fastapi import WebSocket
from ..config import settings
from ..database import SessionLocal
from ..models.transcript import TranscriptModel, SegmentModel
from .stt import stream_transcription
from .ollama import generate_ai_summary

logger = logging.getLogger(__name__)


class ActiveTranscriptionJob:
    def __init__(
        self,
        transcript_id: str,
        audio_path: Path,
        total_duration: float,
        model_size: str = "base",
        loop: Optional[asyncio.AbstractEventLoop] = None,
    ):
        self.transcript_id = transcript_id
        self.audio_path = audio_path
        self.total_duration = max(total_duration, 1.0)
        self.model_size = model_size
        self.loop = loop or asyncio.get_running_loop()

        self.status = "processing"  # "processing", "paused", "completed", "stopped", "error"
        self.progress = 5.0
        self.stop_event = threading.Event()
        self.pause_event = threading.Event()
        self.pause_event.set()  # Start in unpaused state

        self.subscribers: Set[WebSocket] = set()
        self.full_text_parts: list[str] = []
        self.all_filler_counts: dict[str, int] = {}
        self.total_pause_count: int = 0
        self.total_word_count: int = 0
        self.order_index: int = 0

        self.worker_thread: Optional[threading.Thread] = None

    def add_subscriber(self, ws: WebSocket):
        self.subscribers.add(ws)

    def remove_subscriber(self, ws: WebSocket):
        self.subscribers.discard(ws)

    def broadcast(self, payload: dict):
        """Thread-safe broadcast of a JSON payload to all active WebSocket subscribers."""
        def _send_all():
            async def _coro():
                dead = set()
                for ws in list(self.subscribers):
                    try:
                        await ws.send_json(payload)
                    except Exception:
                        dead.add(ws)
                self.subscribers.difference_update(dead)
            asyncio.create_task(_coro())

        try:
            self.loop.call_soon_threadsafe(_send_all)
        except Exception as e:
            logger.warning(f"Failed to schedule broadcast: {e}")

    def pause(self):
        """Pauses the Whisper worker thread and updates database."""
        self.pause_event.clear()
        self.status = "paused"
        self._update_db_status("paused")
        self.broadcast({"type": "status", "status": "paused", "progress": self.progress})

    def resume(self):
        """Resumes the Whisper worker thread and updates database."""
        self.pause_event.set()
        self.status = "processing"
        self._update_db_status("processing")
        self.broadcast({"type": "status", "status": "processing", "progress": self.progress})

    def stop(self):
        """Signals stop event, exiting transcription and finalizing existing segments."""
        self.stop_event.set()
        self.pause_event.set()  # Unpause so thread can exit immediately
        self.status = "stopped"

    def _update_db_status(self, status: str):
        try:
            with SessionLocal() as db:
                t = db.query(TranscriptModel).filter(TranscriptModel.id == self.transcript_id).first()
                if t:
                    t.status = status
                    t.progress = self.progress
                    db.commit()
        except Exception as e:
            logger.error(f"Error updating status in DB: {e}")

    def start(self):
        """Launches the background transcription thread."""
        self.worker_thread = threading.Thread(target=self._run_worker, daemon=True)
        self.worker_thread.start()

    def _run_worker(self):
        try:
            logger.info(f"Starting STT worker for transcript {self.transcript_id}")
            self.broadcast({"type": "status", "status": "processing", "progress": self.progress})
            self._update_db_status("processing")

            for item in stream_transcription(self.audio_path, model_size=self.model_size):
                if self.stop_event.is_set():
                    break

                # Block here if paused until resume() sets pause_event
                self.pause_event.wait()

                if self.stop_event.is_set():
                    break

                segment_obj, detected_lang, dur = item
                self.order_index += 1
                self.full_text_parts.append(segment_obj.text)
                self.total_word_count += len(segment_obj.words)
                self.total_pause_count += len(segment_obj.pauses)

                for w in segment_obj.words:
                    if w.isFiller:
                        clean = w.word.lower()
                        self.all_filler_counts[clean] = self.all_filler_counts.get(clean, 0) + 1

                # Calculate progress
                self.progress = min(92.0, round((segment_obj.end / self.total_duration) * 100, 1))

                # Persist to database in real time
                with SessionLocal() as db:
                    db_segment = SegmentModel(
                        id=segment_obj.id,
                        transcript_id=self.transcript_id,
                        order_index=self.order_index,
                        speaker=segment_obj.speaker,
                        start=segment_obj.start,
                        end=segment_obj.end,
                        text=segment_obj.text,
                        words_json=json.dumps([w.model_dump() for w in segment_obj.words]),
                        pauses_json=json.dumps([p.model_dump() for p in segment_obj.pauses]),
                        sentiment=segment_obj.sentiment,
                        sentiment_score=segment_obj.sentimentScore,
                    )
                    db.add(db_segment)

                    t = db.query(TranscriptModel).filter(TranscriptModel.id == self.transcript_id).first()
                    if t:
                        t.progress = self.progress
                        t.status = self.status
                    db.commit()

                # Stream to all active WebSockets
                self.broadcast({
                    "type": "segment",
                    "segment": segment_obj.model_dump(),
                    "progress": self.progress,
                    "status": self.status,
                })

        except Exception as exc:
            logger.exception(f"Worker exception in transcript {self.transcript_id}: {exc}")
            self.status = "error"
            self._update_db_status("failed")
            self.broadcast({"type": "error", "message": str(exc)})
        finally:
            was_stopped = self.stop_event.is_set()
            asyncio.run_coroutine_threadsafe(self._finalize(was_stopped), self.loop)

    async def _finalize(self, was_stopped: bool):
        """Finalizes the document with AI summaries, updates DB, and broadcasts completion."""
        try:
            self.broadcast({
                "type": "status",
                "status": "stopped" if was_stopped else "generating_summary",
                "progress": 95 if not was_stopped else self.progress,
            })

            full_text = " ".join(self.full_text_parts)
            summary_text, action_items, chapters = await generate_ai_summary(full_text)

            with SessionLocal() as db:
                t = db.query(TranscriptModel).filter(TranscriptModel.id == self.transcript_id).first()
                if t:
                    metadata_dict = {
                        "language": t.language or "en",
                        "wordCount": self.total_word_count,
                        "pauseCount": self.total_pause_count,
                        "fillerCounts": self.all_filler_counts,
                        "entities": [],
                        "summary": summary_text,
                        "actionItems": action_items,
                        "chapters": [c.model_dump() for c in chapters],
                    }
                    t.status = "completed"
                    t.progress = 100.0 if not was_stopped else self.progress
                    t.set_metadata(metadata_dict)
                    db.commit()

            self.status = "completed"
            self.broadcast({
                "type": "completed",
                "progress": 100 if not was_stopped else self.progress,
                "metadata": {
                    "wordCount": self.total_word_count,
                    "pauseCount": self.total_pause_count,
                    "fillerCounts": self.all_filler_counts,
                    "summary": summary_text,
                    "actionItems": action_items,
                    "chapters": [c.model_dump() for c in chapters],
                },
                "wasStopped": was_stopped,
            })
        except Exception as exc:
            logger.exception(f"Error finalizing transcript {self.transcript_id}: {exc}")
        finally:
            # Clean up task from manager registry
            transcription_manager.unregister(self.transcript_id)


class TranscriptionManager:
    """Singleton manager tracking and coordinating background transcription jobs."""

    def __init__(self):
        self._jobs: Dict[str, ActiveTranscriptionJob] = {}
        self._lock = threading.Lock()

    def get_job(self, transcript_id: str) -> Optional[ActiveTranscriptionJob]:
        with self._lock:
            return self._jobs.get(transcript_id)

    def is_running(self, transcript_id: str) -> bool:
        job = self.get_job(transcript_id)
        return job is not None and job.status in ("processing", "paused")

    def start_or_attach(
        self,
        transcript_id: str,
        audio_path: Path,
        total_duration: float,
        model_size: str = "base",
        force_restart: bool = False,
    ) -> ActiveTranscriptionJob:
        with self._lock:
            existing = self._jobs.get(transcript_id)
            if existing and not force_restart:
                return existing

            if existing and force_restart:
                existing.stop()

            # If force restart, clear segments in DB
            if force_restart:
                with SessionLocal() as db:
                    db.query(SegmentModel).filter(SegmentModel.transcript_id == transcript_id).delete()
                    t = db.query(TranscriptModel).filter(TranscriptModel.id == transcript_id).first()
                    if t:
                        t.status = "processing"
                        t.progress = 5.0
                    db.commit()

            job = ActiveTranscriptionJob(
                transcript_id=transcript_id,
                audio_path=audio_path,
                total_duration=total_duration,
                model_size=model_size,
            )
            self._jobs[transcript_id] = job
            job.start()
            return job

    def unregister(self, transcript_id: str):
        with self._lock:
            self._jobs.pop(transcript_id, None)


# Global singleton instance
transcription_manager = TranscriptionManager()
