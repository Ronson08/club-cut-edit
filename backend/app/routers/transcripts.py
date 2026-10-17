from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel

from ..config import settings
from ..database import get_db
from ..models.transcript import TranscriptModel, SegmentModel
from ..schemas.transcript import (
    TranscriptDocument,
    TranscriptSegment,
    TranscriptMetadata,
    WordItem,
    PauseItem,
)

router = APIRouter(prefix="/api/transcripts", tags=["transcripts"])

class UpdateTranscriptRequest(BaseModel):
    title: Optional[str] = None
    oldSpeaker: Optional[str] = None
    newSpeaker: Optional[str] = None

class UpdateSegmentRequest(BaseModel):
    text: Optional[str] = None
    speaker: Optional[str] = None

class AutoDiarizeRequest(BaseModel):
    apiKey: Optional[str] = None
    model: Optional[str] = None

class SplitSegmentRequest(BaseModel):
    wordId: Optional[str] = None
    wordIndex: Optional[int] = None

def model_to_document(t: TranscriptModel) -> TranscriptDocument:
    """Helper converting ORM TranscriptModel + Segments to strict TranscriptDocument schema."""
    segments_list: list[TranscriptSegment] = []
    for s in t.segments:
        raw_words = s.get_words()
        raw_pauses = s.get_pauses()
        words = [WordItem(**w) for w in raw_words]
        pauses = [PauseItem(**p) for p in raw_pauses]
        segments_list.append(
            TranscriptSegment(
                id=s.id,
                speaker=s.speaker,
                start=s.start,
                end=s.end,
                text=s.text,
                words=words,
                pauses=pauses,
                sentiment=s.sentiment,
                sentimentScore=s.sentiment_score,
            )
        )

    meta_dict = t.get_metadata()
    metadata = TranscriptMetadata(
        language=t.language or meta_dict.get("language", "en"),
        wordCount=meta_dict.get("wordCount", 0),
        pauseCount=meta_dict.get("pauseCount", 0),
        fillerCounts=meta_dict.get("fillerCounts", {}),
        entities=meta_dict.get("entities", []),
        summary=meta_dict.get("summary"),
        actionItems=meta_dict.get("actionItems"),
        chapters=meta_dict.get("chapters"),
    )

    return TranscriptDocument(
        id=t.id,
        title=t.title,
        mediaType=t.media_type,
        mediaUrl=f"/api/media/{t.media_filename}",
        duration=t.duration,
        createdAt=t.created_at,
        status=t.status,
        progress=t.progress,
        segments=segments_list,
        metadata=metadata,
    )

