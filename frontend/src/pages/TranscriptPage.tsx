import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MOCK_TRANSCRIPT } from '../data/mockTranscripts';
import type { TranscriptDocument, TranscriptSegment, WordItem } from '../types/transcript';
import {
  fetchTranscript,
  startTranscription,
  createTranscriptionWebSocket,
  getExportUrl,
  chatWithTranscript,
  updateSegment,
  autoDiarizeTranscript,
  splitSegment,
  getStoredGroqSettings,
  setStoredGroqSettings,
} from '../services/api';

const SPEAKER_COLORS = [
  'var(--speaker-0)',
  'var(--speaker-1)',
  'var(--speaker-2)',
  'var(--speaker-3)',
  'var(--speaker-4)',
];

function getSpeakerColor(speaker: string, all: string[]) {
  const idx = all.indexOf(speaker);
  return SPEAKER_COLORS[Math.max(0, idx) % SPEAKER_COLORS.length];
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 100);
  return `${m}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function SentimentBar({ score }: { score?: number }) {
  if (score == null) return null;
  const pct = ((score + 1) / 2) * 100;
  const color = score > 0.2 ? 'var(--brand-success)' : score < -0.2 ? 'var(--brand-danger)' : 'var(--text-muted)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <div style={{ flex: 1, height: 3, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 'var(--text-xs)', color, fontWeight: 600, minWidth: 36 }}>
        {score > 0.2 ? '😊 +' : score < -0.2 ? '😔 ' : '😐 '}{score.toFixed(2)}
      </span>
    </div>
  );
}

function WordChip({
  word,
  currentTime,
  onSeek,
  onSplitWord,
}: {
  word: WordItem;
  currentTime: number;
  onSeek: (time: number) => void;
  onSplitWord?: (wordId: string) => void;
}) {
  const isPlaying = currentTime >= word.start && currentTime <= word.end;

  const style: React.CSSProperties = {
    display: 'inline',
    padding: '2px 3px',
    margin: '0 1px',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    opacity: isPlaying ? 1 : 0.6 + word.confidence * 0.4,
    fontSize: 'var(--text-md)',
    lineHeight: 2.1,
    background: isPlaying
      ? 'var(--brand-primary)'
      : word.isFiller
      ? 'rgba(249,115,22,0.18)'
      : 'transparent',
    color: isPlaying
      ? '#ffffff'
      : word.isFiller
      ? 'var(--brand-accent)'
      : 'var(--text-primary)',
    fontWeight: isPlaying || word.isFiller ? 600 : 400,
    boxShadow: isPlaying ? '0 0 10px rgba(124,110,250,0.60)' : 'none',
  };

  return (
    <span
      style={style}
      onClick={() => onSeek(word.start)}
      onContextMenu={(e) => {
        if (onSplitWord) {
          e.preventDefault();
          if (confirm(`Split segment at word "${word.word.trim()}" into next speaker?`)) {
            onSplitWord(word.id);
          }
        }
      }}
      data-tooltip={`${formatTime(word.start)} · ${Math.round(word.confidence * 100)}% conf${word.isFiller ? ' · FILLER' : ''} (Right-click to split)`}
      title={`Click to play from ${formatTime(word.start)} · Right-click to split here`}
    >
      {word.word}{' '}
    </span>
  );
}

function SegmentBlock({
  segment,
  speakers,
  currentTime,
  onSeek,
  onEditSegment,
  onSplitSegment,
}: {
  segment: TranscriptSegment;
  speakers: string[];
  currentTime: number;
  onSeek: (time: number) => void;
  onEditSegment?: (segId: string, newText: string) => void;
  onSplitSegment?: (segId: string, wordId: string) => void;
}) {
  const color = getSpeakerColor(segment.speaker, speakers);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(segment.text);

  const saveEdit = () => {
    setIsEditing(false);
    if (editText !== segment.text && onEditSegment) {
      onEditSegment(segment.id, editText);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-6)',
        animation: 'fadeIn 0.3s ease',
      }}
    >
      {/* Left: speaker + time */}
      <div style={{ paddingTop: 4 }}>
        <div style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          color,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 4,
        }}>
          {segment.speaker}
        </div>
        <div
          onClick={() => onSeek(segment.start)}
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
          }}
          title="Click to seek"
        >
          {formatTime(segment.start)}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-disabled)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
          → {formatTime(segment.end)}
        </div>
        {segment.sentiment && (
          <span className={`badge badge-${segment.sentiment === 'positive' ? 'success' : segment.sentiment === 'negative' ? 'danger' : 'muted'}`} style={{ marginTop: 6, fontSize: 9 }}>
            {segment.sentiment}
          </span>
        )}
      </div>

      {/* Right: words + pauses */}
      <div
        style={{
          borderLeft: `3px solid ${color}`,
          paddingLeft: 'var(--space-4)',
          paddingTop: 2,
        }}
      >
        {isEditing ? (
          <div>
            <textarea
              className="input"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              style={{ width: '100%', marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setIsEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ lineHeight: 2, wordBreak: 'break-word' }} onDoubleClick={() => setIsEditing(true)}>
            {segment.words.map((w) => (
              <WordChip
                key={w.id}
                word={w}
                currentTime={currentTime}
                onSeek={onSeek}
                onSplitWord={(wId) => onSplitSegment && onSplitSegment(segment.id, wId)}
              />
            ))}
            {segment.pauses.map((p) => (
              <span
                key={p.id}
                onClick={() => onSeek(p.start)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  margin: '0 4px',
                  padding: '2px 8px',
                  background: 'rgba(107, 104, 144, 0.15)',
                  border: '1px dashed rgba(107, 104, 144, 0.30)',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  verticalAlign: 'middle',
                }}
                data-tooltip={`Silence at ${formatTime(p.start)} — click to jump`}
              >
                ⏸ {p.duration.toFixed(1)}s
              </span>
            ))}
          </div>
        )}
        <SentimentBar score={segment.sentimentScore} />
      </div>
    </div>
  );
}

export default function TranscriptPage() {
  const { id = 'mock-001' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [doc, setDoc] = useState<TranscriptDocument>(MOCK_TRANSCRIPT);
  const [loading, setLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  const [streamStatus, setStreamStatus] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'transcript' | 'analytics' | 'summary' | 'chat'>('transcript');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  // Groq Diarization & Speaker Separation state
  const [isDiarizing, setIsDiarizing] = useState(false);
  const [diarizeBanner, setDiarizeBanner] = useState<{ status: 'loading' | 'success' | 'error'; message: string } | null>(null);
  const [showGroqModal, setShowGroqModal] = useState(false);
  const [modalKeyInput, setModalKeyInput] = useState(() => getStoredGroqSettings().apiKey);
  const [modalModelInput, setModalModelInput] = useState(() => getStoredGroqSettings().model || 'llama-3.3-70b-versatile');
  const [rememberKey, setRememberKey] = useState(true);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportMenu]);

  const handleDownloadExport = (fmt: 'srt' | 'vtt' | 'txt' | 'json' | 'md') => {
    setShowExportMenu(false);
    const link = document.createElement('a');
    link.href = getExportUrl(doc.id, fmt);
    link.download = `${doc.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${fmt}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyAllText = () => {
    setShowExportMenu(false);
    const fullText = doc.segments.map((s) => `[${formatTime(s.start)}] ${s.speaker}: ${s.text}`).join('\n\n');
    navigator.clipboard.writeText(fullText);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  };

  // Chat state
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: 'Hello! I am your AI podcast assistant. Ask me anything about this episode!' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connectLiveStream = (transcriptId: string) => {
    setIsStreaming(true);
    setIsPaused(false);
    setStreamStatus('Connecting speech-to-text pipeline...');

    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
    }

    const ws = createTranscriptionWebSocket(
      transcriptId,
      (msg) => {
        if (msg.type === 'status') {
          if (msg.status === 'paused') {
            setIsPaused(true);
            setStreamStatus('Transcription paused by user');
          } else if (msg.status === 'stopped') {
            setIsStreaming(false);
            setStreamStatus('Transcription stopped and saved');
          } else {
            setIsPaused(false);
            setStreamStatus(
              msg.status === 'generating_summary'
                ? 'Generating AI Summary & chapters with Ollama...'
                : 'Transcribing audio live with faster-whisper...'
            );
          }
          setStreamProgress(msg.progress || 10);
        } else if (msg.type === 'segment') {
          setDoc((prev) => {
            const exists = prev.segments.some((s) => s.id === msg.segment.id);
            const updated = exists
              ? prev.segments.map((s) => (s.id === msg.segment.id ? msg.segment : s))
              : [...prev.segments, msg.segment];
            // Ensure strict chronological order
            updated.sort((a, b) => a.start - b.start);
            return {
              ...prev,
              segments: updated,
              progress: msg.progress,
            };
          });
          setStreamProgress(msg.progress);
        } else if (msg.type === 'completed') {
          setDoc((prev) => ({
            ...prev,
            status: 'completed',
            progress: 100,
            metadata: {
              ...prev.metadata,
              ...(msg.metadata || {}),
            },
          }));
          setIsStreaming(false);
          setIsPaused(false);
          setStreamStatus('Transcription completed!');
        }
      },
      () => {
        // Disconnect does not stop background transcription
        setIsStreaming(false);
      }
    );
    wsRef.current = ws;
  };

  const handleTogglePause = () => {
    if (!wsRef.current) return;
    if (isPaused) {
      wsRef.current.send(JSON.stringify({ action: 'resume' }));
      setIsPaused(false);
      setStreamStatus('Transcribing audio live with faster-whisper...');
    } else {
      wsRef.current.send(JSON.stringify({ action: 'pause' }));
      setIsPaused(true);
      setStreamStatus('Transcription paused by user');
    }
  };

  const handleStop = () => {
    if (confirm('Stop transcription now? All words transcribed so far will be saved and AI insights generated.')) {
      if (wsRef.current) {
        try {
          wsRef.current.send(JSON.stringify({ action: 'stop' }));
        } catch {}
      }
      setIsStreaming(false);
      setIsPaused(false);
      setStreamStatus('Transcription stopped by user');
      setDoc((prev) => ({ ...prev, status: 'completed' }));
    }
  };

  const handleStartOrReTranscribe = async () => {
    if (doc.id === 'mock-001') {
      alert('Mock preview transcript cannot be re-transcribed.');
      return;
    }
    const confirmed = doc.segments.length === 0 || confirm('Re-transcribe this audio file from the beginning? This will refresh segments.');
    if (!confirmed) return;

    try {
      setStreamStatus('Initializing speech-to-text pipeline...');
      setIsStreaming(true);
      setIsPaused(false);
      setDoc((prev) => ({ ...prev, segments: [], status: 'processing', progress: 5 }));
      await startTranscription(doc.id, 'quick', 'single', 'base', true);
      connectLiveStream(doc.id);
    } catch (err: any) {
      setIsStreaming(false);
      alert('Failed to start transcription: ' + (err?.message || 'Server error'));
    }
  };

  // 1. Load document or connect WebSocket
  useEffect(() => {
    if (id === 'mock-001') {
      setDoc(MOCK_TRANSCRIPT);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchTranscript(id)
      .then((data) => {
        // Ensure segments are sorted chronologically
        const sortedSegments = [...data.segments].sort((a, b) => a.start - b.start);
        setDoc({ ...data, segments: sortedSegments });
        setLoading(false);

        if (data.status === 'queued' || data.status === 'processing' || data.status === 'paused') {
          connectLiveStream(id);
          if (data.status === 'paused') {
            setIsPaused(true);
            setStreamStatus('Transcription paused by user');
          }
        }
      })
      .catch(() => {
        // Fallback to mock data if network/offline
        setDoc(MOCK_TRANSCRIPT);
        setLoading(false);
      });

    return () => {
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
      }
      wsRef.current = null;
    };
  }, [id, searchParams]);

  // Audio seek helper
  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      audioRef.current.play();
      setIsPlaying(true);
    }
    setCurrentTime(time);
  };

  // Chat submit
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userQ = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', text: userQ }]);
    setIsChatLoading(true);

    try {
      const res = await chatWithTranscript(doc.id, userQ);
      setChatMessages((prev) => [...prev, { role: 'ai', text: res.answer || 'No response generated.' }]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Error contacting AI agent. Please check that the backend server is running.' },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleEditSegment = (segId: string, newText: string) => {
    setDoc((prev) => ({
      ...prev,
      segments: prev.segments.map((s) => (s.id === segId ? { ...s, text: newText } : s)),
    }));
    if (doc.id !== 'mock-001') {
      updateSegment(doc.id, segId, { text: newText });
    }
  };

  const handleTriggerDiarize = async (overrideKey?: string) => {
    if (doc.id === 'mock-001') {
      alert('Mock preview transcript cannot be modified. Upload or select an audio file to use Groq speaker separation.');
      return;
    }

    const stored = getStoredGroqSettings();
    const effectiveKey = (overrideKey !== undefined ? overrideKey : stored.apiKey).trim();

    // If no key found in localStorage and no overrideKey provided, open modal to prompt
    if (!effectiveKey && overrideKey === undefined) {
      setShowGroqModal(true);
      return;
    }

    setIsDiarizing(true);
    setShowGroqModal(false);
    setDiarizeBanner({
      status: 'loading',
      message: effectiveKey
        ? `⚡ Groq ${stored.model || 'Llama 3.3 70B'} is analyzing dialogue turns, splitting merged segments, and aligning word timestamps...`
        : '⚡ Running local turn-taking analyzer to separate speakers...',
    });

    try {
      const updated = await autoDiarizeTranscript(doc.id, effectiveKey || undefined, stored.model);
      const sorted = [...updated.segments].sort((a, b) => a.start - b.start);
      setDoc({ ...updated, segments: sorted });
      setDiarizeBanner({
        status: 'success',
        message: `✨ Successfully separated ${sorted.length} speaker segments with exact word timestamps!`,
      });
      setTimeout(() => {
        setDiarizeBanner((prev) => (prev?.status === 'success' ? null : prev));
      }, 6000);
    } catch (err: any) {
      setDiarizeBanner({
        status: 'error',
        message: err?.message || 'Speaker separation failed. Please verify your Groq API key.',
      });
    } finally {
      setIsDiarizing(false);
    }
  };

  const handleConfirmGroqModal = () => {
    const key = modalKeyInput.trim();
    if (!key) return;
    if (rememberKey) {
      setStoredGroqSettings({ apiKey: key, model: modalModelInput });
    }
    handleTriggerDiarize(key);
  };

  const handleRunOfflineFallback = () => {
    handleTriggerDiarize('');
  };

  const handleSplitSegmentAtWord = async (segId: string, wordId: string) => {
    try {
      const updated = await splitSegment(doc.id, segId, { wordId });
      const sorted = [...updated.segments].sort((a, b) => a.start - b.start);
      setDoc({ ...updated, segments: sorted });
      setDiarizeBanner({
        status: 'success',
        message: '✓ Split segment at word timestamp into alternating speaker.',
      });
      setTimeout(() => {
        setDiarizeBanner((prev) => (prev?.status === 'success' ? null : prev));
      }, 3000);
    } catch (err: any) {
      alert(err?.message || 'Split failed');
    }
  };

  const allSpeakers = [...new Set(doc.segments.map((s) => s.speaker))];
  const filteredSegments = searchQuery
    ? doc.segments.filter((s) => s.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : doc.segments;
  const totalFillers = Object.values(doc.metadata.fillerCounts || {}).reduce((a, b) => a + b, 0);

  const mediaSourceUrl =
    id === 'mock-001'
      ? doc.mediaUrl
      : `http://localhost:8000/api/media/${doc.mediaUrl.replace('/api/media/', '')}`;

  if (loading && id !== 'mock-001') {
    return (
      <div className="page" style={{ padding: 'var(--space-12)', textAlign: 'center' }}>
        <div style={{
          width: 36, height: 36, margin: '0 auto var(--space-4)',
          border: '3px solid var(--brand-primary)', borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 1s linear infinite'
        }} />
        <h3 style={{ color: 'var(--text-primary)' }}>Loading transcript...</h3>
      </div>
    );
  }

  return (
    <div className="page animate-fade-in" id="transcript-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Sticky Live Transcription Controls Banner */}
      {isStreaming && (
        <div style={{
          position: 'sticky',
          top: 72,
          zIndex: 80,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          marginBottom: 'var(--space-6)',
          padding: 'var(--space-4) var(--space-5)',
          background: isPaused ? 'rgba(234, 179, 8, 0.16)' : 'rgba(124,110,250,0.16)',
          border: `1.5px solid ${isPaused ? 'var(--brand-warning)' : 'var(--brand-primary)'}`,
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)',
          transition: 'all 0.3s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                className={`status-dot ${isPaused ? '' : 'processing'}`}
                style={{
                  width: 12,
                  height: 12,
                  background: isPaused ? 'var(--brand-warning)' : 'var(--brand-primary)',
                  boxShadow: isPaused ? '0 0 10px var(--brand-warning)' : '0 0 12px var(--brand-primary)',
                }}
              />
              <div>
                <strong style={{ fontSize: 'var(--text-md)', color: isPaused ? 'var(--brand-warning)' : 'var(--brand-primary)' }}>
                  {isPaused ? '⏸ Transcription Paused' : '⚡ Live Speech-to-Text in Progress'}
                </strong>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>
                  {streamStatus || (isPaused ? 'Paused. Click Resume to continue.' : 'Transcribing audio live with faster-whisper...')}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* PAUSE / RESUME BUTTON */}
              <button
                type="button"
                className={`btn ${isPaused ? 'btn-gradient' : 'btn-secondary'} btn-sm`}
                onClick={handleTogglePause}
                style={{
                  padding: '6px 14px',
                  height: 36,
                  fontSize: 'var(--text-sm)',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                id="pause-resume-btn"
                title={isPaused ? "Resume transcription" : "Pause transcription"}
              >
                {isPaused ? (
                  <>
                    <span>▶</span> Resume Transcription
                  </>
                ) : (
                  <>
                    <span>⏸</span> Pause Transcription
                  </>
                )}
              </button>

              {/* STOP & SAVE BUTTON */}
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleStop}
                style={{
                  padding: '6px 14px',
                  height: 36,
                  fontSize: 'var(--text-sm)',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                id="stop-save-btn"
                title="Stop transcription immediately and keep all words transcribed so far"
              >
                <span>⏹</span> Stop & Save All
              </button>

              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--text-primary)', marginLeft: 8 }}>
                {Math.round(streamProgress)}%
              </span>
            </div>
          </div>
          <div style={{ width: '100%', height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${streamProgress}%`, height: '100%', background: 'var(--gradient-brand)', transition: 'width 0.4s' }} />
          </div>
        </div>
      )}

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-6)', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-2)' }}>{doc.title}</h1>
          <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span>🎙️ {allSpeakers.length} speakers</span>
            <span>📝 {doc.metadata.wordCount.toLocaleString()} words</span>
            <span>⏱️ {Math.floor(doc.duration / 60)}m {Math.floor(doc.duration % 60)}s</span>
            <span>🌐 {doc.metadata.language.toUpperCase()}</span>
            <span>💬 {totalFillers} speech fillers</span>
            <span>🆔 {id}</span>
            <span className={`badge badge-${doc.status === 'completed' ? 'success' : 'primary'}`}>
              {doc.status === 'completed' ? '✓ Completed' : '⚡ Processing'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', position: 'relative', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Groq Speaker Diarization Button */}
          {!isStreaming && id !== 'mock-001' && (
            <button
              className="btn btn-primary btn-sm"
              id="auto-diarize-groq-btn"
              onClick={() => handleTriggerDiarize()}
              disabled={isDiarizing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 700,
                background: 'linear-gradient(135deg, #7c6efa 0%, #ec4899 100%)',
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 2px 10px rgba(124,110,250,0.35)',
                cursor: isDiarizing ? 'wait' : 'pointer',
              }}
              title="Intelligently split merged speaker segments and detect names using Groq Llama 3.3 70B"
            >
              {isDiarizing ? (
                <>
                  <div style={{
                    width: 12, height: 12, border: '2px solid #fff',
                    borderTopColor: 'transparent', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                  <span>Splitting Speakers...</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 15 }}>🤖</span>
                  <span>Auto-Split & Detect Speakers (Groq)</span>
                </>
              )}
            </button>
          )}

          {/* Re-transcribe Button */}
          {!isStreaming && id !== 'mock-001' && (
            <button
              className="btn btn-secondary btn-sm"
              id="retranscribe-btn"
              onClick={handleStartOrReTranscribe}
              title="Transcribe this audio file again"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              Re-transcribe
            </button>
          )}

          <div style={{ position: 'relative' }} ref={exportMenuRef}>
            <button
              className="btn btn-secondary btn-sm"
              id="export-btn"
              onClick={() => setShowExportMenu(!showExportMenu)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
              title="Export or download transcript files"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {copiedText ? '✓ Copied to Clipboard!' : '⬇ Export Transcript ▾'}
            </button>

            {showExportMenu && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 6,
                background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)',
                zIndex: 100, minWidth: 260, overflow: 'hidden', padding: '6px 0',
                backdropFilter: 'blur(16px)',
              }}>
                <div style={{ padding: '6px 14px 2px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                  Document Formats
                </div>
                <button
                  onClick={() => handleDownloadExport('txt')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '8px 14px', background: 'none', border: 'none', color: 'var(--text-primary)',
                    fontSize: 'var(--text-sm)', cursor: 'pointer', transition: 'background var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: 16 }}>📄</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>Plain Text (.TXT)</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Clean dialogue with speaker timestamps</div>
                  </div>
                </button>
                <button
                  onClick={() => handleDownloadExport('md')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '8px 14px', background: 'none', border: 'none', color: 'var(--text-primary)',
                    fontSize: 'var(--text-sm)', cursor: 'pointer', transition: 'background var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: 16 }}>📝</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>Markdown (.MD)</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Includes AI Summary, Chapters & transcript</div>
                  </div>
                </button>

                <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

                <div style={{ padding: '6px 14px 2px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                  Subtitles & Captions
                </div>
                <button
                  onClick={() => handleDownloadExport('srt')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '8px 14px', background: 'none', border: 'none', color: 'var(--text-primary)',
                    fontSize: 'var(--text-sm)', cursor: 'pointer', transition: 'background var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: 16 }}>🎬</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>SubRip (.SRT)</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>For YouTube, Premiere, DaVinci, Final Cut</div>
                  </div>
                </button>
                <button
                  onClick={() => handleDownloadExport('vtt')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '8px 14px', background: 'none', border: 'none', color: 'var(--text-primary)',
                    fontSize: 'var(--text-sm)', cursor: 'pointer', transition: 'background var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: 16 }}>🌐</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>WebVTT (.VTT)</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>HTML5 video & web subtitle tracks</div>
                  </div>
                </button>

                <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

                <div style={{ padding: '6px 14px 2px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                  Clipboard & Developer
                </div>
                <button
                  onClick={handleCopyAllText}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '8px 14px', background: 'none', border: 'none', color: 'var(--text-primary)',
                    fontSize: 'var(--text-sm)', cursor: 'pointer', transition: 'background var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: 16 }}>📋</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>Copy All to Clipboard</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Copy entire spoken transcript text</div>
                  </div>
                </button>
                <button
                  onClick={() => handleDownloadExport('json')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '8px 14px', background: 'none', border: 'none', color: 'var(--text-primary)',
                    fontSize: 'var(--text-sm)', cursor: 'pointer', transition: 'background var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: 16 }}>📊</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>Raw Data (.JSON)</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Word timestamps, pauses & sentiment scores</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Diarization Feedback Banner */}
      {diarizeBanner && (
        <div style={{
          marginBottom: 'var(--space-6)',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: diarizeBanner.status === 'loading'
            ? 'rgba(124, 110, 250, 0.12)'
            : diarizeBanner.status === 'success'
            ? 'rgba(34, 197, 94, 0.15)'
            : 'rgba(239, 68, 68, 0.15)',
          border: `1.5px solid ${
            diarizeBanner.status === 'loading'
              ? 'var(--brand-primary)'
              : diarizeBanner.status === 'success'
              ? 'var(--brand-success)'
              : 'var(--brand-danger)'
          }`,
          color: 'var(--text-primary)',
          animation: 'fadeIn 0.3s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {diarizeBanner.status === 'loading' ? (
              <div style={{
                width: 16, height: 16, border: '2px solid var(--brand-primary)',
                borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite'
              }} />
            ) : (
              <span style={{ fontSize: 16 }}>{diarizeBanner.status === 'success' ? '✨' : '⚠️'}</span>
            )}
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{diarizeBanner.message}</span>
          </div>
          {diarizeBanner.status !== 'loading' && (
            <button
              onClick={() => setDiarizeBanner(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}
            >×</button>
          )}
        </div>
      )}

      {/* ── Audio / Video Media Player ───────────────────────── */}
      <div className="card glass" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <audio
            ref={audioRef}
            src={mediaSourceUrl}
            controls
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            style={{ flex: 1, minWidth: 280, height: 36 }}
          />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {isPlaying && <span className="status-dot processing" title="Playing" />}
            <span>
              {isPlaying ? 'Playing' : 'Paused'}: <strong style={{ color: 'var(--brand-primary)' }}>{formatTime(currentTime)}</strong> / {formatTime(doc.duration)}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--border-subtle)' }}>
        {(['transcript', 'analytics', 'summary', 'chat'] as const).map((tab) => (
          <button
            key={tab}
            id={`tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'none',
              border: 'none',
              padding: 'var(--space-2) var(--space-4)',
              fontSize: 'var(--text-sm)',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? 'var(--brand-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid var(--brand-primary)' : '2px solid transparent',
              transition: 'all var(--transition-fast)',
              marginBottom: '-1px',
            }}
          >
            {tab === 'transcript' ? '📄 Transcript' : tab === 'analytics' ? '📊 Analytics' : tab === 'summary' ? '🤖 AI Summary' : '💬 Q&A Chat'}
          </button>
        ))}
      </div>

      {/* ── Transcript Tab ────────────────────────────────── */}
      {activeTab === 'transcript' && (
        <div>
          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 'var(--space-6)' }}>
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              id="transcript-search"
              className="input"
              style={{ paddingLeft: 36 }}
              placeholder="Search transcript text or speaker…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >×</button>
            )}
          </div>

          {/* Transcript Segment List */}
          <div>
            {filteredSegments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--text-muted)' }}>
                {isStreaming ? 'Streaming words live from faster-whisper...' : 'No segments found.'}
              </div>
            ) : (
              filteredSegments.map((seg) => (
                <SegmentBlock
                  key={seg.id}
                  segment={seg}
                  speakers={allSpeakers}
                  currentTime={currentTime}
                  onSeek={handleSeek}
                  onEditSegment={handleEditSegment}
                  onSplitSegment={handleSplitSegmentAtWord}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Analytics Tab ─────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
          <div className="card glass">
            <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-md)' }}>🗣️ Speech Fillers Breakdown</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {Object.entries(doc.metadata.fillerCounts || {}).map(([word, count]) => (
                <div key={word} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, color: 'var(--brand-accent)' }}>"{word}"</span>
                  <span className="badge badge-accent">{count}×</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card glass">
            <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-md)' }}>⏸️ Silence & Pauses</h3>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--text-primary)' }}>
              {doc.metadata.pauseCount} <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>detected pauses</span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 8 }}>
              Click any pause badge in the transcript to jump to that moment in the audio.
            </p>
          </div>
        </div>
      )}

      {/* ── Summary Tab ───────────────────────────────────── */}
      {activeTab === 'summary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div className="card glass">
            <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-3)' }}>📝 Executive Summary</h3>
            <p style={{ lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              {doc.metadata.summary || 'Summary processing complete.'}
            </p>
          </div>

          {doc.metadata.chapters && doc.metadata.chapters.length > 0 && (
            <div className="card glass">
              <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-3)' }}>📚 Chapter Markers</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {doc.metadata.chapters.map((ch, i) => (
                  <div
                    key={i}
                    onClick={() => handleSeek(ch.start)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                      padding: 'var(--space-3)', background: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    }}
                  >
                    <span className="badge badge-primary">{i + 1}</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>{ch.title}</span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {formatTime(ch.start)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {doc.metadata.actionItems && doc.metadata.actionItems.length > 0 && (
            <div className="card glass">
              <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-3)' }}>✅ Action Items</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {doc.metadata.actionItems.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-2) 0' }}>
                    <span style={{ color: 'var(--brand-success)' }}>✓</span>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Chat Tab ──────────────────────────────────────── */}
      {activeTab === 'chat' && (
        <div className="card glass">
          <div style={{ height: 350, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-2)' }}>
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-lg)',
                  background: msg.role === 'user' ? 'var(--brand-primary)' : 'var(--bg-elevated)',
                  color: msg.role === 'user' ? '#ffffff' : 'var(--text-primary)',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 1.6,
                }}
              >
                {msg.text}
              </div>
            ))}
            {isChatLoading && (
              <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                AI is thinking...
              </div>
            )}
          </div>

          <form onSubmit={handleSendChat} style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <input
              className="input"
              placeholder="Ask anything about this transcript (e.g. 'What was the conclusion?')..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={isChatLoading}
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary" disabled={isChatLoading || !chatInput.trim()}>
              Send
            </button>
          </form>
        </div>
      )}

      {/* Groq Setup & Auto-Split Modal */}
      {showGroqModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }}>
          <div className="card glass animate-scale-in" style={{
            maxWidth: 520, width: '100%', padding: 'var(--space-6)',
            border: '1.5px solid var(--brand-primary)', boxShadow: 'var(--shadow-2xl)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>⚡</span>
                <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>
                  Auto-Split &amp; Detect Speakers
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGroqModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}
              >×</button>
            </div>

            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Groq Cloud uses high-speed <strong>Llama 3.3 70B</strong> to intelligently analyze dialogue turns, split multi-speaker merged segments, and detect speaker names (e.g. <em>Raj Shamani</em> &amp; <em>Dr. Sahar Yousef</em>) down to exact word timestamps.
            </p>

            <div style={{
              background: 'rgba(124, 110, 250, 0.08)',
              border: '1px solid rgba(124, 110, 250, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                Don't have a Groq key yet? Grab a free API key in 30 seconds via GitHub or Google sign-in.
              </div>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ flexShrink: 0, textDecoration: 'none', fontSize: 'var(--text-xs)', padding: '5px 10px' }}
              >
                Get Free Key ↗
              </a>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                Groq API Key (gsk_...)
              </label>
              <input
                type="password"
                className="input"
                placeholder="gsk_..."
                value={modalKeyInput}
                onChange={(e) => setModalKeyInput(e.target.value)}
                style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
                autoFocus
              />
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Groq Model
                </label>
                <select
                  className="input"
                  value={modalModelInput}
                  onChange={(e) => setModalModelInput(e.target.value)}
                  style={{ width: '100%', fontSize: 'var(--text-xs)' }}
                >
                  <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Recommended: Best Dialogue & Diarization)</option>
                  <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Ultra-Fast: ~800 tokens/sec)</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                <input
                  type="checkbox"
                  id="remember-groq-key"
                  checked={rememberKey}
                  onChange={(e) => setRememberKey(e.target.checked)}
                />
                <label htmlFor="remember-groq-key" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  Save key and model locally for future transcripts
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                className="btn btn-gradient"
                onClick={() => handleConfirmGroqModal()}
                disabled={!modalKeyInput.trim()}
                style={{ width: '100%', justifyContent: 'center', fontWeight: 700 }}
              >
                ⚡ Auto-Split &amp; Detect Speakers with Groq
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleRunOfflineFallback()}
                  style={{ flex: 1, fontSize: 'var(--text-xs)', justifyContent: 'center' }}
                  title="Use local turn-taking analyzer based on pauses and question marks"
                >
                  ⚙️ Use Offline Rule-Based Separator
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowGroqModal(false)}
                  style={{ fontSize: 'var(--text-xs)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
