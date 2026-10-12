import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from './components/Toasts';
import { Layout } from './components/Layout';
import { RequireAuth, RequireAdmin } from './components/Guards';
import LoginPage from './pages/LoginPage';
import TodayPage from './pages/TodayPage';
import LeaderboardPage from './pages/LeaderboardPage';
import AdminPage from './pages/AdminPage';

export function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<TodayPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

interface ProvidersProps {
  children: ReactNode;
  client?: QueryClient;
  /** Tests pass this to use a MemoryRouter instead of BrowserRouter. */
  initialEntries?: string[];
}

export function Providers({ children, client, initialEntries }: ProvidersProps) {
  const [qc] = useState(() => client ?? makeQueryClient());
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        {initialEntries ? (
          <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
        ) : (
          <BrowserRouter>{children}</BrowserRouter>
        )}
      </ToastProvider>
    </QueryClientProvider>
  );
}

export function App() {
  return (
    <Providers>
      <AppRoutes />
    </Providers>
  );
}
