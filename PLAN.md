# 🎬 ClubCut Edit — AI Rich Transcript Agent

> A full-stack, local-first web application that transforms audio and video into rich, context-aware transcripts with word-level timestamps, speaker diarization, pause duration markers, filler word analytics, sentiment, summaries, and interactive synced playback.

---

## 🏗️ Architecture Overview

```
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
│  · Background Job Queue (ProcessPool)  · Export Engine (SRT/PDF/JSON)  │
└───────┬───────────────────────────┬───────────────────────────┬────────┘
        │                           │                           │
┌───────▼──────────────┐   ┌────────▼─────────────┐   ┌─────────▼────────┐
│ TRANSCRIPTION ENGINE │   │     FAST NLP / ML    │   │  LOCAL AI (LLM)  │
│   faster-whisper     │   │ · Pauses (Silero-VAD)│   │  Ollama / BYOK   │
│ (CTranslate2 INT8)   │   │ · Filler Detection   │   │ · Executive TL;DR│
│ · Native Streaming   │   │ · VADER / TextBlob   │   │ · Q&A Chat Agent │
│ · Diarization (opt)  │   │ · spaCy Named Entity │   │ · Action Items   │
└──────────────────────┘   └──────────────────────┘   └──────────────────┘
        │                                                       │
┌───────▼───────────────────────────────────────────────────────▼────────┐
│                                STORAGE                                 │
│  · Database: SQLAlchemy ORM (SQLite + FTS5 default, PostgreSQL opt-in) │
│  · Media Store: Standardized Web-compatible Audio & Video Previews     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack & Key Choices

| Layer | Selected Tech | Rationale & Advantage |
| :--- | :--- | :--- |
| **Frontend** | Vite + React (TypeScript) | Fast HMR, type-safe data contracts, responsive |
| **Styling** | Vanilla CSS (Tokens & Variables) | Bespoke dark/light glassmorphic UI, zero CSS bloat |
| **Backend** | FastAPI (Python 3.11+) | Native async, high throughput, auto OpenAPI docs |
| **Task Queue** | FastAPI `BackgroundTasks` + `ProcessPool` | Replaces Celery/Redis; 100% stable on native Windows |
| **Speech-to-Text** | `faster-whisper` (CTranslate2 INT8) | **4x faster on CPU**, 50% less RAM than vanilla Whisper |
| **Progressive UX** | Native Segment WebSocket Stream | User reads & interacts within seconds, no waiting |
| **Database** | SQLAlchemy (SQLite + FTS5 / PostgreSQL) | **Zero setup for MVP**; 1-line `.env` switch to Postgres |
| **Local NLP** | Regex + VAD + VADER + spaCy | Instant, offline, zero LLM latency for 80% of analytics |
| **Local LLM** | Ollama (`llama3.2` / `phi-3`) + BYOK | 100% free offline summaries & Q&A chat |
| **Media Processing**| FFmpeg (Standardized 16kHz mono + Web preview) | Audio-first processing saves 90% disk & RAM |

---

## 📋 Strict Data Contract (Rich Transcript Schema)

Defined upfront so Frontend and Backend are 100% aligned from Day 1:

```typescript
export interface WordItem {
  id: string;
  word: string;
  start: number;       // seconds e.g. 14.25
  end: number;         // seconds e.g. 14.80
  confidence: number;  // 0.0 - 1.0
  speaker?: string;
  isFiller?: boolean;
}

export interface PauseItem {
  id: string;
  type: 'pause';
  start: number;
  end: number;
  duration: number;    // seconds e.g. 2.4
}