@router.get("", response_model=List[TranscriptDocument])
def list_transcripts(
    status: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List all transcripts ordered by creation time descending, with optional filter/search."""
    query = db.query(TranscriptModel)
    if status and status != "all":
        query = query.filter(TranscriptModel.status == status)
    if q:
        query = query.filter(TranscriptModel.title.ilike(f"%{q}%"))
    transcripts = query.order_by(TranscriptModel.created_at.desc()).all()
    return [model_to_document(t) for t in transcripts]

@router.get("/{transcript_id}", response_model=TranscriptDocument)
def get_transcript(transcript_id: str, db: Session = Depends(get_db)):
    """Retrieve full transcript document with all segments, words, pauses, and metadata."""
    t = db.query(TranscriptModel).filter(TranscriptModel.id == transcript_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transcript not found")
    return model_to_document(t)

@router.patch("/{transcript_id}")
def update_transcript(
    transcript_id: str,
    req: UpdateTranscriptRequest,
    db: Session = Depends(get_db),
):
    """Update title or rename a speaker across all segments in the transcript."""
    t = db.query(TranscriptModel).filter(TranscriptModel.id == transcript_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transcript not found")

    if req.title:
        t.title = req.title

    if req.oldSpeaker and req.newSpeaker:
        for s in t.segments:
            if s.speaker == req.oldSpeaker:
                s.speaker = req.newSpeaker
                # Also update words speaker tag
                words = s.get_words()
                for w in words:
                    if w.get("speaker") == req.oldSpeaker:
                        w["speaker"] = req.newSpeaker
                s.set_words(words)

    db.commit()
    return {"status": "updated", "id": transcript_id}

@router.patch("/{transcript_id}/segments/{segment_id}")
def update_segment(
    transcript_id: str,
    segment_id: str,
    req: UpdateSegmentRequest,
    db: Session = Depends(get_db),
):
    """Edit text or speaker for an individual segment inline."""
    s = (
        db.query(SegmentModel)
        .filter(SegmentModel.transcript_id == transcript_id, SegmentModel.id == segment_id)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Segment not found")

    if req.text is not None:
        s.text = req.text
    if req.speaker is not None:
        s.speaker = req.speaker

    db.commit()
    return {"status": "segment updated", "id": segment_id}

@router.delete("/{transcript_id}")
def delete_transcript(transcript_id: str, db: Session = Depends(get_db)):
    """Delete a transcript and clean up associated audio/video files from disk."""
    t = db.query(TranscriptModel).filter(TranscriptModel.id == transcript_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transcript not found")

    # Clean media files
    for fn in [t.media_filename, t.normalized_audio_filename]:
        if fn:
            p = settings.media_dir / fn
            if p.exists():
                try:
                    p.unlink()
                except Exception:
                    pass

    db.delete(t)
    db.commit()
    return {"status": "deleted", "id": transcript_id}


@router.post("/{transcript_id}/auto-diarize", response_model=TranscriptDocument)
async def auto_diarize_transcript(
    transcript_id: str,
    req: AutoDiarizeRequest,
    db: Session = Depends(get_db),
):
    """
    Uses Groq Llama 3.3 70B (or rule-based fallback) to analyze conversation turns,
    split merged segments, and assign Speaker 1 vs Speaker 2 (or detected speaker names).
    """
    t = db.query(TranscriptModel).filter(TranscriptModel.id == transcript_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transcript not found")

    from ..services.groq_diarizer import diarize_transcript_with_groq
    success, message, _ = await diarize_transcript_with_groq(
        transcript_id=transcript_id,
        api_key=req.apiKey,
        model=req.model,
    )
    if not success:
        raise HTTPException(status_code=500, detail=message)

    db.refresh(t)
    return model_to_document(t)


@router.post("/{transcript_id}/segments/{segment_id}/split", response_model=TranscriptDocument)
def split_segment(
    transcript_id: str,
    segment_id: str,
    req: SplitSegmentRequest,
    db: Session = Depends(get_db),
):
    """
    Splits an individual segment into two distinct segments at a specific word timestamp.
    Assigns the second segment to the other speaker.
    """
    t = db.query(TranscriptModel).filter(TranscriptModel.id == transcript_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transcript not found")

    s = (
        db.query(SegmentModel)
        .filter(SegmentModel.transcript_id == transcript_id, SegmentModel.id == segment_id)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Segment not found")

    words = s.get_words()
    if len(words) < 2:
        raise HTTPException(status_code=400, detail="Segment has too few words to split")

    split_idx = None
    if req.wordId:
        for idx, w in enumerate(words):
            if w.get("id") == req.wordId:
                split_idx = idx
                break
    elif req.wordIndex is not None:
        split_idx = req.wordIndex

    if split_idx is None or split_idx <= 0 or split_idx >= len(words):
        raise HTTPException(status_code=400, detail=f"Invalid split index: {split_idx}")

    from ..services.nlp import detect_pauses, flag_fillers_in_words, analyze_sentiment
    import uuid
    import json

    words_part1 = words[:split_idx]
    words_part2 = words[split_idx:]

    text_part1 = " ".join(w["word"] for w in words_part1)
    text_part2 = " ".join(w["word"] for w in words_part2)

    sent1, score1 = analyze_sentiment(text_part1)
    sent2, score2 = analyze_sentiment(text_part2)

    pauses1 = detect_pauses(words_part1)
    pauses2 = detect_pauses(words_part2)

    other_speaker = "Speaker 2" if s.speaker == "Speaker 1" else "Speaker 1"

    # Shift order_index of all subsequent segments by +1
    subsequent = (
        db.query(SegmentModel)
        .filter(SegmentModel.transcript_id == transcript_id, SegmentModel.order_index > s.order_index)
        .all()
    )
    for sub in subsequent:
        sub.order_index += 1

    # Update part 1
    s.end = words_part1[-1]["end"]
    s.text = text_part1
    s.set_words(words_part1)
    s.set_pauses([p.model_dump() for p in pauses1])
    s.sentiment = sent1
    s.sentiment_score = score1

    # Insert part 2
    new_seg_id = f"seg-{s.order_index + 1:03d}-{uuid.uuid4().hex[:4]}"
    new_seg = SegmentModel(
        id=new_seg_id,
        transcript_id=transcript_id,
        order_index=s.order_index + 1,
        speaker=other_speaker,
        start=words_part2[0]["start"],
        end=words_part2[-1]["end"],
        text=text_part2,
        words_json=json.dumps(words_part2),
        pauses_json=json.dumps([p.model_dump() for p in pauses2]),
        sentiment=sent2,
        sentiment_score=score2,
    )
    db.add(new_seg)
    db.commit()

    db.refresh(t)
    return model_to_document(t)
