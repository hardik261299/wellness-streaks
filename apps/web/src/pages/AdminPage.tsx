import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { keys, useHabits, useTeams } from '../api/hooks';
import { useToasts } from '../components/Toasts';
import { IconArchive, IconPlus, IconTrash } from '../components/icons';

export default function AdminPage() {
  const qc = useQueryClient();
  const toasts = useToasts();
  const habits = useHabits();
  const teams = useTeams();
  const [habitName, setHabitName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamTz, setTeamTz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const onError = (e: unknown): void => toasts.error(e instanceof Error ? e.message : 'Request failed');

  const refreshHabits = async (): Promise<void> => {
    await qc.invalidateQueries({ queryKey: keys.habits });
    await qc.invalidateQueries({ queryKey: keys.streaks });
  };
  const refreshTeams = async (): Promise<void> => {
    await qc.invalidateQueries({ queryKey: keys.teams });
    await qc.invalidateQueries({ queryKey: ['leaderboard'] });
  };

  const createHabit = useMutation({
    mutationFn: api.createHabit,
    onSuccess: async () => {
      setHabitName('');
      await refreshHabits();
    },
    onError,
  });
  const archive = useMutation({ mutationFn: api.archiveHabit, onSuccess: refreshHabits, onError });
  // The API refuses (409) when the habit has check-ins; its message tells the admin to archive instead.
  const deleteHabit = useMutation({ mutationFn: api.deleteHabit, onSuccess: refreshHabits, onError });
  const createTeam = useMutation({
    mutationFn: api.createTeam,
    onSuccess: async () => {
      setTeamName('');
      await refreshTeams();
    },
    onError,
  });

  return (
    <section className="section">
      <div className="page-head">
        <div>
          <h2>Admin</h2>
          <p className="muted">Manage the habits everyone tracks and the teams they compete in.</p>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h3>Habits</h3>
          {habits.data && <span className="chip quiet">{habits.data.length} active</span>}
        </div>
        <form
          className="card form inline"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            createHabit.mutate({ name: habitName });
          }}
        >
          <label>
            Habit name
            <input value={habitName} onChange={(e) => setHabitName(e.target.value)} required maxLength={80} />
          </label>
          <button className="primary" type="submit" disabled={createHabit.isPending}>
            <IconPlus />
            Add habit
          </button>
        </form>
        {habits.data && habits.data.length === 0 && (
          <div className="empty">
            <strong>No habits yet</strong>
            <span>Add the first one above.</span>
          </div>
        )}
        <ul className="list">
          {habits.data?.map((h) => (
            <li key={h.id} className="card team-row">
              <span className="grow">
                <strong>{h.name}</strong>
              </span>
              <button className="small" onClick={() => archive.mutate(h.id)} aria-label={`Archive ${h.name}`}>
                <IconArchive />
                Archive
              </button>
              <button
                className="small danger"
                aria-label={`Delete ${h.name}`}
                disabled={deleteHabit.isPending}
                onClick={() => {
                  if (window.confirm(`Delete "${h.name}"? This cannot be undone.`)) deleteHabit.mutate(h.id);
                }}
              >
                <IconTrash />
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="section">
        <div className="section-head">
          <h3>Teams</h3>
          {teams.data && <span className="chip quiet">{teams.data.length} total</span>}
        </div>
        <form
          className="card form inline two"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            createTeam.mutate({ name: teamName, timezone: teamTz });
          }}
        >
          <label>
            Team name
            <input value={teamName} onChange={(e) => setTeamName(e.target.value)} required maxLength={80} />
          </label>
          <label>
            Team timezone
            <input value={teamTz} onChange={(e) => setTeamTz(e.target.value)} required />
          </label>
          <button className="primary" type="submit" disabled={createTeam.isPending}>
            <IconPlus />
            Create team
          </button>
        </form>
        {teams.data && teams.data.length === 0 && (
          <div className="empty">
            <strong>No teams yet</strong>
            <span>Create a team so people can join and compete.</span>
          </div>
        )}
        <ul className="list">
          {teams.data?.map((t) => (
            <li key={t.id} className="card team-row">
              <span className="grow">
                <strong>{t.name}</strong>
              </span>
              <span className="chip quiet">{t.timezone}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
