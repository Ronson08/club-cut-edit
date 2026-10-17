import os
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

# Silence benign Windows symlink notice from huggingface_hub
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

# Load .env from backend directory
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

class Settings(BaseModel):
    app_env: str = os.getenv("APP_ENV", "development")
    debug: bool = os.getenv("DEBUG", "True").lower() in ("true", "1", "yes")
    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8000"))
    cors_origins: list[str] = [
        origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
    ]

    # Database: Default zero-setup SQLite with WAL mode & FTS5 support
    database_url: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'data' / 'clubcut.db'}")

    # Storage
    media_dir: Path = BASE_DIR / os.getenv("MEDIA_DIR", "./data/media")
    max_upload_size_mb: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "2048"))

    # Speech-to-Text
    whisper_model: str = os.getenv("WHISPER_MODEL", "base")
    whisper_device: str = os.getenv("WHISPER_DEVICE", "cpu")
    whisper_compute_type: str = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
    whisper_cpu_threads: int = int(os.getenv("WHISPER_CPU_THREADS", "4"))

    # Local LLM (Ollama)
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3.2:latest")

    # Cloud BYOK fallback
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")

    # Groq Cloud (Free Tier Llama 3.3 70B & Whisper Large v3)
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_model: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

settings = Settings()

# Ensure directories exist
settings.media_dir.mkdir(parents=True, exist_ok=True)
(BASE_DIR / "data").mkdir(parents=True, exist_ok=True)
