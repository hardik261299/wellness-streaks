import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { routes } from '@wellness/shared';
import { createDb, type MockDb } from '../mocks/db';
import { createHandlers } from '../mocks/handlers';
import { newMock, renderApp } from './utils';

const mock = newMock();
let db: MockDb = mock.db;

beforeAll(() => mock.server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  db = createDb(); // fresh state per test
  mock.server.resetHandlers(...createHandlers(db));
});
afterAll(() => mock.server.close());

function signIn(id: string): void {
  db.sessionUserId = id;
}

describe('login flow', () => {
  it('redirects to login, logs in, lands on Today', async () => {
    db.sessionUserId = null;
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument();
  });

  it('shows the API error on bad credentials', async () => {
    db.sessionUserId = null;
    renderApp('/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('register defaults timezone to the browser timezone', async () => {
    db.sessionUserId = null;
    renderApp('/login');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /register/i }));
    expect(screen.getByLabelText('Timezone')).toHaveValue(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('Today check-in toggle', () => {
  it('checks in optimistically, bumps streak, and unchecks', async () => {
    signIn('user');
    renderApp('/');
    const user = userEvent.setup();
    const toggle = await screen.findByRole('switch', { name: 'Drink water' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Drink water' })).toHaveAttribute('aria-checked', 'true'));
    const row = screen.getByRole('switch', { name: 'Drink water' }).closest('li') as HTMLElement;
    await waitFor(() => expect(within(row).getByTitle('Current streak')).toHaveTextContent('1d'));
    await user.click(screen.getByRole('switch', { name: 'Drink water' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Drink water' })).toHaveAttribute('aria-checked', 'false'));
  });

  it('rolls back and shows an error toast when the API fails', async () => {
    signIn('user');
    mock.server.use(
      http.put(routes.putCheckin.path, () =>
        HttpResponse.json({ error: { code: 'BOOM', message: 'Server exploded' } }, { status: 500 }),
      ),
    );
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: 'Walk 10 minutes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded');
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Walk 10 minutes' })).toHaveAttribute('aria-checked', 'false'));
  });
});

describe('admin-only visibility', () => {
  it('hides the Admin tab and blocks /admin for employees', async () => {
    signIn('user');
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('shows Admin and lets an admin create a habit', async () => {
    signIn('admin');
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: 'Admin' }));
    await user.type(await screen.findByLabelText('Habit name'), 'Stretch');
    await user.click(screen.getByRole('button', { name: 'Add habit' }));
    expect(await screen.findByText('Stretch')).toBeInTheDocument();
  });
});

describe('admin deletes habits', () => {
  afterEach(() => vi.restoreAllMocks());

  async function openAdmin() {
    signIn('admin');
    renderApp('/admin');
    return userEvent.setup();
  }

  it('deletes an unused habit after confirming', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = await openAdmin();
    await user.type(await screen.findByLabelText('Habit name'), 'GYM');
    await user.click(screen.getByRole('button', { name: 'Add habit' }));
    expect(await screen.findByText('GYM')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete GYM' }));
    await waitFor(() => expect(screen.queryByText('GYM')).not.toBeInTheDocument());
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('GYM'));
  });

  it('does nothing when the confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = await openAdmin();
    await user.click(await screen.findByRole('button', { name: 'Delete Drink water' }));
    expect(screen.getByText('Drink water')).toBeInTheDocument();
    expect(db.habits.some((h) => h.name === 'Drink water')).toBe(true);
  });

  it('shows the API message and keeps the habit when it has check-ins (archive instead)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = await openAdmin();
    // "Walk 10 minutes" has seeded check-ins
    await user.click(await screen.findByRole('button', { name: 'Delete Walk 10 minutes' }));
    expect(await screen.findByText(/archive it instead/i)).toBeInTheDocument();
    expect(screen.getByText('Walk 10 minutes')).toBeInTheDocument();
  });
});

describe('leaderboard', () => {
  it('ranks teams by score and highlights the current user team', async () => {
    signIn('m4'); // member of Bravo
    renderApp('/leaderboard');
    const items = await screen.findAllByRole('listitem');
    const ranked = items.filter((li) => li.classList.contains('entry') && li.querySelector('.rank'));
    expect(ranked.length).toBe(3);
    expect(ranked[0]).toHaveTextContent('Alpha');
    const mine = ranked.filter((li) => li.getAttribute('data-mine') === 'true');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toHaveTextContent('Bravo');
    expect(mine[0]).toHaveTextContent('your team');
  });

  it('lets a user join and leave a team, and navigate weeks', async () => {
    signIn('user');
    renderApp('/leaderboard');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Join Charlie' }));
    expect(await screen.findByRole('button', { name: 'Leave Charlie' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    await screen.findByText(/Week of/);
    expect(screen.getByRole('button', { name: 'Next week' })).toBeEnabled();
  });

  it('disables joining other teams while in one (one active team, SPEC 5.8)', async () => {
    signIn('user');
    renderApp('/leaderboard');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Join Charlie' }));
    await screen.findByRole('button', { name: 'Leave Charlie' });
    expect(screen.getByRole('button', { name: 'Join Alpha' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Leave Charlie' }));
    expect(await screen.findByRole('button', { name: 'Join Alpha' })).toBeEnabled();
  });
});
