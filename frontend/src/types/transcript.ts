// ============================================================
// ClubCut Edit — Rich Transcript Data Contract
// Single source of truth for all Frontend & Backend payloads
// ============================================================

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

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export interface TranscriptSegment {
  id: string;
  speaker: string;     // e.g. "Speaker 1"
  start: number;
  end: number;
  text: string;
  words: WordItem[];
  pauses: PauseItem[];
  sentiment?: SentimentLabel;
  sentimentScore?: number; // -1.0 to 1.0
}

export interface EntityItem {
  text: string;
  label: 'PERSON' | 'ORG' | 'GPE' | 'DATE' | 'TIME' | 'MONEY' | 'OTHER';
  start: number; // char offset in full text
  end: number;
}

export interface TranscriptChapter {
  title: string;
  start: number;
  end: number;
}

export interface TranscriptMetadata {
  language: string;
  wordCount: number;
  speakerCount: number;
  duration: number;
  pauseCount: number;
  totalPauseDuration: number;
  fillerCounts: Record<string, number>;   // e.g. { "um": 14, "uh": 9 }
  wordsPerMinute: number;
  entities: EntityItem[];
  summary?: string;
  actionItems?: string[];
  chapters?: TranscriptChapter[];
}

export type TranscriptStatus =
  | 'queued'
  | 'processing'
  | 'paused'
  | 'stopped'
  | 'extracting'     // FFmpeg audio extraction
  | 'transcribing'   // faster-whisper running
  | 'diarizing'      // speaker diarization
  | 'enriching'      // NLP analysis
  | 'completed'
  | 'failed';

export type ProcessingMode = 'quick' | 'deep';
export type MediaType = 'audio' | 'video';
export type SpeakerMode = 'single' | 'multi';

export interface TranscriptDocument {
  id: string;
  title: string;
  mediaType: MediaType;
  mediaUrl: string;          // URL to play the normalized preview file
  originalFilename: string;
  duration: number;          // total seconds
  fileSize: number;          // bytes
  createdAt: string;         // ISO datetime
  updatedAt: string;
  status: TranscriptStatus;
  progress: number;          // 0-100
  progressLabel: string;     // e.g. "Transcribing... 42%"
  mode: ProcessingMode;
  speakerMode: SpeakerMode;
  segments: TranscriptSegment[];
  metadata: TranscriptMetadata;
  error?: string;
}

// WebSocket streaming payload types
export interface WsSegmentEvent {
  type: 'segment';
  jobId: string;
  segment: TranscriptSegment;
}

export interface WsProgressEvent {
  type: 'progress';
  jobId: string;
  status: TranscriptStatus;
  progress: number;
  label: string;
}

export interface WsErrorEvent {
  type: 'error';
  jobId: string;
  message: string;
}

export interface WsCompleteEvent {
  type: 'complete';
  jobId: string;
  transcript: TranscriptDocument;
}

export type WsEvent = WsSegmentEvent | WsProgressEvent | WsErrorEvent | WsCompleteEvent;

// Upload configuration
export interface UploadConfig {
  file: File;
  title: string;
  mode: ProcessingMode;
  speakerMode: SpeakerMode;
  model?: 'tiny' | 'base' | 'small' | 'medium';
}
