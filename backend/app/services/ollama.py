import json
import httpx
from typing import Optional, Tuple
from ..config import settings
from ..schemas.transcript import ChapterItem

async def is_ollama_available() -> bool:
    """Check if the local Ollama server is running and responding."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False

async def generate_ai_summary(
    full_text: str,
    model: Optional[str] = None,
) -> Tuple[str, list[str], list[ChapterItem]]:
    """
    Generate an Executive Summary, Action Items, and Chapters from transcript text.
    Uses local Ollama if available, otherwise generates a clean extractive summary.
    """
    model_name = model or settings.ollama_model
    ollama_ok = await is_ollama_available()

    if ollama_ok:
        prompt = f"""
You are an expert audio/video editor and content analyst.
Given the following transcript, provide:
1. A concise 2-paragraph executive summary.
2. A bullet list of 3-5 concrete action items or key takeaways.
3. 3-5 key chapter markers with approximate titles.

Transcript:
\"\"\"{full_text[:6000]}\"\"\"

Format your output strictly as JSON with keys:
"summary": "...",
"action_items": ["item 1", "item 2", ...],
"chapters": [{"title": "Chapter title", "start": 0.0, "end": 60.0}, ...]
"""
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                res = await client.post(
                    f"{settings.ollama_base_url}/api/generate",
                    json={
                        "model": model_name,
                        "prompt": prompt,
                        "format": "json",
                        "stream": False,
                    },
                )
                if res.status_code == 200:
                    data = res.json()
                    parsed = json.loads(data.get("response", "{}"))
                    summary = parsed.get("summary", "")
                    actions = parsed.get("action_items", [])
                    raw_chaps = parsed.get("chapters", [])
                    chapters = [
                        ChapterItem(
                            title=c.get("title", f"Chapter {i+1}"),
                            start=float(c.get("start", 0)),
                            end=float(c.get("end", 60)),
                        )
                        for i, c in enumerate(raw_chaps)
                    ]
                    if summary:
                        return summary, actions, chapters
        except Exception:
            pass

    # Heuristic fallback when Ollama is offline:
    sentences = [s.strip() for s in full_text.split(".") if len(s.strip()) > 20]
    summary_text = " ".join(sentences[:3]) + "." if sentences else "Audio transcript processed successfully."
    fallback_actions = [
        "Review speech fillers and pause timings in the interactive viewer",
        "Export polished captions in SRT/VTT format for publishing",
        "Verify speaker name labels and inline edits before finalizing",
    ]
    fallback_chapters = [
        ChapterItem(title="Introduction & Overview", start=0.0, end=45.0),
        ChapterItem(title="Core Discussion", start=45.0, end=150.0),
        ChapterItem(title="Closing Remarks", start=150.0, end=240.0),
    ]

    return summary_text, fallback_actions, fallback_chapters


async def query_transcript_chat(
    transcript_text: str,
    question: str,
    model: Optional[str] = None,
) -> str:
    """
    RAG-style query to answer user questions about transcript content.
    """
    model_name = model or settings.ollama_model
    ollama_ok = await is_ollama_available()

    if ollama_ok:
        prompt = f"""
You are an intelligent transcript assistant. Answer the user's question directly and concisely based ONLY on the transcript context provided below.
If the answer cannot be found, state clearly that it is not covered in this audio.

Context Transcript:
\"\"\"{transcript_text[:7000]}\"\"\"

User Question: {question}
Answer:"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(
                    f"{settings.ollama_base_url}/api/generate",
                    json={
                        "model": model_name,
                        "prompt": prompt,
                        "stream": False,
                    },
                )
                if res.status_code == 200:
                    return res.json().get("response", "").strip()
        except Exception as e:
            return f"Ollama connection error: {str(e)}. Please make sure Ollama is running (`ollama serve`)."

    return f"Ollama is currently not running at {settings.ollama_base_url}. Start Ollama (`ollama run llama3.2`) to enable offline AI Q&A, or set your OpenAI API key in Settings."
