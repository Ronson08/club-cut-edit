import uuid
from pathlib import Path
from typing import AsyncGenerator, Optional
from ..config import settings
from ..schemas.transcript import TranscriptSegment, WordItem
from .nlp import flag_fillers_in_words, detect_pauses, analyze_sentiment

# Cache models in memory to avoid reload latency
_model_cache = {}

def get_whisper_model(model_size: str = "base"):
    """Lazy load faster-whisper model with CTranslate2 INT8 CPU optimizations."""
    key = (model_size, settings.whisper_device, settings.whisper_compute_type)
    if key not in _model_cache:
        try:
            from faster_whisper import WhisperModel
            _model_cache[key] = WhisperModel(
                model_size_or_path=model_size,
                device=settings.whisper_device,
                compute_type=settings.whisper_compute_type,
                cpu_threads=settings.whisper_cpu_threads,
            )
        except ImportError:
            raise RuntimeError(
                "faster-whisper is not installed. Please run `pip install faster-whisper`."
            )
    return _model_cache[key]


def stream_transcription(
    audio_path: Path,
    model_size: str = "base",
    language: Optional[str] = None,
    speaker_label: str = "Speaker 1",
):
    """
    Generator that processes audio with faster-whisper and yields fully enriched
    TranscriptSegment objects as soon as each segment completes.
    """
    model = get_whisper_model(model_size)
    
    # Transcribe with word-level timestamps and VAD voice activity filtering
    segments_gen, info = model.transcribe(
        str(audio_path),
        language=language,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=400),
    )

    detected_language = info.language
    duration = info.duration

    for idx, seg in enumerate(segments_gen):
        # 1. Convert faster-whisper words to WordItem schema
        words: list[WordItem] = []
        if seg.words:
            for w in seg.words:
                words.append(
                    WordItem(
                        id=f"w-{uuid.uuid4().hex[:8]}",
                        word=w.word.strip(),
                        start=round(w.start, 2),
                        end=round(w.end, 2),
                        confidence=round(w.probability, 2),
                        speaker=speaker_label,
                        isFiller=False,
                    )
                )

        # 2. Enrich with fast NLP: fillers, silence gaps, and sentiment
        flag_fillers_in_words(words)
        pauses = detect_pauses(words)
        sentiment, sentiment_score = analyze_sentiment(seg.text)

        # 3. Construct rich segment
        segment_obj = TranscriptSegment(
            id=f"seg-{idx + 1:03d}",
            speaker=speaker_label,
            start=round(seg.start, 2),
            end=round(seg.end, 2),
            text=seg.text.strip(),
            words=words,
            pauses=pauses,
            sentiment=sentiment,
            sentimentScore=sentiment_score,
        )

        yield segment_obj, detected_language, duration
