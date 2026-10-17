import { NavLink } from 'react-router-dom';
import { useState } from 'react';

interface SidebarProps {
  onCollapseChange?: (collapsed: boolean) => void;
}

const NAV_ITEMS = [
  {
    label: 'Dashboard',
    to: '/',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    label: 'New Transcript',
    to: '/upload',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    ),
    badge: '+',
  },
  {
    label: 'History',
    to: '/history',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
];

const BOTTOM_ITEMS = [
  {
    label: 'Settings',
    to: '/settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
];

export function Sidebar({ onCollapseChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    onCollapseChange?.(next);
  };

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`} id="app-sidebar">
      {/* Logo */}
      <NavLink to="/" className="sidebar-logo" aria-label="ClubCut Edit Home">
        <div className="sidebar-logo-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div className="sidebar-logo-text">
          <span className="app-name">ClubCut Edit</span>
          <span className="app-tagline">AI Transcripts</span>
        </div>
      </NavLink>

      {/* Main Nav */}
      <nav className="sidebar-nav" aria-label="Main navigation">
        <span className="sidebar-section-label">Main</span>

        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            data-tooltip={collapsed ? item.label : undefined}
          >
            {item.icon}
            <span className="nav-item-label">{item.label}</span>
            {item.badge && <span className="nav-item-badge">{item.badge}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer Nav */}
      <div className="sidebar-footer">
        {BOTTOM_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            id={`nav-${item.label.toLowerCase()}`}
            data-tooltip={collapsed ? item.label : undefined}
          >
            {item.icon}
            <span className="nav-item-label">{item.label}</span>
          </NavLink>
        ))}

        {/* Collapse toggle */}
        <button
          className="sidebar-collapse-btn"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          data-tooltip={collapsed ? 'Expand' : 'Collapse'}
          id="sidebar-collapse-btn"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      </div>
    </aside>
  );
}
