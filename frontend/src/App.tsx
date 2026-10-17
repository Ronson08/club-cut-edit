import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { Sidebar, Header } from './components';
import HomePage from './pages/HomePage';
import UploadPage from './pages/UploadPage';
import TranscriptPage from './pages/TranscriptPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Sidebar onCollapseChange={setSidebarCollapsed} />
          <div className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            <Header />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/transcript/:id" element={<TranscriptPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}
