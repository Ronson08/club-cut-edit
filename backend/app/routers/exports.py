from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import PlainTextResponse, JSONResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.transcript import TranscriptModel
from .transcripts import model_to_document
from ..services.exporter import export_srt, export_vtt, export_txt, export_markdown

router = APIRouter(prefix="/api/transcripts", tags=["exports"])

@router.get("/{transcript_id}/export/{export_format}")
def export_transcript_file(
    transcript_id: str,
    export_format: str,
    db: Session = Depends(get_db),
):
    """Generate and return downloadable SRT, VTT, TXT, MD, or JSON file."""
    t = db.query(TranscriptModel).filter(TranscriptModel.id == transcript_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transcript not found")

    doc = model_to_document(t)
    clean_title = "".join(c for c in doc.title if c.isalnum() or c in (" ", "-", "_")).strip()
    safe_name = clean_title.replace(" ", "_") or "transcript"

    fmt = export_format.lower()
    if fmt == "srt":
        content = export_srt(doc)
        return PlainTextResponse(
            content=content,
            media_type="application/x-subrip",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.srt"'},
        )
    elif fmt == "vtt":
        content = export_vtt(doc)
        return PlainTextResponse(
            content=content,
            media_type="text/vtt",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.vtt"'},
        )
    elif fmt == "txt":
        content = export_txt(doc, include_timestamps=True)
        return PlainTextResponse(
            content=content,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.txt"'},
        )
    elif fmt in ("md", "markdown"):
        content = export_markdown(doc)
        return PlainTextResponse(
            content=content,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.md"'},
        )
    elif fmt == "json":
        return JSONResponse(
            content=doc.model_dump(),
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.json"'},
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format '{fmt}'. Choose srt, vtt, txt, md, or json.")
