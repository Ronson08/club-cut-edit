import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProcessingMode, SpeakerMode } from '../types/transcript';
import { uploadMedia } from '../services/api';

const ACCEPTED_TYPES = [
  'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/x-m4a',
  'video/mp4', 'video/webm', 'video/x-matroska', 'video/quicktime',
];

const ACCEPTED_EXT = '.mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.webm,.mkv,.mov';

const MODEL_OPTIONS = [
  { value: 'tiny',   label: 'Tiny',   desc: 'Fastest (~20x real-time). Lower accuracy.' },
  { value: 'base',   label: 'Base',   desc: 'Fast (~10x real-time). Good accuracy.' },
  { value: 'small',  label: 'Small',  desc: 'Balanced (~5x real-time). Better accuracy.', recommended: true },
  { value: 'medium', label: 'Medium', desc: 'Best accuracy (~2x real-time). Slower.' },
];

function formatFileSize(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  return `${(b / 1e3).toFixed(0)} KB`;
}

export default function UploadPage() {
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<ProcessingMode>('deep');
  const [speakerMode, setSpeakerMode] = useState<SpeakerMode>('multi');
  const [model, setModel] = useState<'tiny' | 'base' | 'small' | 'medium'>('base');
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const abortCtrlRef = useState<AbortController | null>(null);

  const handleCancelUpload = () => {
    if (abortCtrlRef[0]) {
      abortCtrlRef[0].abort();
      setIsUploading(false);
      setStatusMessage('');
      setError('Upload cancelled.');
    }
  };

  const handleFile = (f: File) => {
    if (!ACCEPTED_TYPES.includes(f.type) && !f.name.match(/\.(mp3|wav|m4a|aac|ogg|flac|mp4|webm|mkv|mov)$/i)) {
      setError('Unsupported file type. Please upload an audio or video file.');
      return;
    }
    setError('');
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [title]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const isAudio = file ? file.type.startsWith('audio/') : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const controller = new AbortController();
    abortCtrlRef[1](controller);

    setIsUploading(true);
    setStatusMessage('Uploading and extracting 16kHz mono audio via FFmpeg...');
    setError('');

    try {
      const res = await uploadMedia(file, title, controller.signal);
      navigate(`/transcript/${res.id}?mode=${mode}&speakerMode=${speakerMode}&model=${model}`);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setIsUploading(false);
      setError(err?.message || 'Upload failed. Please ensure the backend server is running on port 8000.');
    }
  };

  return (
    <div className="page animate-fade-in" id="upload-page" style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="page-header">
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>New Transcript</h1>
        <p style={{ marginTop: 'var(--space-2)' }}>Upload an audio or video file to get a rich AI-powered transcript.</p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Drop Zone */}
        <div
          className={`animate-fade-in ${dragging ? 'drag-active' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          id="upload-dropzone"
          style={{
            border: `2px dashed ${dragging ? 'var(--brand-primary)' : file ? 'var(--brand-success)' : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-12)',
            textAlign: 'center',
            background: dragging ? 'rgba(124,110,250,0.06)' : file ? 'rgba(34,197,94,0.04)' : 'var(--glass-bg)',
            transition: 'all var(--transition-base)',
            cursor: 'pointer',
            marginBottom: 'var(--space-6)',
            position: 'relative',
          }}
          onClick={() => !file && document.getElementById('file-input')?.click()}
        >
          <input
            type="file"
            id="file-input"
            accept={ACCEPTED_EXT}
            onChange={onFileInput}
            style={{ display: 'none' }}
          />

          {file ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{
                width: 56, height: 56,
                background: 'rgba(34,197,94,0.15)',
                borderRadius: 'var(--radius-lg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--brand-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>{file.name}</p>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  {formatFileSize(file.size)} · {file.type || 'media file'}
                </p>
              </div>
              {/* Audio-first tip */}
              {!isAudio && (
                <div style={{
                  background: 'rgba(234, 179, 8, 0.10)',
                  border: '1px solid rgba(234, 179, 8, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3) var(--space-4)',
                  display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start',
                  maxWidth: 400, textAlign: 'left',
                }}>
                  <span>💡</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--brand-warning)' }}>
                    <strong>Tip:</strong> Audio files (MP3, M4A) process 10x faster than video. We'll extract audio automatically.
                  </span>
                </div>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={(e) => { e.stopPropagation(); setFile(null); setTitle(''); }}
                id="remove-file-btn"
              >
                × Remove file
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
              <div style={{
                width: 64, height: 64,
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-xl)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--brand-primary)',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div>
                <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>
                  Drag & drop or <span style={{ color: 'var(--brand-primary)' }}>browse files</span>
                </p>
                <p style={{ fontSize: 'var(--text-sm)' }}>
                  MP3, M4A, WAV, AAC, OGG · MP4, WebM, MKV, MOV
                </p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 6 }}>
                  💡 Audio files are 10x faster to process than video
                </p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.10)',
            border: '1px solid rgba(244, 63, 94, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)',
            color: 'var(--brand-danger)',
            fontSize: 'var(--text-sm)',
            marginBottom: 'var(--space-4)',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Title */}
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <label htmlFor="transcript-title" style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
            Transcript Title
          </label>
          <input
            id="transcript-title"
            className="input"
            placeholder="e.g. Podcast Episode 42 — The Future of AI"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
          />
        </div>

        {/* Mode Selector */}
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
            Processing Mode
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            {[
              { value: 'quick', label: '⚡ Quick Mode', desc: 'Transcription only. No diarization. ~2–5 min for 30 min audio.', color: 'var(--brand-secondary)' },
              { value: 'deep',  label: '🔬 Deep Mode', desc: 'Full pipeline: diarization + NLP analysis + sentiment + entities.', color: 'var(--brand-primary)', recommended: true },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                id={`mode-${opt.value}`}
                onClick={() => setMode(opt.value as ProcessingMode)}
                style={{
                  background: mode === opt.value ? `rgba(${opt.value === 'deep' ? '124,110,250' : '94,234,212'}, 0.10)` : 'var(--glass-bg)',
                  border: `1.5px solid ${mode === opt.value ? opt.color : 'var(--border-default)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-4)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  color: 'var(--text-primary)',
                  position: 'relative',
                }}
              >
                {opt.recommended && (
                  <span className="badge badge-primary" style={{ position: 'absolute', top: 10, right: 10, fontSize: 10 }}>Recommended</span>
                )}
                <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 'var(--text-sm)' }}>{opt.label}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Speaker Mode */}
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
            Speaker Configuration
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            {[
              { value: 'single', label: '🎤 Single Speaker', desc: 'One person talking. Skips diarization — much faster.' },
              { value: 'multi',  label: '👥 Multiple Speakers', desc: 'Interview, podcast, or meeting with multiple people.' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                id={`speaker-${opt.value}`}
                onClick={() => setSpeakerMode(opt.value as SpeakerMode)}
                style={{
                  background: speakerMode === opt.value ? 'rgba(124,110,250,0.10)' : 'var(--glass-bg)',
                  border: `1.5px solid ${speakerMode === opt.value ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-4)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  color: 'var(--text-primary)',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 'var(--text-sm)' }}>{opt.label}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Whisper Model Size */}
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
            Model Size
            <span className="badge badge-muted" style={{ marginLeft: 8 }}>CPU Optimized (CTranslate2)</span>
          </label>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {MODEL_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                id={`model-${opt.value}`}
                onClick={() => setModel(opt.value as typeof model)}
                data-tooltip={opt.desc}
                style={{
                  background: model === opt.value ? 'rgba(124,110,250,0.15)' : 'var(--glass-bg)',
                  border: `1.5px solid ${model === opt.value ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-2) var(--space-3)',
                  cursor: 'pointer',
                  color: model === opt.value ? 'var(--brand-primary)' : 'var(--text-secondary)',
                  fontWeight: model === opt.value ? 700 : 400,
                  fontSize: 'var(--text-sm)',
                  transition: 'all var(--transition-fast)',
                  display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
                }}
              >
                {opt.label}
                {opt.recommended && <span style={{ fontSize: 9, background: 'var(--brand-primary)', color: 'white', padding: '1px 4px', borderRadius: 4 }}>REC</span>}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 8 }}>
            Selected: <strong style={{ color: 'var(--text-secondary)' }}>{MODEL_OPTIONS.find(m => m.value === model)?.desc}</strong>
          </p>
        </div>

        {/* Submit */}
        {isUploading && (
          <div style={{
            padding: 'var(--space-4)',
            marginBottom: 'var(--space-4)',
            background: 'rgba(124,110,250,0.10)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(124,110,250,0.30)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{
                width: 20, height: 20,
                border: '2px solid var(--brand-primary)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <div>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--brand-primary)', fontWeight: 600 }}>
                  {statusMessage || 'Processing upload...'}
                </span>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                  Audio normalization runs once. Once transcription starts, you can Pause or Stop at any time.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleCancelUpload}
              style={{ color: 'var(--brand-danger)', borderColor: 'rgba(244,63,94,0.3)' }}
            >
              ✕ Cancel
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button
            type="submit"
            className="btn btn-gradient btn-lg"
            disabled={!file || !title || isUploading}
            id="start-transcription-btn"
            style={{ flex: 1 }}
          >
            {isUploading ? (
              <span>Uploading & Normalizing...</span>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Start Transcription
              </>
            )}
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-4)' }}>
          🔒 All processing happens locally on your machine. Nothing leaves your device.
        </p>
      </form>
    </div>
  );
}
