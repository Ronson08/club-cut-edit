import json
from datetime import datetime
from sqlalchemy import Column, String, Float, Integer, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from ..database import Base

class TranscriptModel(Base):
    __tablename__ = "transcripts"

    id = Column(String(36), primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    media_type = Column(String(10), nullable=False)  # audio | video
    media_filename = Column(String(255), nullable=False)
    normalized_audio_filename = Column(String(255), nullable=True)
    duration = Column(Float, default=0.0)
    created_at = Column(String(50), default=lambda: datetime.utcnow().isoformat() + "Z")
    status = Column(String(20), default="queued", index=True)  # queued, processing, completed, failed
    progress = Column(Float, default=0.0)
    language = Column(String(10), default="en")
    
    # Store rich summary, action items, chapters, filler counts, entities
    metadata_json = Column(Text, default="{}")

    # Relationship to ordered segments
    segments = relationship(
        "SegmentModel",
        back_populates="transcript",
        cascade="all, delete-orphan",
        order_by="SegmentModel.order_index",
    )

    def get_metadata(self) -> dict:
        try:
            return json.loads(self.metadata_json or "{}")
        except Exception:
            return {}

    def set_metadata(self, data: dict):
        self.metadata_json = json.dumps(data)


class SegmentModel(Base):
    __tablename__ = "segments"

    id = Column(String(36), primary_key=True, index=True)
    transcript_id = Column(String(36), ForeignKey("transcripts.id", ondelete="CASCADE"), index=True, nullable=False)
    order_index = Column(Integer, default=0, index=True)
    speaker = Column(String(50), default="Speaker 1")
    start = Column(Float, nullable=False)
    end = Column(Float, nullable=False)
    text = Column(Text, nullable=False)
    
    # JSON list of WordItem objects {id, word, start, end, confidence, isFiller, speaker}
    words_json = Column(Text, default="[]")
    
    # JSON list of PauseItem objects {id, type, start, end, duration}
    pauses_json = Column(Text, default="[]")
    
    sentiment = Column(String(20), default="neutral")
    sentiment_score = Column(Float, default=0.0)

    transcript = relationship("TranscriptModel", back_populates="segments")

    def get_words(self) -> list:
        try:
            return json.loads(self.words_json or "[]")
        except Exception:
            return []

    def set_words(self, words: list):
        self.words_json = json.dumps(words)

    def get_pauses(self) -> list:
        try:
            return json.loads(self.pauses_json or "[]")
        except Exception:
            return []

    def set_pauses(self, pauses: list):
        self.pauses_json = json.dumps(pauses)
