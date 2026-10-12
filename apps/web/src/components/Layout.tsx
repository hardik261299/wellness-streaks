import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useMe } from '../api/hooks';
import { useToasts } from './Toasts';

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

  return (
    <div className="shell">
      <header className="topbar">
        <strong>Wellness Streaks</strong>
        <button className="link" onClick={() => void logout()}>
          Log out
        </button>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <nav className="tabs" aria-label="Main">
        <NavLink to="/" end>
          Today
        </NavLink>
        <NavLink to="/leaderboard">Leaderboard</NavLink>
        {me.data?.role === 'ADMIN' && <NavLink to="/admin">Admin</NavLink>}
      </nav>
    </div>
  );
}
