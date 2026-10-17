# 🎬 ClubCut Edit — AI Speech & Media Studio

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10%2B-blue?logo=python&logoColor=white" alt="Python Version" />
  <img src="https://img.shields.io/badge/FastAPI-0.110%2B-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Engine-faster--whisper%20(INT8)-orange" alt="faster-whisper" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
</p>

> **ClubCut Edit** is a high-performance, local-first web application that transforms audio and video into rich, context-aware transcripts. It features word-level timestamps, speaker diarization, pause duration markers, filler word analytics, sentiment scoring, interactive synced playback, and pluggable local AI summaries.

---

## ✨ Key Features

* ⚡ **Local-First & Fast:** Powered by `faster-whisper` (CTranslate2 INT8 quantization) for **4x faster execution on CPU** with 50% less RAM than standard Whisper. No cloud dependency required.
* 🎙️ **Rich Audio Analytics:**
  * **Word-level timestamps** with confidence scoring
  * **Pause detection:** Visual markers indicating conversational silence/gaps
  * **Filler word tracking:** Instant detection of verbal pauses (*"um"*, *"uh"*, *"you know"*, *"like"*, etc.)
  * **Pacing & Sentiment:** Real-time Words-Per-Minute (WPM) calculations and VADER segment sentiment scoring.
* 👥 **Speaker Diarization:** Distinguishes speakers across podcast episodes, interviews, and multi-speaker recordings.
* ⏯️ **Synchronized Playback:** Interactive, click-to-seek transcript chips synced seamlessly with the audio player. Includes full playback speed control (0.5x – 2x).
* 🤖 **Local AI & Executive Summaries:** Integrates with local **Ollama** (`llama3.2`, `phi-3`) or custom API keys for offline TL;DR summaries, key takeaways, and chapter generation.
* 📤 **Multi-Format Export Hub:** One-click exports to **Markdown**, **SRT subtitles**, **WebVTT**, and structured **JSON**.
* 🎨 **Modern Glassmorphic UI:** Built with custom CSS design tokens, smooth dark/light themes, keyboard shortcuts, and zero CSS bloat.

---

## 🏗️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                               FRONTEND                                 │
│                      Vite + React (TypeScript)                         │
│  · Dark/Light Mode   · Synced A/V Player   · Inline Rich Transcript    │
│  · Search (FTS)      · Real-time WebSocket Stream  · Export Hub        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP REST + WebSocket
┌───────────────────────────────────▼────────────────────────────────────┐
│                                BACKEND                                 │
│                            FastAPI (Python)                            │
│  · Audio Extraction Pipeline (FFmpeg)  · Streaming WebSocket Hub       │
│  · Background Job Queue (ProcessPool)  · Export Engine (SRT/MD/JSON)   │
└───────┬───────────────────────────┬───────────────────────────┬────────┘
        │                           │                           │
┌───────▼──────────────┐   ┌────────▼─────────────┐   ┌─────────▼────────┐
│ TRANSCRIPTION ENGINE │   │     FAST NLP / ML    │   │  LOCAL AI (LLM)  │
│   faster-whisper     │   │ · Pauses (Silero-VAD)│   │  Ollama / BYOK   │
│ (CTranslate2 INT8)   │   │ · Filler Detection   │   │ · Executive TL;DR│
│ · Native Streaming   │   │ · VADER / TextBlob   │   │ · Q&A Chat Agent │
│ · Diarization        │   │ · WPM Pacing Stats   │   │ · Action Items   │
└──────────────────────┘   └──────────────────────┘   └──────────────────┘
        │                                                       │
┌───────▼───────────────────────────────────────────────────────▼────────┐
│                                STORAGE                                 │
│  · Database: SQLite + WAL Mode (with FTS5 Full-Text Search)            │
│  · Media Store: Standardized 16kHz Mono PCM Audio & Web Previews       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

Ensure you have the following installed on your machine:
* **[Python 3.10+](https://www.python.org/)**
* **[Node.js 18+](https://nodejs.org/)**
* **[FFmpeg](https://ffmpeg.org/)** (must be available in your system `PATH`)
* *(Optional)* **[Ollama](https://ollama.ai/)** for offline AI summaries

---

### Option 1: One-Click Launch (Windows)

Simply double-click or run the launcher script from the project root:

**Using Command Prompt / Batch:**
```cmd
run_app.bat
```

**Using PowerShell:**
```powershell
.\run_app.ps1
```

The script will verify your dependencies, release required ports, start both the FastAPI backend and React frontend, and open your browser automatically.

---

### Option 2: Manual Setup

#### 1. Backend Setup
```bash
# Navigate to backend
cd backend

# Create and activate virtual environment
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
* Backend API runs at: `http://localhost:8000`
* Interactive API Documentation (Swagger): `http://localhost:8000/docs`

#### 2. Frontend Setup
```bash
# Navigate to frontend (in a new terminal)
cd frontend

# Install packages
npm install

# Start Vite dev server
npm run dev
```
* Frontend application runs at: `http://localhost:5173`

---

## ⚙️ Configuration

Copy the example environment configuration in the `backend/` folder:

```bash
cp backend/.env.example backend/.env
```

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `WHISPER_MODEL` | `base` | Whisper model size (`tiny`, `base`, `small`, `medium`, `large-v3`) |
| `WHISPER_DEVICE` | `cpu` | Execution hardware: `cpu` or `cuda` |
| `WHISPER_COMPUTE_TYPE`| `int8` | Precision: `int8`, `float16`, or `float32` |
| `OLLAMA_BASE_URL` | `http://localhost:11434`| Ollama endpoint for local LLM processing |
| `OLLAMA_MODEL` | `llama3.2` | Model name for summaries and Q&A |
| `GROQ_API_KEY` | *(optional)* | API key if utilizing cloud Groq Whisper/Diarization |

---

## 📂 Project Structure

```text
club_cut_edit/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI application entry point
│   │   ├── config.py            # App settings & environment loader
│   │   ├── database.py          # SQLAlchemy SQLite connection & sessions
│   │   ├── models/              # Database models (Transcript, Segment, etc.)
│   │   ├── schemas/             # Pydantic data schemas
│   │   ├── routers/             # API endpoints (upload, transcribe, exports, ai)
│   │   └── services/            # faster-whisper, FFmpeg media, NLP, Ollama
│   ├── data/                    # Local storage (SQLite DB, media files)
│   └── requirements.txt         # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/          # Reusable UI components (Header, Sidebar, Player)
│   │   ├── pages/               # HomePage, UploadPage, TranscriptPage, HistoryPage
│   │   ├── contexts/            # ThemeContext (Dark / Light mode)
│   │   ├── services/            # Axios API & WebSocket clients
│   │   ├── styles/              # Design system tokens and CSS variables
│   │   └── types/               # TypeScript definitions
│   ├── package.json             # Frontend dependencies & scripts
│   └── vite.config.ts           # Vite configuration
├── run_app.bat                  # One-click Windows batch launcher
├── run_app.ps1                  # One-click PowerShell launcher
├── .gitignore                   # Safe Git filtering for secrets, DB, and media
└── README.md                    # Project documentation
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Space</kbd> | Play / Pause audio playback |
| <kbd>←</kbd> / <kbd>→</kbd> | Jump backward / forward 5 seconds |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> | Search within transcript |
| <kbd>Esc</kbd> | Clear search / close modals |

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).