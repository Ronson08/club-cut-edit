from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from ..config import settings
from ..database import get_db
from ..models.transcript import TranscriptModel
from ..services.ollama import is_ollama_available, generate_ai_summary, query_transcript_chat

router = APIRouter(prefix="/api/ai", tags=["ai"])

class ChatPayload(BaseModel):
    transcriptId: str
    question: str
    model: Optional[str] = None

class SummaryPayload(BaseModel):
    transcriptId: str
    model: Optional[str] = None

class TestGroqPayload(BaseModel):
    apiKey: str
    model: Optional[str] = None

@router.get("/status")
async def check_ai_status():
    """Verify local Ollama service and Groq Cloud availability."""
    available = await is_ollama_available()
    return {
        "provider": "ollama",
        "available": available,
        "endpoint": settings.ollama_base_url,
        "model": settings.ollama_model,
        "hasOpenAIKey": bool(settings.openai_api_key),
        "hasGroqKey": bool(settings.groq_api_key),
        "groqModel": settings.groq_model,
    }

@router.post("/test-groq")
async def test_groq_endpoint(payload: TestGroqPayload):
    """Validate a Groq API key with a fast ping call."""
    from ..services.groq_diarizer import test_groq_key
    success, msg = await test_groq_key(payload.apiKey, payload.model)
    return {"valid": success, "message": msg}

@router.post("/chat")
async def chat_with_transcript(payload: ChatPayload, db: Session = Depends(get_db)):
    """Context-aware Q&A agent over transcript content."""
    t = db.query(TranscriptModel).filter(TranscriptModel.id == payload.transcriptId).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transcript not found")

    full_text = " ".join(s.text for s in t.segments)
    if not full_text:
        return {"answer": "The transcript has no text content to query yet."}

    answer = await query_transcript_chat(full_text, payload.question, payload.model)
    return {"answer": answer}

@router.post("/summary")
async def trigger_summary(payload: SummaryPayload, db: Session = Depends(get_db)):
    """Regenerate executive summary, action items, and chapters."""
    t = db.query(TranscriptModel).filter(TranscriptModel.id == payload.transcriptId).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transcript not found")

    full_text = " ".join(s.text for s in t.segments)
    summary_text, actions, chapters = await generate_ai_summary(full_text, payload.model)

    meta = t.get_metadata()
    meta["summary"] = summary_text
    meta["actionItems"] = actions
    meta["chapters"] = [c.model_dump() for c in chapters]
    t.set_metadata(meta)
    db.commit()

    return {
        "status": "summary generated",
        "summary": summary_text,
        "actionItems": actions,
        "chapters": [c.model_dump() for c in chapters],
    }
