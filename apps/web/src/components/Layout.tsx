import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useMe } from '../api/hooks';
import { useToasts } from './Toasts';
import { IconLogout, IconShield, IconToday, IconTrophy, LogoMark } from './icons';

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

export function Layout() {
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toasts = useToasts();

  async function logout(): Promise<void> {
    try {
      await api.logout();
      qc.clear();
      nav('/login');
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : 'Logout failed');
    }
  }

  // One element tree that reflows: top bar + bottom tabs on phones, a sidebar on desktop (see styles.css).
  return (
    <div className="app">
      <header className="chrome">
        <div className="brand">
          <LogoMark />
          <span>Wellness Streaks</span>
        </div>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>
            <IconToday />
            Today
          </NavLink>
          <NavLink to="/leaderboard">
            <IconTrophy />
            Leaderboard
          </NavLink>
          {me.data?.role === 'ADMIN' && (
            <NavLink to="/admin">
              <IconShield />
              Admin
            </NavLink>
          )}
        </nav>
        <div className="account">
          {me.data && (
            <>
              <span className="avatar" aria-hidden="true">
                {initials(me.data.name)}
              </span>
              <span className="account-meta">
                <strong>{me.data.name}</strong>
                <small>{me.data.role === 'ADMIN' ? 'Administrator' : 'Member'}</small>
              </span>
            </>
          )}
          <button className="link" onClick={() => void logout()}>
            <IconLogout />
            Log out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
