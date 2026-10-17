import { useLocation, Link } from 'react-router-dom';
import { ThemeToggle } from '../common/ThemeToggle';

const PAGE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/upload': 'New Transcript',
  '/history': 'History',
  '/settings': 'Settings',
};

interface HeaderProps {
  transcriptTitle?: string;
}

export function Header({ transcriptTitle }: HeaderProps) {
  const { pathname } = useLocation();

  const isTranscriptPage = pathname.startsWith('/transcript/');
  const pageLabel = PAGE_LABELS[pathname] ?? (isTranscriptPage ? 'Transcript' : 'Page');

  return (
    <header className="header" id="app-header">
      {/* Breadcrumb */}
      <div className="header-breadcrumb">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <Link to="/" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          ClubCut Edit
        </Link>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-disabled)' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span className="page-title">
          {isTranscriptPage && transcriptTitle ? transcriptTitle : pageLabel}
        </span>
      </div>

      {/* Actions */}
      <div className="header-actions">
        <ThemeToggle />
      </div>
    </header>
  );
}
