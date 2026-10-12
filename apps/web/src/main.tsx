import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

async function start(): Promise<void> {
  if (import.meta.env.VITE_MOCK === '1') {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }
  const el = document.getElementById('root');
  if (!el) throw new Error('missing #root');
  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
