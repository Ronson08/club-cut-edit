import type { TranscriptDocument } from '../types/transcript';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

export async function uploadMedia(
  file: File,
  title?: string,
  signal?: AbortSignal
): Promise<{
  id: string;
  title: string;
  mediaType: 'audio' | 'video';
  mediaUrl: string;
  normalizedAudioUrl: string;
  duration: number;
  status: string;
}> {
  const formData = new FormData();
  formData.append('file', file);
  if (title) formData.append('title', title);

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(err.detail || 'Upload failed');
  }

  return res.json();
}

export async function startTranscription(
  transcriptId: string,
  mode: 'quick' | 'deep' = 'quick',
  speakerMode: 'single' | 'multi' = 'single',
  modelSize: string = 'base',
  forceRestart: boolean = false
) {
  const res = await fetch(`${API_BASE}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcriptId, mode, speakerMode, modelSize, forceRestart }),
  });
  return res.json();
}

export async function fetchTranscripts(status?: string, q?: string): Promise<TranscriptDocument[]> {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.append('status', status);
  if (q) params.append('q', q);

  const res = await fetch(`${API_BASE}/api/transcripts?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to load transcripts');
  return res.json();
}

export async function fetchTranscript(id: string): Promise<TranscriptDocument> {
  const res = await fetch(`${API_BASE}/api/transcripts/${id}`);
  if (!res.ok) throw new Error('Transcript not found');
  return res.json();
}

export async function updateTranscript(
  id: string,
  updates: { title?: string; oldSpeaker?: string; newSpeaker?: string }
) {
  const res = await fetch(`${API_BASE}/api/transcripts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function updateSegment(
  transcriptId: string,
  segmentId: string,
  updates: { text?: string; speaker?: string }
) {
  const res = await fetch(`${API_BASE}/api/transcripts/${transcriptId}/segments/${segmentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function autoDiarizeTranscript(
  transcriptId: string,
  apiKey?: string,
  model?: string
): Promise<TranscriptDocument> {
  const res = await fetch(`${API_BASE}/api/transcripts/${transcriptId}/auto-diarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, model }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Diarization failed' }));
    throw new Error(err.detail || 'Diarization failed');
  }
  return res.json();
}

export async function splitSegment(
  transcriptId: string,
  segmentId: string,
  opts: { wordId?: string; wordIndex?: number }
): Promise<TranscriptDocument> {
  const res = await fetch(`${API_BASE}/api/transcripts/${transcriptId}/segments/${segmentId}/split`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Split failed' }));
    throw new Error(err.detail || 'Split failed');
  }
  return res.json();
}

export async function deleteTranscript(id: string) {
  const res = await fetch(`${API_BASE}/api/transcripts/${id}`, {
    method: 'DELETE',
  });
  return res.json();
}

export function getExportUrl(transcriptId: string, format: 'srt' | 'vtt' | 'txt' | 'json' | 'md'): string {
  return `${API_BASE}/api/transcripts/${transcriptId}/export/${format}`;
}

export async function checkAiStatus() {
  const res = await fetch(`${API_BASE}/api/ai/status`);
  return res.json();
}

export async function chatWithTranscript(transcriptId: string, question: string) {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcriptId, question }),
  });
  return res.json();
}

export async function regenerateSummary(transcriptId: string) {
  const res = await fetch(`${API_BASE}/api/ai/summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcriptId }),
  });
  return res.json();
}

export function createTranscriptionWebSocket(
  transcriptId: string,
  onMessage: (data: any) => void,
  onError?: (err: Event) => void
): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws/transcribe/${transcriptId}`);
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {
      // non-json frame
    }
  };
  if (onError) ws.onerror = onError;
  return ws;
}

export async function testGroqKey(apiKey: string, model?: string): Promise<{ valid: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/ai/test-groq`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, model }),
  });
  return res.json();
}

export function getStoredGroqSettings(): { apiKey: string; model: string } {
  try {
    const saved = localStorage.getItem('clubcut_groq_settings');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {}
  return { apiKey: '', model: 'llama-3.3-70b-versatile' };
}

export function setStoredGroqSettings(settings: { apiKey: string; model?: string }) {
  try {
    const curr = getStoredGroqSettings();
    localStorage.setItem('clubcut_groq_settings', JSON.stringify({ ...curr, ...settings }));
  } catch {}
}

