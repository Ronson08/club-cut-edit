import json
import logging
import httpx
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict

from ..config import settings
from ..models.transcript import SegmentModel, TranscriptModel
from ..database import SessionLocal
from .nlp import detect_pauses, flag_fillers_in_words, analyze_sentiment

logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
BATCH_SIZE = 25  # Chunks of ~25 segments prevent output token truncation and rate limits


async def test_groq_key(api_key: str, model: Optional[str] = None) -> Tuple[bool, str]:
    """Tests a Groq API key with a fast ping call."""
    if not api_key or not api_key.strip():
        return False, "API key is empty"
    
    selected_model = model or "llama-3.1-8b-instant"
    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": selected_model,
        "messages": [{"role": "user", "content": "Respond with OK"}],
        "max_tokens": 10,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(GROQ_API_URL, headers=headers, json=payload)
            if res.status_code == 200:
                return True, "Valid Groq API key"
            else:
                data = res.json().get("error", {})
                return False, data.get("message", f"Groq HTTP {res.status_code}")
    except Exception as exc:
        return False, f"Connection failed: {str(exc)}"


async def diarize_transcript_with_groq(
    transcript_id: str,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> Tuple[bool, str, List[dict]]:
    """
    Uses Groq Cloud (Llama 3.3 70B or 8B) to analyze dialogue turn-taking, split merged
    multi-speaker segments down to word-level timestamps, and assign speaker identities.
    Falls back to intelligent rule-based dialogue turn separation if Groq API is unavailable.
    """
    key = (api_key or settings.groq_api_key or "").strip()
    selected_model = model or settings.groq_model or "llama-3.3-70b-versatile"

    with SessionLocal() as db:
        t = db.query(TranscriptModel).filter(TranscriptModel.id == transcript_id).first()
        if not t:
            return False, "Transcript not found", []

        transcript_title = t.title or "Podcast Interview"

        segments = (
            db.query(SegmentModel)
            .filter(SegmentModel.transcript_id == transcript_id)
            .order_by(SegmentModel.order_index)
            .all()
        )
        if not segments:
            return False, "No segments found in transcript", []

        # Prepare segment inputs
        segment_data = []
        for s in segments:
            segment_data.append({
                "id": s.id,
                "speaker": s.speaker,
                "text": s.text,
                "start": s.start,
                "end": s.end,
                "words": s.get_words(),
                "pauses": s.get_pauses(),
            })

    if key:
        try:
            logger.info(f"Calling Groq ({selected_model}) for transcript {transcript_id} ({len(segment_data)} segments)")
            success, msg, new_segments = await _process_segments_in_chunks_with_groq(
                segment_data=segment_data,
                api_key=key,
                model=selected_model,
                title=transcript_title,
            )
            if success and new_segments:
                _save_diarized_segments(transcript_id, new_segments)
                return True, f"Successfully separated speakers with Groq {selected_model}", new_segments
            else:
                logger.warning(f"Groq API returned error or empty: {msg}. Falling back to rule-based diarizer.")
        except Exception as exc:
            logger.exception(f"Groq API call failed: {exc}. Falling back to rule-based diarizer.")

    # Rule-based turn-taking fallback
    logger.info(f"Using rule-based turn-taking analyzer for transcript {transcript_id}")
    new_segments = _rule_based_diarize(segment_data)
    _save_diarized_segments(transcript_id, new_segments)
    used_groq = bool(key)
    msg = (
        "Separated speakers via local rule-based turn analyzer"
        if not used_groq
        else "Groq API encountered an issue; cleanly separated via local turn analyzer"
    )
    return True, msg, new_segments


async def _process_segments_in_chunks_with_groq(
    segment_data: List[dict],
    api_key: str,
    model: str,
    title: str,
) -> Tuple[bool, str, List[dict]]:
    """
    Processes segments in sequential batches of 25.
    Preserves discovered speaker names across batches so identity remains consistent.
    """
    all_groq_splits = []
    known_speakers = []

    # Chunk segments
    chunks = [segment_data[i:i + BATCH_SIZE] for i in range(0, len(segment_data), BATCH_SIZE)]

    for chunk_idx, chunk in enumerate(chunks):
        success, msg, chunk_splits = await _call_groq_llm(
            chunk_segments=chunk,
            api_key=api_key,
            model=model,
            title=title,
            known_speakers=known_speakers,
            chunk_idx=chunk_idx,
            total_chunks=len(chunks),
        )
        if not success:
            return False, msg, []

        all_groq_splits.extend(chunk_splits)

        # Update known speakers from this chunk
        for item in chunk_splits:
            spk = item.get("speaker")
            if spk and spk not in known_speakers:
                known_speakers.append(spk)

    # Reconstruct all segments with exact word-level millisecond timestamps
    reconstructed = _reconstruct_segments_with_words(segment_data, all_groq_splits)
    return True, "OK", reconstructed


async def _call_groq_llm(
    chunk_segments: List[dict],
    api_key: str,
    model: str,
    title: str,
    known_speakers: List[str],
    chunk_idx: int,
    total_chunks: int,
) -> Tuple[bool, str, List[dict]]:
    """Sends a batch of segments to Groq and parses the split instructions."""
    input_items = [
        {"orig_id": s["id"], "text": s["text"]}
        for s in chunk_segments
    ]

    speakers_hint = ""
    if known_speakers:
        speakers_hint = f"\nPreviously identified speakers in this episode: {', '.join(known_speakers)}. Use these exact speaker names for continuity."

    system_prompt = (
        "You are an expert dialogue editor and speaker diarization engine for podcast transcripts.\n"
        f"Episode Title: '{title}'.{speakers_hint}\n\n"
        "YOUR TASKS:\n"
        "1. Identify dialogue turns between speakers. If names are known from the episode title or conversation (e.g. Host and Guest, or Raj Shamani and Dr. Sahar Yousef), use those names. Otherwise use 'Speaker 1' / 'Speaker 2'.\n"
        "2. If a single segment contains dialogue from TWO different speakers (for example a question ending, immediately followed by the other person's answer like '...nine weeks. Yes.'), SPLIT it into separate segments with the exact text spoken by each.\n"
        "3. Output ONLY a valid JSON object with key 'segments' containing a list of objects:\n"
        '   {"orig_id": string, "speaker": string, "text": string}\n'
        "CRITICAL: Do NOT invent, drop, or alter any spoken words. Preserve exact wording so timestamps remain perfectly aligned."
    )

    prompt = (
        f"Chunk {chunk_idx + 1} of {total_chunks}:\n"
        f"Transcript Segments:\n{json.dumps(input_items, ensure_ascii=False)}"
    )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "max_tokens": 4096,
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        res = await client.post(GROQ_API_URL, headers=headers, json=payload)
        if res.status_code != 200:
            return False, f"Groq HTTP {res.status_code}: {res.text}", []

        data = res.json()
        content_text = data["choices"][0]["message"]["content"]

    # Parse JSON safely, handling markdown codeblocks if present
    clean_json_str = content_text.strip()
    if clean_json_str.startswith("```"):
        lines = clean_json_str.split("\n")
        # Remove first line (```json) and last line (```)
        if len(lines) >= 3:
            clean_json_str = "\n".join(lines[1:-1])

    try:
        parsed = json.loads(clean_json_str)
    except Exception as err:
        logger.error(f"Failed to parse Groq response JSON: {err}. Raw: {content_text[:300]}")
        return False, f"JSON parse error: {str(err)}", []

    if isinstance(parsed, list):
        groq_segments = parsed
    else:
        groq_segments = parsed.get("segments") or parsed.get("dialogue") or []

    if not groq_segments:
        return False, "Groq returned empty segment list", []

    return True, "OK", groq_segments


def _reconstruct_segments_with_words(original_segments: List[dict], groq_segments: List[dict]) -> List[dict]:
    """Matches Llama-split texts against original word timestamp arrays to preserve millisecond timing."""
    orig_map = {s["id"]: s for s in original_segments}
    result = []
    order_idx = 0

    # Group groq segments by original ID
    grouped = defaultdict(list)
    for g in groq_segments:
        grouped[g.get("orig_id")].append(g)

    for orig_id, orig_item in orig_map.items():
        splits = grouped.get(orig_id, [])
        orig_words = orig_item.get("words", [])

        if not splits or len(splits) == 1:
            # Not split: keep original words and update speaker
            order_idx += 1
            spk = splits[0].get("speaker") if splits else orig_item["speaker"]
            spk = spk or "Speaker 1"

            # Update speaker tag on each word
            for w in orig_words:
                if isinstance(w, dict):
                    w["speaker"] = spk
                else:
                    w.speaker = spk

            result.append({
                "id": f"seg-{order_idx:03d}",
                "order_index": order_idx,
                "speaker": spk,
                "start": orig_item["start"],
                "end": orig_item["end"],
                "text": orig_item["text"],
                "words": orig_words,
                "pauses": orig_item.get("pauses", []),
                "sentiment": orig_item.get("sentiment", "neutral"),
                "sentiment_score": orig_item.get("sentiment_score", 0.0),
            })
            continue

        # Split into multiple segments
        word_cursor = 0
        total_words_count = len(orig_words)

        for split_item in splits:
            order_idx += 1
            split_text_clean = split_item["text"].strip()
            split_word_count = len(split_text_clean.split())
            spk = split_item.get("speaker") or "Speaker 1"

            # For the last split item in this group, take all remaining words to ensure none are lost
            if split_item is splits[-1]:
                slice_end = total_words_count
            else:
                slice_end = min(total_words_count, word_cursor + split_word_count)

            sliced_words = orig_words[word_cursor:slice_end]
            word_cursor = slice_end

            # Update speaker tag on sliced words
            for w in sliced_words:
                if isinstance(w, dict):
                    w["speaker"] = spk
                else:
                    w.speaker = spk

            if sliced_words:
                w_start = sliced_words[0].get("start") if isinstance(sliced_words[0], dict) else sliced_words[0].start
                w_end = sliced_words[-1].get("end") if isinstance(sliced_words[-1], dict) else sliced_words[-1].end
                sub_start = w_start
                sub_end = w_end
            else:
                sub_start = orig_item["start"]
                sub_end = orig_item["end"]

            flag_fillers_in_words(sliced_words)
            sub_pauses = detect_pauses(sliced_words)
            sent, sent_score = analyze_sentiment(split_text_clean)

            result.append({
                "id": f"seg-{order_idx:03d}",
                "order_index": order_idx,
                "speaker": spk,
                "start": sub_start,
                "end": sub_end,
                "text": split_text_clean,
                "words": sliced_words,
                "pauses": [p.model_dump() if hasattr(p, "model_dump") else p for p in sub_pauses],
                "sentiment": sent,
                "sentiment_score": sent_score,
            })

    return result


def _rule_based_diarize(original_segments: List[dict]) -> List[dict]:
    """
    Intelligent turn-taking heuristics:
    1. Splits segments at pause gaps >= 0.4s that follow sentence-ending punctuation or precede short affirmations.
    2. Alternates speaker tags on question marks and dialogue boundaries.
    """
    AFFIRMATIONS = {"yes", "yeah", "no", "nope", "right", "exactly", "sure", "correct", "absolutely", "okay"}
    current_speaker = "Speaker 1"
    result = []
    order_idx = 0

    for item in original_segments:
        words = item.get("words", [])
        if not words:
            order_idx += 1
            result.append({
                "id": f"seg-{order_idx:03d}",
                "order_index": order_idx,
                "speaker": current_speaker,
                "start": item["start"],
                "end": item["end"],
                "text": item["text"],
                "words": [],
                "pauses": item.get("pauses", []),
                "sentiment": "neutral",
                "sentiment_score": 0.0,
            })
            continue

        # Check for split candidate inside words
        split_indices = []
        for i in range(len(words) - 1):
            curr_w = words[i]
            next_w = words[i + 1]
            w_curr_str = curr_w.get("word", "") if isinstance(curr_w, dict) else curr_w.word
            w_next_str = next_w.get("word", "") if isinstance(next_w, dict) else next_w.word
            w_curr_end = curr_w.get("end", 0.0) if isinstance(curr_w, dict) else curr_w.end
            w_next_start = next_w.get("start", 0.0) if isinstance(next_w, dict) else next_w.start

            gap = w_next_start - w_curr_end
            word_clean = w_next_str.lower().strip(".,!?\"'")

            # Split if pause gap >= 0.35s and next word is affirmation or previous ends with punctuation
            if gap >= 0.35 and (word_clean in AFFIRMATIONS or w_curr_str.endswith((".", "?", "!"))):
                split_indices.append(i + 1)

        if not split_indices:
            # Whole segment
            order_idx += 1
            # If previous ended with question mark, switch speaker
            if result and result[-1]["text"].strip().endswith("?"):
                current_speaker = "Speaker 2" if current_speaker == "Speaker 1" else "Speaker 1"

            for w in words:
                if isinstance(w, dict):
                    w["speaker"] = current_speaker
                else:
                    w.speaker = current_speaker

            result.append({
                "id": f"seg-{order_idx:03d}",
                "order_index": order_idx,
                "speaker": current_speaker,
                "start": item["start"],
                "end": item["end"],
                "text": item["text"],
                "words": words,
                "pauses": item.get("pauses", []),
                "sentiment": item.get("sentiment", "neutral"),
                "sentiment_score": item.get("sentiment_score", 0.0),
            })
            if item["text"].strip().endswith("?"):
                current_speaker = "Speaker 2" if current_speaker == "Speaker 1" else "Speaker 1"
        else:
            # Perform split
            boundaries = [0] + split_indices + [len(words)]
            for b_idx in range(len(boundaries) - 1):
                start_i = boundaries[b_idx]
                end_i = boundaries[b_idx + 1]
                sub_words = words[start_i:end_i]
                if not sub_words:
                    continue

                order_idx += 1
                for w in sub_words:
                    if isinstance(w, dict):
                        w["speaker"] = current_speaker
                    else:
                        w.speaker = current_speaker

                sub_text = " ".join(w.get("word", "") if isinstance(w, dict) else w.word for w in sub_words)
                flag_fillers_in_words(sub_words)
                sub_pauses = detect_pauses(sub_words)
                sent, sent_score = analyze_sentiment(sub_text)

                w_start = sub_words[0].get("start") if isinstance(sub_words[0], dict) else sub_words[0].start
                w_end = sub_words[-1].get("end") if isinstance(sub_words[-1], dict) else sub_words[-1].end

                result.append({
                    "id": f"seg-{order_idx:03d}",
                    "order_index": order_idx,
                    "speaker": current_speaker,
                    "start": w_start,
                    "end": w_end,
                    "text": sub_text,
                    "words": sub_words,
                    "pauses": [p.model_dump() if hasattr(p, "model_dump") else p for p in sub_pauses],
                    "sentiment": sent,
                    "sentiment_score": sent_score,
                })
                # Toggle speaker after split
                current_speaker = "Speaker 2" if current_speaker == "Speaker 1" else "Speaker 1"

    return result


def _save_diarized_segments(transcript_id: str, new_segments: List[dict]):
    """Wipes old segments and persists new diarized/split segments into SQLite atomically."""
    with SessionLocal() as db:
        # Delete old segments
        db.query(SegmentModel).filter(SegmentModel.transcript_id == transcript_id).delete()

        # Insert new segments
        for seg in new_segments:
            db_seg = SegmentModel(
                id=seg["id"],
                transcript_id=transcript_id,
                order_index=seg["order_index"],
                speaker=seg["speaker"],
                start=seg["start"],
                end=seg["end"],
                text=seg["text"],
                words_json=json.dumps(seg.get("words", [])),
                pauses_json=json.dumps(seg.get("pauses", [])),
                sentiment=seg.get("sentiment", "neutral"),
                sentiment_score=seg.get("sentiment_score", 0.0),
            )
            db.add(db_seg)

        # Update transcript metadata with speaker count
        t = db.query(TranscriptModel).filter(TranscriptModel.id == transcript_id).first()
        if t:
            meta = t.get_metadata()
            unique_speakers = list({s["speaker"] for s in new_segments})
            meta["speakers"] = unique_speakers
            meta["speakerCount"] = len(unique_speakers)
            t.set_metadata(meta)

        db.commit()
