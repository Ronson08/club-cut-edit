import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { getStoredGroqSettings, setStoredGroqSettings, testGroqKey } from '../services/api';

type Section = 'general' | 'transcription' | 'ai' | 'storage';

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'general',       label: 'General',       icon: '⚙️' },
  { id: 'transcription', label: 'Transcription',  icon: '🎙️' },
  { id: 'ai',            label: 'AI & Groq Cloud', icon: '🤖' },
  { id: 'storage',       label: 'Storage',        icon: '💾' },
];

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-6)',
      padding: 'var(--space-4) 0',
      borderBottom: '1px solid var(--border-subtle)',
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
        {desc && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <button
      id={id}
      onClick={() => onChange(!checked)}
      aria-checked={checked}
      role="switch"
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: checked ? 'var(--brand-primary)' : 'var(--bg-elevated)',
        border: `1px solid ${checked ? 'var(--brand-primary)' : 'var(--border-default)'}`,
        cursor: 'pointer',
        position: 'relative',
        transition: 'all var(--transition-fast)',
        padding: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 2, left: checked ? 22 : 2,
        width: 18, height: 18,
        background: 'white',
        borderRadius: '50%',
        transition: 'left var(--transition-fast)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();

  // Transcription settings
  const [defaultModel, setDefaultModel] = useState('small');
  const [defaultMode, setDefaultMode] = useState('deep');
  const [cpuThreads, setCpuThreads] = useState('auto');
  const [autoNormalize, setAutoNormalize] = useState(true);

  // Groq Cloud settings
  const [groqKey, setGroqKey] = useState(() => getStoredGroqSettings().apiKey);
  const [groqModel, setGroqModel] = useState(() => getStoredGroqSettings().model || 'llama-3.3-70b-versatile');
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [testingGroq, setTestingGroq] = useState(false);
  const [groqStatus, setGroqStatus] = useState<{ valid: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // AI settings
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3.2');
  const [openAiKey, setOpenAiKey] = useState('');
  const [aiProvider, setAiProvider] = useState<'groq' | 'ollama' | 'openai' | 'none'>('groq');

  // Storage settings
  const [storageDb, setStorageDb] = useState('sqlite');

  const [activeSection, setActiveSection] = useState<Section>('general');

  const handleTestGroq = async () => {
    if (!groqKey.trim()) {
      setGroqStatus({ valid: false, message: 'Please enter a Groq API key first.' });
      return;
    }
    setTestingGroq(true);
    setGroqStatus(null);
    try {
      const res = await testGroqKey(groqKey.trim(), groqModel);
      setGroqStatus(res);
    } catch (err: any) {
      setGroqStatus({ valid: false, message: err?.message || 'Failed to connect to backend.' });
    } finally {
      setTestingGroq(false);
    }
  };

  const handleSave = () => {
    setStoredGroqSettings({ apiKey: groqKey.trim(), model: groqModel });
    try {
      localStorage.setItem('clubcut_settings', JSON.stringify({
        defaultModel,
        defaultMode,
        cpuThreads,
        autoNormalize,
        ollamaUrl,
        ollamaModel,
        aiProvider,
        storageDb,
      }));
    } catch {}
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="page animate-fade-in" id="settings-page" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-8)' }}>
        <h1 style={{ marginBottom: 'var(--space-2)' }}>Settings</h1>
        <p>Configure ClubCut Edit to your preferences.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 'var(--space-6)' }}>
        {/* Section Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {SECTIONS.map(sec => (
            <button
              key={sec.id}
              id={`settings-nav-${sec.id}`}
              onClick={() => setActiveSection(sec.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: activeSection === sec.id ? 'var(--bg-active)' : 'transparent',
                color: activeSection === sec.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
                fontWeight: activeSection === sec.id ? 600 : 400,
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all var(--transition-fast)',
              }}
            >
              <span>{sec.icon}</span>
              {sec.label}
            </button>
          ))}
        </nav>

        {/* Settings panel */}
        <div className="card glass animate-scale-in">

          {/* ── General ─────────────────────────────────── */}
          {activeSection === 'general' && (
            <div>
              <h3 style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--text-lg)' }}>⚙️ General</h3>
              <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-5)' }}>App appearance and UI preferences.</p>

              <SettingRow label="Theme" desc="Choose between dark and light mode.">
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {(['dark', 'light'] as const).map(t => (
                    <button
                      key={t}
                      id={`theme-option-${t}`}
                      onClick={() => theme !== t && toggleTheme()}
                      className={`btn btn-sm ${theme === t ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
                    </button>
                  ))}
                </div>
              </SettingRow>
            </div>
          )}

          {/* ── Transcription ───────────────────────────── */}
          {activeSection === 'transcription' && (
            <div>
              <h3 style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--text-lg)' }}>🎙️ Transcription</h3>
              <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-5)' }}>Configure faster-whisper model and processing behaviour.</p>

              <SettingRow label="Default Model" desc="Whisper model used when uploading. Can be changed per file.">
                <select
                  id="default-model-select"
                  value={defaultModel}
                  onChange={e => setDefaultModel(e.target.value)}
                  className="input"
                  style={{ width: 140 }}
                >
                  {['tiny', 'base', 'small', 'medium'].map(m => (
                    <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                  ))}
                </select>
              </SettingRow>

              <SettingRow label="Default Mode" desc="Quick (transcription only) or Deep (full pipeline).">
                <select
                  id="default-mode-select"
                  value={defaultMode}
                  onChange={e => setDefaultMode(e.target.value)}
                  className="input"
                  style={{ width: 140 }}
                >
                  <option value="quick">⚡ Quick</option>
                  <option value="deep">🔬 Deep</option>
                </select>
              </SettingRow>

              <SettingRow label="CPU Threads" desc="Limits cores used to keep system responsive.">
                <select
                  id="cpu-threads-select"
                  value={cpuThreads}
                  onChange={e => setCpuThreads(e.target.value)}
                  className="input"
                  style={{ width: 140 }}
                >
                  <option value="auto">Auto (recommended)</option>
                  {[1, 2, 4, 6, 8].map(n => (
                    <option key={n} value={n}>{n} core{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </SettingRow>

              <SettingRow label="Auto Audio Normalization" desc="Automatically normalize uploaded media to 16kHz mono WAV via FFmpeg.">
                <Toggle id="auto-normalize-toggle" checked={autoNormalize} onChange={setAutoNormalize} />
              </SettingRow>
            </div>
          )}

          {/* ── AI & Groq Cloud ────────────────────────── */}
          {activeSection === 'ai' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <h3 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>🤖 AI & Groq Cloud</h3>
                <span className="badge badge-primary">⚡ Recommended</span>
              </div>
              <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-5)', color: 'var(--text-secondary)' }}>
                Configure Groq Cloud for instant speaker auto-splitting & diarization, or local Ollama for summaries.
              </p>

              {/* Groq Cloud First-Class Card */}
              <div className="card glass" style={{
                marginBottom: 'var(--space-6)',
                padding: 'var(--space-5)',
                border: '1.5px solid var(--brand-primary)',
                background: 'rgba(124, 110, 250, 0.05)',
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18 }}>⚡</span>
                      <strong style={{ fontSize: 'var(--text-md)', color: 'var(--text-primary)' }}>Groq Cloud Diarization & Fast LLM</strong>
                      <span className="badge badge-success">Free Tier</span>
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
                      Splits merged speaker turns, detects speaker names, and preserves exact millisecond word timestamps in ~2 seconds.
                    </div>
                  </div>
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                  >
                    <span>🔑</span> Get Free Key at console.groq.com ↗
                  </a>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Groq API Key (gsk_...)
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        id="groq-api-key"
                        type={showGroqKey ? 'text' : 'password'}
                        className="input"
                        placeholder="gsk_..."
                        value={groqKey}
                        onChange={(e) => {
                          setGroqKey(e.target.value);
                          setGroqStatus(null);
                        }}
                        style={{ flex: 1, fontFamily: showGroqKey ? 'var(--font-mono)' : 'inherit' }}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowGroqKey(!showGroqKey)}
                        title={showGroqKey ? 'Hide key' : 'Show key'}
                      >
                        {showGroqKey ? '🙈 Hide' : '👁 Show'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleTestGroq}
                        disabled={testingGroq || !groqKey.trim()}
                        style={{ minWidth: 110 }}
                      >
                        {testingGroq ? 'Testing...' : '⚡ Test Key'}
                      </button>
                    </div>
                  </div>

                  {groqStatus && (
                    <div style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      background: groqStatus.valid ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      border: `1px solid ${groqStatus.valid ? 'var(--brand-success)' : 'var(--brand-danger)'}`,
                      color: groqStatus.valid ? 'var(--brand-success)' : 'var(--brand-danger)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <span>{groqStatus.valid ? '✓' : '✕'}</span>
                      <span>{groqStatus.valid ? 'Connected to Groq Cloud successfully! Ready for 1-click speaker separation.' : groqStatus.message}</span>
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Groq Model for Dialogue Analysis
                    </label>
                    <select
                      id="groq-model-select"
                      className="input"
                      value={groqModel}
                      onChange={(e) => setGroqModel(e.target.value)}
                    >
                      <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Recommended: Best Dialogue & Diarization Accuracy)</option>
                      <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Ultra-Fast: ~800 tokens/sec)</option>
                    </select>
                  </div>
                </div>
              </div>

              <h4 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-3)', color: 'var(--text-primary)' }}>
                Offline & Other Providers
              </h4>

              <SettingRow label="AI Provider" desc="Select LLM backend for transcript summaries and Q&A chat.">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {([
                    { value: 'groq',   label: '⚡ Groq Cloud (Free, Instant)', desc: 'Fastest summaries and Q&A powered by Llama 3.3 70B.' },
                    { value: 'ollama', label: '🦙 Ollama (Local, Offline)', desc: 'Runs fully offline on your machine. Requires Ollama installed.' },
                    { value: 'openai', label: '☁️ OpenAI API (Cloud)', desc: 'Requires OpenAI API key (paid BYOK).' },
                    { value: 'none',   label: '✕ Disabled', desc: 'Disable AI summaries and Q&A chat.' },
                  ] as const).map(p => (
                    <button
                      key={p.value}
                      id={`ai-provider-${p.value}`}
                      onClick={() => setAiProvider(p.value)}
                      style={{
                        background: aiProvider === p.value ? 'rgba(124,110,250,0.10)' : 'var(--glass-bg)',
                        border: `1.5px solid ${aiProvider === p.value ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-3)',
                        textAlign: 'left', cursor: 'pointer', transition: 'all var(--transition-fast)', color: 'var(--text-primary)',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 2 }}>{p.label}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{p.desc}</div>
                    </button>
                  ))}
                </div>
              </SettingRow>

              {aiProvider === 'ollama' && (
                <>
                  <SettingRow label="Ollama Server URL" desc="Default: http://localhost:11434">
                    <input id="ollama-url" className="input" value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)} style={{ width: 240 }} />
                  </SettingRow>
                  <SettingRow label="Ollama Model" desc="Model to use for summaries and Q&A.">
                    <input id="ollama-model" className="input" value={ollamaModel} onChange={e => setOllamaModel(e.target.value)} style={{ width: 180 }} placeholder="llama3.2" />
                  </SettingRow>
                </>
              )}

              {aiProvider === 'openai' && (
                <SettingRow label="OpenAI API Key" desc="Your key is stored locally only.">
                  <input
                    id="openai-api-key"
                    className="input"
                    type="password"
                    value={openAiKey}
                    onChange={e => setOpenAiKey(e.target.value)}
                    placeholder="sk-…"
                    style={{ width: 240 }}
                  />
                </SettingRow>
              )}
            </div>
          )}

          {/* ── Storage ─────────────────────────────────── */}
          {activeSection === 'storage' && (
            <div>
              <h3 style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--text-lg)' }}>💾 Storage</h3>
              <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-5)' }}>Database and file storage configuration.</p>

              <SettingRow label="Database" desc="SQLite is zero-config. Switch to PostgreSQL for production.">
                <select
                  id="database-select"
                  value={storageDb}
                  onChange={e => setStorageDb(e.target.value)}
                  className="input"
                  style={{ width: 180 }}
                >
                  <option value="sqlite">SQLite (default)</option>
                  <option value="postgres">PostgreSQL</option>
                </select>
              </SettingRow>

              {storageDb === 'postgres' && (
                <SettingRow label="PostgreSQL URL" desc="Set DATABASE_URL in your .env file.">
                  <input
                    id="postgres-url"
                    className="input"
                    style={{ width: 280 }}
                    placeholder="postgresql://user:pass@localhost/clubcut"
                  />
                </SettingRow>
              )}

              <SettingRow label="Storage Info" desc="Current database and uploads directory.">
                <div style={{ fontSize: 'var(--text-xs)', textAlign: 'right', color: 'var(--text-muted)' }}>
                  <div>📁 ./backend/data/clubcut.db</div>
                  <div style={{ marginTop: 2 }}>📂 ./backend/uploads/</div>
                </div>
              </SettingRow>
            </div>
          )}

          {/* Save button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 'var(--space-6)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--border-subtle)' }}>
            {saveSuccess && (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--brand-success)', fontWeight: 600 }}>
                ✓ Settings saved successfully!
              </span>
            )}
            <button className="btn btn-gradient" id="save-settings-btn" onClick={handleSave}>
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
