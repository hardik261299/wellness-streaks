import { render } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { AppRoutes, Providers } from '../App';
import { createDb, type MockDb } from '../mocks/db';
import { createHandlers } from '../mocks/handlers';

export function newMock(signedInAs?: string): { db: MockDb; server: ReturnType<typeof setupServer> } {
  const db = createDb();
  if (signedInAs) db.sessionUserId = signedInAs;
  return { db, server: setupServer(...createHandlers(db)) };
}

export function renderApp(path = '/') {
  return render(
    <Providers initialEntries={[path]}>
      <AppRoutes />
    </Providers>,
  );
}
