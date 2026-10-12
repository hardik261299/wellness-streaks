import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { keys, useMe } from '../api/hooks';

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
    <div className="auth">
      <h1>Wellness Streaks</h1>
      <form onSubmit={(e) => void submit(e)} className="card form">
        <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>
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
  );
}
