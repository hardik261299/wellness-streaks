import { useHabits, useMe, useStreaks, useToggleCheckin } from '../api/hooks';
import { localDateIn } from '../lib/dates';
import { useToasts } from '../components/Toasts';

export default function TodayPage() {
  const me = useMe();
  const habits = useHabits();
  const streaks = useStreaks();
  const toasts = useToasts();
  const today = localDateIn(me.data?.timezone ?? 'UTC', new Date());
  const toggle = useToggleCheckin(today, toasts.error);

  if (habits.isPending || streaks.isPending) return <p className="muted">Loading...</p>;
  if (habits.isError || streaks.isError) return <p className="error">Could not load your habits.</p>;
  if (habits.data.length === 0) return <p className="muted">No habits yet. Ask an admin to add some.</p>;

  const byHabit = new Map(streaks.data.streaks.map((s) => [s.habitId, s]));
  return (
    <section>
      <h2>Today</h2>
      <p className="muted">{today}</p>
      <ul className="list">
        {habits.data.map((h) => {
          const s = byHabit.get(h.id);
          const checked = s?.checkedInToday ?? false;
          return (
            <li key={h.id} className={`card habit${checked ? ' done' : ''}`}>
              <button
                className="check"
                role="switch"
                aria-checked={checked}
                aria-label={h.name}
                onClick={() => toggle.mutate({ habitId: h.id, checked: !checked })}
              >
                {checked ? '✓' : ''}
              </button>
              <span className="grow">{h.name}</span>
              <span className="badge" title="Current streak">
                {s?.current ?? 0}d
              </span>
              <span className="badge subtle" title="Longest streak">
                best {s?.longest ?? 0}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