export interface TranscriptSegment {
  id: string;
  speaker: string;     // e.g. "Speaker 1"
  start: number;
  end: number;
  text: string;
  words: WordItem[];
  pauses: PauseItem[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  sentimentScore?: number;
}

export interface TranscriptDocument {
  id: string;
  title: string;
  mediaType: 'audio' | 'video';
  mediaUrl: string;
  duration: number;
  createdAt: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  segments: TranscriptSegment[];
  metadata: {
    language: string;
    wordCount: number;
    pauseCount: number;
    fillerCounts: Record<string, number>;
    entities: { text: string; label: string }[];
    summary?: string;
    actionItems?: string[];
    chapters?: { title: string; start: number; end: number }[];
  };
}
```

---

## 📦 Feature Roadmap by Phase

### Phase 1 — Foundation, Design System & Interactive Shell ✨
> **Goal:** High-end glassmorphic UI with full dark/light theme, strictly implementing the Data Contract with realistic mock streaming.

- [ ] Initialize Vite + React + TypeScript project
- [ ] Implement bespoke CSS design system (tokens, themes, dark/light toggle, micro-animations)
- [ ] Build global layout: Header, Sidebar, Status bar, Audio-first banner
- [ ] Build **HomePage**: Recent transcripts, quick upload trigger, storage stats
- [ ] Build **UploadModal / UploadPage**:
  - Drag-and-drop audio (MP3, WAV, M4A, AAC) and video (MP4, MKV, WebM)
  - Audio-first optimization tip ("Audio is 10x faster!")
  - Mode selector: **Quick Mode ⚡ (Fast)** vs **Deep Mode 🔬 (Diarization + Full NLP)**
  - Speaker configuration (Single Speaker vs Multi-Speaker)
- [ ] Build **TranscriptViewer Page**:
  - Word-level playback highlighting
  - Inline pause tags (`[2.4s pause]`) with visual duration bars
  - Filler word badges (highlight "um", "uh", "like")
  - Speaker avatar headers with editable names
  - Full-text instant search & filter
- [ ] Build **Interactive Media Player** synced directly with words and pauses
- [ ] Build **Analytics Sidebar**: Filler counts, speaking pace (WPM), sentiment meter, entities
- [ ] Build **Export Dialog** (SRT, VTT, JSON, TXT, PDF mock previews)

---

### Phase 2 — Backend Engine & Media Pipeline
> **Goal:** Rock-solid FastAPI backend with automatic FFmpeg media normalization and database models.

- [ ] FastAPI structure with modular routers (`upload`, `transcribe`, `transcript`, `export`, `chat`)
- [ ] SQLAlchemy database configuration:
  - Default: `sqlite:///./data/clubcut.db` with WAL mode & FTS5 full-text search
  - Production opt-in: `postgresql://...` via `.env`
- [ ] FFmpeg audio extraction pipeline:
  - If video uploaded → extract 16kHz mono WAV for Whisper + lightweight MP4 web preview
  - If audio uploaded → extract 16kHz mono WAV + lightweight MP3 web preview
- [ ] File and transcript CRUD endpoints with Pydantic validation
- [ ] Native background task manager (FastAPI `BackgroundTasks` + `ProcessPoolExecutor` with CPU thread throttling)

---

### Phase 3 — Speech-to-Text with Progressive Streaming
> **Goal:** `faster-whisper` integration streaming live segments directly to the frontend via WebSockets.

- [ ] `faster-whisper` loader (CTranslate2 INT8 quantized, configurable model: `tiny`, `base`, `small`)
- [ ] Segment generator: stream each transcription block as soon as Whisper produces it
- [ ] WebSocket endpoint `/ws/transcribe/{job_id}` transmitting live `WordItem` and `TranscriptSegment` payloads
- [ ] Connect React frontend to WebSocket: transcript grows in real-time as audio plays
- [ ] Optional second-pass Speaker Diarization integration (single-speaker skips this instantly)

---

### Phase 4 — Rule-Based Fast NLP Enrichment
> **Goal:** Instant analytics without LLM overhead.

- [ ] **Silence & Pause Analyzer:** Compute gap times between consecutive words and insert `PauseItem`s
- [ ] **Filler Word Engine:** High-performance regex analyzer for fillers ("um", "uh", "you know", "like", "sort of")
- [ ] **Sentiment Scanner:** VADER / TextBlob segment scoring (positive, neutral, negative)
- [ ] **Entity Extractor:** spaCy lightweight NER for people, organizations, dates, and locations
- [ ] Save all enriched analytics to the transcript record in SQLite/PostgreSQL

---

### Phase 5 — Full Synced Playback & Inline Corrections
> **Goal:** Professional interactive editor.

- [ ] Click-anywhere-to-seek: clicking any word or pause seeks the audio/video player to exact milliseconds
- [ ] Inline word and segment editing with non-destructive timestamp anchoring
- [ ] Auto-scroll transcript with active speaker follow mode
- [ ] Full-text search with live query highlighting and jump-to-result
- [ ] Real-time database sync for all edits

---

### Phase 6 — Export Hub & Pluggable Local AI (Ollama)
> **Goal:** Production exports and free offline AI insights.

- [ ] Exporters:
  - **SRT & VTT** subtitle formats (with customizable word limits per cue)
  - **JSON** (complete structured data with timestamps & metrics)
  - **TXT** (clean speaker-labeled transcript)
  - **PDF** (styled executive summary + transcript report)
- [ ] Pluggable AI Engine:
  - Native local connection to **Ollama** (`llama3.2`, `phi-3`, `mistral`)
  - Optional BYOK slot for OpenAI / Gemini / Claude in Settings
- [ ] AI Summary generation & Action Item extraction
- [ ] Q&A Chat Agent: ask questions against the transcript context

---

### Phase 7 — Polish, Production Readiness & Offline Package
> **Goal:** Error resilience, keyboard shortcuts, and one-click launch.

- [ ] Global keyboard shortcuts (Space: play/pause, J/L: jump 5s, Esc: cancel edit)
- [ ] Toast notification system and loading skeletons
- [ ] CPU core limiting safeguard (prevents system lag)
- [ ] Standalone launcher script (`run_app.bat`) for zero-friction startup
