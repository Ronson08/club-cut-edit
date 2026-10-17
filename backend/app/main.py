import sys
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from .config import settings
from .database import init_db
from .routers import (
    upload_router,
    transcribe_router,
    transcripts_router,
    exports_router,
    ai_router,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure database tables & FTS5 search index exist
    init_db()
    yield
    # Shutdown logic if any

app = FastAPI(
    title="ClubCut Edit Backend",
    description="High-performance AI transcription engine with progressive streaming, fast NLP, and local LLM.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount media directory for static audio/video streaming with range requests
app.mount("/api/media", StaticFiles(directory=str(settings.media_dir)), name="media")

# Include API routers
app.include_router(upload_router)
app.include_router(transcribe_router)
app.include_router(transcripts_router)
app.include_router(exports_router)
app.include_router(ai_router)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "app": "ClubCut Edit",
        "version": "1.0.0",
        "whisperModel": settings.whisper_model,
        "database": "SQLite + FTS5" if settings.database_url.startswith("sqlite") else "PostgreSQL",
    }
