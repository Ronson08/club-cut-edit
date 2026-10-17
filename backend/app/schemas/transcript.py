from typing import Optional, Literal, Any
from pydantic import BaseModel, Field

class WordItem(BaseModel):
    id: str
    word: str
    start: float
    end: float
    confidence: float = 1.0
    speaker: Optional[str] = None
    isFiller: bool = False

class PauseItem(BaseModel):
    id: str
    type: Literal["pause"] = "pause"
    start: float
    end: float
    duration: float

class TranscriptSegment(BaseModel):
    id: str
    speaker: str = "Speaker 1"
    start: float
    end: float
    text: str
    words: list[WordItem] = Field(default_factory=list)
    pauses: list[PauseItem] = Field(default_factory=list)
    sentiment: Optional[Literal["positive", "neutral", "negative"]] = "neutral"
    sentimentScore: Optional[float] = 0.0

class EntityItem(BaseModel):
    text: str
    label: str

class ChapterItem(BaseModel):
    title: str
    start: float
    end: float

class TranscriptMetadata(BaseModel):
    language: str = "en"
    wordCount: int = 0
    pauseCount: int = 0
    fillerCounts: dict[str, int] = Field(default_factory=dict)
    entities: list[EntityItem] = Field(default_factory=list)
    summary: Optional[str] = None
    actionItems: Optional[list[str]] = None
    chapters: Optional[list[ChapterItem]] = None

class TranscriptDocument(BaseModel):
    id: str
    title: str
    mediaType: Literal["audio", "video"]
    mediaUrl: str
    duration: float
    createdAt: str
    status: Literal["queued", "processing", "paused", "completed", "failed", "stopped"]
    progress: float = 0.0
    segments: list[TranscriptSegment] = Field(default_factory=list)
    metadata: TranscriptMetadata = Field(default_factory=TranscriptMetadata)

class UploadResponse(BaseModel):
    id: str
    title: str
    mediaType: Literal["audio", "video"]
    mediaUrl: str
    normalizedAudioUrl: str
    duration: float
    status: str

class TranscribeRequest(BaseModel):
    transcriptId: str
    mode: Literal["quick", "deep"] = "quick"
    speakerMode: Literal["single", "multi"] = "single"
    modelSize: str = "base"
    language: Optional[str] = None
    forceRestart: bool = False

class ChatRequest(BaseModel):
    transcriptId: str
    question: str
    model: Optional[str] = None

class ChatResponse(BaseModel):
    answer: str
    sources: list[str] = Field(default_factory=list)
