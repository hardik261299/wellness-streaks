import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { keys, useHabits, useTeams } from '../api/hooks';
import { useToasts } from '../components/Toasts';

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
    <section>
      <h2>Admin</h2>
      <h3>Habits</h3>
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
          Add habit
        </button>
      </form>
      <ul className="list">
        {habits.data?.map((h) => (
          <li key={h.id} className="card entry">
            <span className="grow">{h.name}</span>
            <button onClick={() => archive.mutate(h.id)} aria-label={`Archive ${h.name}`}>
              Archive
            </button>
            <button
              className="danger"
              aria-label={`Delete ${h.name}`}
              disabled={deleteHabit.isPending}
              onClick={() => {
                if (window.confirm(`Delete "${h.name}"? This cannot be undone.`)) deleteHabit.mutate(h.id);
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      <h3>Teams</h3>
      <form
        className="card form inline"
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
          Create team
        </button>
      </form>
      <ul className="list">
        {teams.data?.map((t) => (
          <li key={t.id} className="card entry">
            <span className="grow">{t.name}</span>
            <small className="muted">{t.timezone}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
