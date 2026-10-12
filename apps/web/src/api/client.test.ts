import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { routes } from '@wellness/shared';
import { api, ApiError, ContractError } from './client';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('api client', () => {
  it('throws ContractError when a response does not match the shared schema', async () => {
    server.use(http.get(routes.myStreaks.path, () => HttpResponse.json({ streaks: [{ habitId: 'h1' }] })));
    await expect(api.myStreaks()).rejects.toBeInstanceOf(ContractError);
  });

  it('throws ApiError parsed from the errorResponse shape', async () => {
    server.use(
      http.get(routes.myStreaks.path, () =>
        HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'nope' } }, { status: 401 }),
      ),
    );
    await expect(api.myStreaks()).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    await expect(api.myStreaks()).rejects.toBeInstanceOf(ApiError);
  });

  it('sends the week query and parses the leaderboard', async () => {
    let seen = '';
    server.use(
      http.get(routes.leaderboard.path, ({ request }) => {
        seen = new URL(request.url).search;
        return HttpResponse.json({ weekStart: '2026-10-05', entries: [] });
      }),
    );
    const res = await api.leaderboard('2026-10-05');
    expect(seen).toBe('?week=2026-10-05');
    expect(res.entries).toEqual([]);
  });
});
