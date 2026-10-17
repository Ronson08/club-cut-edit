from ..schemas.transcript import TranscriptDocument

def format_timestamp_srt(seconds: float) -> str:
    """Format seconds into SRT timestamp: HH:MM:SS,mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

def format_timestamp_vtt(seconds: float) -> str:
    """Format seconds into WebVTT timestamp: HH:MM:SS.mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"

def export_srt(doc: TranscriptDocument) -> str:
    """Generate valid SRT caption file content."""
    lines = []
    for idx, seg in enumerate(doc.segments, 1):
        start_str = format_timestamp_srt(seg.start)
        end_str = format_timestamp_srt(seg.end)
        lines.append(str(idx))
        lines.append(f"{start_str} --> {end_str}")
        lines.append(f"[{seg.speaker}] {seg.text}")
        lines.append("")  # Empty line between cues
    return "\n".join(lines)

def export_vtt(doc: TranscriptDocument) -> str:
    """Generate valid WebVTT subtitle content."""
    lines = ["WEBVTT", ""]
    for idx, seg in enumerate(doc.segments, 1):
        start_str = format_timestamp_vtt(seg.start)
        end_str = format_timestamp_vtt(seg.end)
        lines.append(str(idx))
        lines.append(f"{start_str} --> {end_str}")
        lines.append(f"<v {seg.speaker}>{seg.text}")
        lines.append("")
    return "\n".join(lines)

def export_txt(doc: TranscriptDocument, include_timestamps: bool = True) -> str:
    """Generate clean plain text transcript."""
    lines = [f"Title: {doc.title}", f"Duration: {doc.duration:.1f}s", f"Date: {doc.createdAt}", "=" * 50, ""]
    for seg in doc.segments:
        if include_timestamps:
            start_m = int(seg.start // 60)
            start_s = int(seg.start % 60)
            lines.append(f"[{start_m:02d}:{start_s:02d}] {seg.speaker}:")
        else:
            lines.append(f"{seg.speaker}:")
        lines.append(seg.text)
        lines.append("")
    return "\n".join(lines)

def export_markdown(doc: TranscriptDocument) -> str:
    """Generate rich Markdown document with metadata, AI summary, chapters, and full transcript."""
    lines = [
        f"# {doc.title}",
        f"**Duration:** {int(doc.duration // 60)}m {int(doc.duration % 60)}s | **Language:** {doc.metadata.language.upper()}",
        "",
    ]
    if doc.metadata.summary:
        lines.extend(["## 📝 Executive Summary", doc.metadata.summary, ""])
    if doc.metadata.actionItems:
        lines.extend(["## 🎯 Action Items", *[f"- [ ] {item}" for item in doc.metadata.actionItems], ""])
    if doc.metadata.chapters:
        lines.extend([
            "## ⏱️ Chapters",
            *[f"- **{int(c.start // 60):02d}:{int(c.start % 60):02d}** — {c.title}" for c in doc.metadata.chapters],
            "",
        ])
    lines.extend(["## 📄 Full Transcript", ""])
    for seg in doc.segments:
        start_m = int(seg.start // 60)
        start_s = int(seg.start % 60)
        lines.append(f"**[{start_m:02d}:{start_s:02d}] {seg.speaker}**: {seg.text}")
        lines.append("")
    return "\n".join(lines)

