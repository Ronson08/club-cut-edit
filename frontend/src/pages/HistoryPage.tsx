import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MOCK_HISTORY } from '../data/mockTranscripts';
import type { TranscriptDocument } from '../types/transcript';
import { fetchTranscripts, deleteTranscript, getExportUrl } from '../services/api';

function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function formatFileSize(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  return `${(b / 1e3).toFixed(0)} KB`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type Filter = 'all' | 'completed' | 'processing' | 'failed';

export default function HistoryPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [transcripts, setTranscripts] = useState<TranscriptDocument[]>(MOCK_HISTORY);

  useEffect(() => {
    fetchTranscripts()
      .then((data) => {
        if (data && data.length > 0) {
          setTranscripts(data);
        }
      })
      .catch(() => {});
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this transcript?')) return;
    try {
      await deleteTranscript(id);
      setTranscripts((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setTranscripts((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const filtered = transcripts.filter((doc) => {
    const matchSearch =
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      (doc.originalFilename && doc.originalFilename.toLowerCase().includes(search.toLowerCase()));
    const matchFilter =
      filter === 'all' ||
      (filter === 'completed' && doc.status === 'completed') ||
      (filter === 'processing' && !['completed', 'failed'].includes(doc.status)) ||
      (filter === 'failed' && doc.status === 'failed');
    return matchSearch && matchFilter;
  });

  return (
    <div className="page animate-fade-in" id="history-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-8)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ marginBottom: 'var(--space-2)' }}>History</h1>
          <p>{transcripts.length} transcripts total</p>
        </div>
        <Link to="/upload" className="btn btn-gradient" id="new-transcript-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Transcript
        </Link>
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-5)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            id="history-search"
            className="input"
            style={{ paddingLeft: 30 }}
            placeholder="Search transcripts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {(['all', 'completed', 'processing', 'failed'] as Filter[]).map(f => (
          <button
            key={f}
            id={`filter-${f}`}
            onClick={() => setFilter(f)}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
            style={{ textTransform: 'capitalize' }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <h3>No transcripts found</h3>
          <p>Try a different search or upload a new file</p>
          <Link to="/upload" className="btn btn-gradient" id="empty-upload-btn">Upload File</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {filtered.map((doc, i) => <HistoryCard key={doc.id} doc={doc} index={i} onDelete={handleDelete} />)}
        </div>
      )}
    </div>
  );
}

function HistoryCard({ doc, index, onDelete }: { doc: TranscriptDocument; index: number; onDelete: (id: string, e: React.MouseEvent) => void }) {
  const statusMap: Record<string, { label: string; color: string }> = {
    completed:    { label: '✓ Completed', color: 'var(--brand-success)' },
    transcribing: { label: '◌ Transcribing', color: 'var(--brand-primary)' },
    queued:       { label: '● Queued', color: 'var(--text-muted)' },
    failed:       { label: '✕ Failed', color: 'var(--brand-danger)' },
    extracting:   { label: '◌ Extracting', color: 'var(--brand-primary)' },
    diarizing:    { label: '◌ Diarizing', color: 'var(--brand-primary)' },
    enriching:    { label: '◌ Enriching', color: 'var(--brand-primary)' },
  };
  const s = statusMap[doc.status] ?? { label: doc.status, color: 'var(--text-muted)' };

  return (
    <div
      className="card glass glass-hover animate-fade-in"
      id={`history-card-${doc.id}`}
      style={{ animationDelay: `${index * 0.05}s`, display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', padding: 'var(--space-4) var(--space-5)' }}
    >
      {/* Icon */}
      <div style={{
        width: 40, height: 40,
        background: doc.mediaType === 'audio' ? 'rgba(124,110,250,0.12)' : 'rgba(94,234,212,0.12)',
        borderRadius: 'var(--radius-md)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {doc.mediaType === 'audio'
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        }
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">{doc.title}</span>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: s.color }}>{s.label}</span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4, flexWrap: 'wrap' }}>
          <span>{doc.originalFilename}</span>
          <span>·</span>
          <span>{formatDuration(doc.duration)}</span>
          <span>·</span>
          <span>{formatFileSize(doc.fileSize)}</span>
          <span>·</span>
          <span>{formatDate(doc.createdAt)}</span>
          <span>·</span>
          <span>{doc.mode === 'deep' ? '🔬 Deep' : '⚡ Quick'}</span>
        </div>
        {!['completed', 'failed'].includes(doc.status) && (
          <div style={{ marginTop: 6 }}>
            <div className="progress-bar" style={{ height: 3 }}>
              <div className="progress-bar-fill" style={{ width: `${doc.progress}%` }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--brand-primary)', marginTop: 3, display: 'block' }}>{doc.progressLabel}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0, alignItems: 'center' }}>
        {doc.status === 'completed' && (
          <>
            <a
              href={getExportUrl(doc.id, 'txt')}
              download
              className="btn btn-secondary btn-sm"
              id={`export-txt-btn-${doc.id}`}
              title="Download plain text transcript (.txt)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export
            </a>
            <Link to={`/transcript/${doc.id}`} className="btn btn-primary btn-sm" id={`open-btn-${doc.id}`}>
              Open
            </Link>
          </>
        )}
        <button
          className="btn btn-ghost btn-sm btn-icon"
          id={`delete-btn-${doc.id}`}
          data-tooltip="Delete"
          onClick={(e) => onDelete(doc.id, e)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
