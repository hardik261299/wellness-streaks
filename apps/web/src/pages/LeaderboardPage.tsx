import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { keys, useLeaderboard, useMe, useTeams } from '../api/hooks';
import { addDays, localDateIn, mondayOf } from '../lib/dates';
import { useToasts } from '../components/Toasts';

export default function LeaderboardPage() {
  const me = useMe();
  const qc = useQueryClient();
  const toasts = useToasts();
  const teams = useTeams();
  const currentMonday = mondayOf(localDateIn(me.data?.timezone ?? 'UTC', new Date()));
  const [week, setWeek] = useState(currentMonday);
  const board = useLeaderboard(week);
  const myTeamId = me.data?.teamId ?? null;

  async function membership(action: 'join' | 'leave', teamId: string): Promise<void> {
    try {
      if (action === 'join') await api.joinTeam(teamId);
      else await api.leaveTeam(teamId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.me }),
        qc.invalidateQueries({ queryKey: ['leaderboard'] }),
      ]);
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : 'Could not update team');
    }
  }

  return (
    <section>
      <h2>Leaderboard</h2>
      <div className="weeknav">
        <button onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">
          &lsaquo;
        </button>
        <span>Week of {week}</span>
        <button onClick={() => setWeek(addDays(week, 7))} aria-label="Next week" disabled={week >= currentMonday}>
          &rsaquo;
        </button>
      </div>
      {board.isPending && <p className="muted">Loading...</p>}
      {board.isError && <p className="error">Could not load the leaderboard.</p>}
      {board.data &&
        (board.data.entries.length === 0 ? (
          <p className="muted">No teams yet.</p>
        ) : (
          <ol className="list">
            {board.data.entries.map((e) => {
              const mine = e.teamId === myTeamId;
              return (
                <li key={e.teamId} className={`card entry${mine ? ' mine' : ''}`} data-mine={mine}>
                  <span className="rank">{e.rank}</span>
                  <span className="grow">
                    {e.teamName}
                    {mine && <span className="badge"> your team</span>}
                    <small className="muted"> {e.memberCount} members</small>
                  </span>
                  <strong>{Math.round(e.score)}%</strong>
                </li>
              );
            })}
          </ol>
        ))}

      <h3>Teams</h3>
      {teams.data && (
        <ul className="list">
          {teams.data.map((t) => (
            <li key={t.id} className="card entry">
              <span className="grow">{t.name}</span>
              {t.id === myTeamId ? (
                <button onClick={() => void membership('leave', t.id)}>Leave {t.name}</button>
              ) : (
                <button onClick={() => void membership('join', t.id)}>Join {t.name}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
