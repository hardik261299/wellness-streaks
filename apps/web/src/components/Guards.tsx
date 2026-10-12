import { Navigate, Outlet } from 'react-router-dom';
import { useMe } from '../api/hooks';

export function RequireAuth() {
  const me = useMe();
  if (me.isPending) return <p className="center muted">Loading...</p>;
  if (me.isError) return <p className="center error">Could not reach the server.</p>;
  if (!me.data) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireAdmin() {
  const me = useMe();
  if (me.data?.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <Outlet />;
}
