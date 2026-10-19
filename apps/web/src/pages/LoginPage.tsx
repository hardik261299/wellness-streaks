import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { keys, useMe } from '../api/hooks';
import { IconCheck, IconFlame, IconTrophy, LogoMark } from '../components/icons';

const defaultTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function LoginPage() {
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me.data) return <Navigate to="/" replace />;

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user =
        mode === 'login'
          ? await api.login({ email, password })
          : await api.register({ email, password, name, timezone });
      qc.setQueryData(keys.me, user);
      nav('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <aside className="auth-hero" aria-hidden="true">
        <div className="brand" style={{ color: '#fff' }}>
          <LogoMark size={34} />
          <span>Wellness Streaks</span>
        </div>
        <h1>Small habits. Big team momentum.</h1>
        <p>Check in once a day, keep your streak alive, and see how your team stacks up this week.</p>
        <ul>
          <li>
            <span>
              <IconCheck size={16} />
            </span>
            One-tap daily check-ins
          </li>
          <li>
            <span>
              <IconFlame size={16} />
            </span>
            Streaks that reward consistency
          </li>
          <li>
            <span>
              <IconTrophy />
            </span>
            Weekly team leaderboard
          </li>
        </ul>
      </aside>

      <div className="auth-panel">
        <div className="auth-card">
          <div className="brand mobile-only">
            <LogoMark />
            <span>Wellness Streaks</span>
          </div>
          <form onSubmit={(e) => void submit(e)} className="card form auth-form">
            <div>
              <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>
              <p className="muted">
                {mode === 'login' ? 'Welcome back. Pick up where you left off.' : 'It takes less than a minute.'}
              </p>
            </div>
            {mode === 'register' && (
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
              </label>
            )}
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 8 : 1}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>
            {mode === 'register' && (
              <label>
                Timezone
                <input value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" type="submit" disabled={busy}>
              {mode === 'login' ? 'Log in' : 'Register'}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
            >
              {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
