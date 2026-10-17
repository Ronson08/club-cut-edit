import re
import uuid
from typing import Optional, Tuple
from ..schemas.transcript import WordItem, PauseItem

# Known filler patterns (single words and multi-word phrases)
SINGLE_FILLERS = {
    "um", "uh", "er", "ah", "hmm", "like", "actually", "basically", "literally",
}

MULTI_FILLERS = [
    r"\byou know\b",
    r"\bi mean\b",
    r"\bsort of\b",
    r"\bkind of\b",
]

# Try importing vaderSentiment; provide fallback if not installed yet
try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    _vader_analyzer = SentimentIntensityAnalyzer()
except ImportError:
    _vader_analyzer = None


def is_filler_word(word: str) -> bool:
    """Check if an individual word is a recognized speech filler."""
    cleaned = re.sub(r"[^\w]", "", word.lower().strip())
    return cleaned in SINGLE_FILLERS


def _get_word_str(w) -> str:
    if isinstance(w, dict):
        return str(w.get("word", ""))
    return getattr(w, "word", "")


def _set_word_filler(w, val: bool):
    if isinstance(w, dict):
        w["isFiller"] = val
    else:
        setattr(w, "isFiller", val)


def _get_word_end(w) -> float:
    if isinstance(w, dict):
        return float(w.get("end", 0.0))
    return float(getattr(w, "end", 0.0))


def _get_word_start(w) -> float:
    if isinstance(w, dict):
        return float(w.get("start", 0.0))
    return float(getattr(w, "start", 0.0))


def flag_fillers_in_words(words: list) -> dict[str, int]:
    """
    Tag words as fillers and tally filler counts for analytics.
    Also handles multi-word fillers like 'you know'.
    Supports both WordItem pydantic models and raw dicts.
    """
    counts: dict[str, int] = {}
    
    # 1. Single-word fillers
    for w in words:
        raw_word = _get_word_str(w)
        cleaned = re.sub(r"[^\w]", "", raw_word.lower().strip())
        if cleaned in SINGLE_FILLERS:
            _set_word_filler(w, True)
            counts[cleaned] = counts.get(cleaned, 0) + 1

    # 2. Multi-word phrase fillers
    full_text = " ".join(_get_word_str(w) for w in words).lower()
    for pattern in MULTI_FILLERS:
        matches = re.findall(pattern, full_text)
        if matches:
            label = matches[0]
            counts[label] = counts.get(label, 0) + len(matches)

    return counts


def detect_pauses(words: list, min_pause_duration: float = 0.4) -> list[PauseItem]:
    """
    Calculate silence/pause gaps between consecutive words.
    Returns PauseItem list containing exact start, end, and duration.
    Supports both WordItem pydantic models and raw dicts.
    """
    pauses: list[PauseItem] = []
    if len(words) < 2:
        return pauses

    for i in range(len(words) - 1):
        prev_end = _get_word_end(words[i])
        next_start = _get_word_start(words[i + 1])
        gap = round(next_start - prev_end, 2)
        
        if gap >= min_pause_duration:
            pauses.append(
                PauseItem(
                    id=f"pause-{uuid.uuid4().hex[:8]}",
                    type="pause",
                    start=round(prev_end, 2),
                    end=round(next_start, 2),
                    duration=gap,
                )
            )

    return pauses


def analyze_sentiment(text: str) -> Tuple[str, float]:
    """
    Compute sentiment polarity score for a transcript segment.
    Returns (label: 'positive' | 'neutral' | 'negative', score: float between -1.0 and 1.0)
    """
    if not text.strip():
        return "neutral", 0.0

    if _vader_analyzer:
        scores = _vader_analyzer.polarity_scores(text)
        compound = round(scores["compound"], 2)
        if compound >= 0.05:
            return "positive", compound
        elif compound <= -0.05:
            return "negative", compound
        return "neutral", compound

    # Fast heuristic fallback if vaderSentiment package is not yet loaded
    pos_words = {"good", "great", "excellent", "amazing", "love", "best", "awesome", "perfect", "happy"}
    neg_words = {"bad", "terrible", "horrible", "worst", "hate", "issue", "problem", "fail", "wrong"}
    tokens = set(re.findall(r"\w+", text.lower()))
    pos_count = len(tokens & pos_words)
    neg_count = len(tokens & neg_words)

    if pos_count > neg_count:
        return "positive", 0.5
    elif neg_count > pos_count:
        return "negative", -0.5
    return "neutral", 0.0
