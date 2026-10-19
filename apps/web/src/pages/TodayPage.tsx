import { useHabits, useMe, useStreaks, useToggleCheckin } from '../api/hooks';
import { localDateIn } from '../lib/dates';
import { useToasts } from '../components/Toasts';
import { IconCheck, IconFlame } from '../components/icons';

const greeting = (timezone: string): string => {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: timezone }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

const friendlyDate = (timezone: string): string =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone }).format(new Date());

/** Progress ring: single hue, thin stroke, round cap; the number in the middle carries the value. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const pct = total === 0 ? 0 : done / total;
  return (
    <div className="ring" role="img" aria-label={`${done} of ${total} habits done today`}>
      <svg width="104" height="104" viewBox="0 0 104 104">
        <circle className="ring-track" cx="52" cy="52" r={r} fill="none" strokeWidth="9" />
        <circle
          className="ring-fill"
          cx="52"
          cy="52"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="ring-label" aria-hidden="true">
        <strong>
          {done}/{total}
        </strong>
        <span>done</span>
      </div>
    </div>
  );
}

export default function TodayPage() {
  const me = useMe();
  const habits = useHabits();
  const streaks = useStreaks();
  const toasts = useToasts();
  const timezone = me.data?.timezone ?? 'UTC';
  const today = localDateIn(timezone, new Date());
  const toggle = useToggleCheckin(today, toasts.error);

  if (habits.isPending || streaks.isPending) {
    return (
      <section className="section" aria-busy="true">
        <p className="sr-only">Loading...</p>
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </section>
    );
  }
  if (habits.isError || streaks.isError) return <p className="error">Could not load your habits.</p>;
  if (habits.data.length === 0) {
    return (
      <section className="section">
        <h2>Today</h2>
        <div className="empty">
          <strong>No habits yet</strong>
          <span>Ask an admin to add some, then they will show up here.</span>
        </div>
      </section>
    );
  }

  const byHabit = new Map(streaks.data.streaks.map((s) => [s.habitId, s]));
  const done = habits.data.filter((h) => byHabit.get(h.id)?.checkedInToday).length;
  const total = habits.data.length;
  const bestCurrent = Math.max(0, ...habits.data.map((h) => byHabit.get(h.id)?.current ?? 0));
  const firstName = me.data?.name.split(' ')[0];

  return (
    <section className="section">
      <div className="card hero">
        <ProgressRing done={done} total={total} />
        <div className="hero-text">
          <span className="eyebrow">{friendlyDate(timezone)}</span>
          <h2>Today</h2>
          <p className="muted">
            {greeting(timezone)}
            {firstName ? `, ${firstName}` : ''}.{' '}
            {done === total ? 'All habits done. Nice work!' : `${total - done} left to go.`}
          </p>
          {bestCurrent > 0 && (
            <span className="chip" style={{ justifySelf: 'start' }}>
              <IconFlame /> {bestCurrent}-day streak going
            </span>
          )}
        </div>
      </div>

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
                <IconCheck />
              </button>
              <div className="habit-main">
                <span className="habit-name">{h.name}</span>
                <span className="habit-sub">{checked ? 'Done for today' : 'Tap the circle to check in'}</span>
              </div>
              <div className="streaks">
                <span className="chip" title="Current streak">
                  <IconFlame />
                  {s?.current ?? 0}d
                </span>
                <span className="chip quiet" title="Longest streak">
                  best {s?.longest ?? 0}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
