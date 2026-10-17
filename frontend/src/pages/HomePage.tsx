import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MOCK_HISTORY } from '../data/mockTranscripts';
import type { TranscriptDocument } from '../types/transcript';
import { fetchTranscripts } from '../services/api';

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatFileSize(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  return `${(b / 1e3).toFixed(0)} KB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ doc }: { doc: TranscriptDocument }) {
  const map: Record<string, { label: string; cls: string }> = {
    completed:   { label: 'Completed', cls: 'badge badge-success' },
    transcribing:{ label: 'Processing', cls: 'badge badge-primary' },
    queued:      { label: 'Queued', cls: 'badge badge-muted' },
    failed:      { label: 'Failed', cls: 'badge badge-danger' },
    extracting:  { label: 'Extracting', cls: 'badge badge-primary' },
    diarizing:   { label: 'Diarizing', cls: 'badge badge-primary' },
    enriching:   { label: 'Enriching', cls: 'badge badge-primary' },
  };
  const config = map[doc.status] ?? { label: doc.status, cls: 'badge badge-muted' };
  return (
    <span className={config.cls}>
      {doc.status !== 'completed' && doc.status !== 'failed' && (
        <span className="status-dot processing" style={{ width: 6, height: 6, marginRight: 4 }} />
      )}
      {config.label}
    </span>
  );
}

const STATS = [
  { label: 'Total Transcripts', value: '4', icon: '📄', delta: '+2 this week' },
  { label: 'Hours Processed', value: '2.1h', icon: '⏱️', delta: '~42 mins avg' },
  { label: 'Words Transcribed', value: '18.4K', icon: '✍️', delta: 'across all files' },
  { label: 'Speakers Detected', value: '6', icon: '🎙️', delta: 'across all files' },
];

export default function HomePage() {
  const [recent, setRecent] = useState<TranscriptDocument[]>(MOCK_HISTORY.slice(0, 3));

  useEffect(() => {
    fetchTranscripts()
      .then((data) => {
        if (data && data.length > 0) {
          setRecent(data.slice(0, 3));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="page animate-fade-in" id="home-page">
      {/* Hero */}
      <section style={{ marginBottom: 'var(--space-12)' }}>
        <div style={{
          background: 'var(--gradient-hero)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-12) var(--space-10)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative orb */}
          <div style={{
            position: 'absolute', top: '-60px', right: '-60px',
            width: '280px', height: '280px',
            background: 'radial-gradient(circle, rgba(124,110,250,0.25) 0%, transparent 70%)',
            borderRadius: '50%', pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: '-40px', left: '30%',
            width: '200px', height: '200px',
            background: 'radial-gradient(circle, rgba(94,234,212,0.15) 0%, transparent 70%)',
            borderRadius: '50%', pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative', maxWidth: '600px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <span className="badge badge-primary">✨ AI-Powered</span>
              <span className="badge badge-teal">Local & Private</span>
            </div>
            <h1 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-4xl)' }}>
              <span className="gradient-text">Rich Transcripts,</span>
              <br/>Not Just Text
            </h1>
            <p style={{ marginBottom: 'var(--space-8)', fontSize: 'var(--text-md)', maxWidth: '480px' }}>
              Upload audio or video — get word-level timestamps, speaker labels,
              pause markers, sentiment, entities, and AI summaries. Completely offline.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Link to="/upload" className="btn btn-gradient btn-lg" id="hero-upload-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Upload File
              </Link>
              <Link to="/history" className="btn btn-secondary btn-lg" id="hero-history-btn">
                View History
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats row */}
      <section style={{ marginBottom: 'var(--space-10)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
          {STATS.map((stat, i) => (
            <div key={stat.label} className="card glass animate-fade-in" style={{ animationDelay: `${i * 0.06}s` }}>
              <div style={{ fontSize: '24px', marginBottom: 'var(--space-2)' }}>{stat.icon}</div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--text-primary)' }}>{stat.value}</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 600, marginTop: 2 }}>{stat.label}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>{stat.delta}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Transcripts */}
      <section style={{ marginBottom: 'var(--space-10)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
          <h2 style={{ fontSize: 'var(--text-xl)' }}>Recent Transcripts</h2>
          <Link to="/history" className="btn btn-ghost btn-sm" id="view-all-btn">View all →</Link>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {recent.map((doc, i) => (
            <Link
              key={doc.id}
              to={doc.status === 'completed' ? `/transcript/${doc.id}` : '#'}
              className="card card-hover glass animate-fade-in"
              id={`recent-card-${doc.id}`}
              style={{
                animationDelay: `${i * 0.08}s`,
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                textDecoration: 'none',
                padding: 'var(--space-4) var(--space-5)',
              }}
            >
              {/* Media type icon */}
              <div style={{
                width: 44, height: 44,
                background: doc.mediaType === 'audio'
                  ? 'rgba(124, 110, 250, 0.15)'
                  : 'rgba(94, 234, 212, 0.15)',
                borderRadius: 'var(--radius-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {doc.mediaType === 'audio' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={doc.mediaType === 'audio' ? 'var(--brand-primary)' : 'var(--brand-secondary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                  </svg>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} className="truncate">
                    {doc.title}
                  </span>
                  <StatusBadge doc={doc} />
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  <span>🕒 {formatDuration(doc.duration)}</span>
                  <span>📁 {formatFileSize(doc.fileSize)}</span>
                  <span>📅 {formatDate(doc.createdAt)}</span>
                  <span>{doc.mode === 'deep' ? '🔬 Deep' : '⚡ Quick'}</span>
                </div>
                {doc.status === 'transcribing' && (
                  <div style={{ marginTop: 8 }}>
                    <div className="progress-bar" style={{ height: 3 }}>
                      <div className="progress-bar-fill" style={{ width: `${doc.progress}%` }} />
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--brand-primary)', marginTop: 4, display: 'block' }}>
                      {doc.progressLabel}
                    </span>
                  </div>
                )}
              </div>

              {/* Arrow */}
              {doc.status === 'completed' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* Features row */}
      <section>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-5)' }}>What You Get</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
          {[
            { icon: '⏱️', title: 'Word-Level Timestamps', desc: 'Every single word gets a precise start and end time down to milliseconds.' },
            { icon: '🎙️', title: 'Speaker Diarization', desc: 'Automatically identifies who is speaking and labels each segment.' },
            { icon: '⏸️', title: 'Pause Detection', desc: 'Silence gaps are detected and marked with exact durations.' },
            { icon: '😐', title: 'Filler Word Stats', desc: "Um, uh, like — counted and flagged so you know your speaking patterns." },
            { icon: '💬', title: 'Sentiment Analysis', desc: 'Each segment is scored for positive, neutral, or negative tone.' },
            { icon: '🤖', title: 'AI Summaries & Q&A', desc: 'Runs locally via Ollama. Ask any question about your transcript.' },
          ].map((f, i) => (
            <div key={f.title} className="card glass animate-fade-in" style={{ animationDelay: `${i * 0.07}s` }}>
              <div style={{ fontSize: '28px', marginBottom: 'var(--space-3)' }}>{f.icon}</div>
              <h4 style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>{f.title}</h4>
              <p style={{ fontSize: 'var(--text-xs)', lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
