import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { keys, useLeaderboard, useMe, useTeams } from '../api/hooks';
import { addDays, localDateIn, mondayOf } from '../lib/dates';
import { useToasts } from '../components/Toasts';
import { IconChevronLeft, IconChevronRight, IconUsers } from '../components/icons';

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
    <section className="section">
      <div className="page-head">
        <div>
          <h2>Leaderboard</h2>
          <p className="muted">Share of team members checking in each day this week.</p>
        </div>
        <div className="weeknav">
          <button onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">
            <IconChevronLeft />
          </button>
          <span>Week of {week}</span>
          <button onClick={() => setWeek(addDays(week, 7))} aria-label="Next week" disabled={week >= currentMonday}>
            <IconChevronRight />
          </button>
        </div>
      </div>

      {board.isPending && (
        <div className="section" aria-busy="true">
          <p className="sr-only">Loading...</p>
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}
      {board.isError && <p className="error">Could not load the leaderboard.</p>}
      {board.data &&
        (board.data.entries.length === 0 ? (
          <div className="empty">
            <strong>No teams yet</strong>
            <span>An admin can create the first team from the Admin tab.</span>
          </div>
        ) : (
          <ol className="list">
            {board.data.entries.map((e) => {
              const mine = e.teamId === myTeamId;
              const score = Math.max(0, Math.min(100, e.score));
              return (
                <li
                  key={e.teamId}
                  className={`card entry${mine ? ' mine' : ''}${e.rank <= 3 ? ` rank-${e.rank}` : ''}`}
                  data-mine={mine}
                >
                  <span className="rank">{e.rank}</span>
                  <div className="entry-main">
                    <div className="entry-title">
                      <strong>{e.teamName}</strong>
                      {mine && <span className="badge">your team</span>}
                      <small className="muted">
                        {e.memberCount} {e.memberCount === 1 ? 'member' : 'members'}
                      </small>
                    </div>
                    <div className="meter" aria-hidden="true">
                      <span style={{ width: `${score}%` }} />
                    </div>
                  </div>
                  <strong className="score">{Math.round(e.score)}%</strong>
                </li>
              );
            })}
          </ol>
        ))}

      <div className="section-head">
        <h3>Teams</h3>
        {myTeamId !== null && <span className="muted">Leave your team to join another.</span>}
      </div>
      {teams.data && (
        <ul className="list">
          {teams.data.map((t) => (
            <li key={t.id} className="card team-row">
              <IconUsers />
              <span className="grow">
                <strong>{t.name}</strong>
              </span>
              {t.id === myTeamId ? (
                <button className="small" onClick={() => void membership('leave', t.id)}>
                  Leave {t.name}
                </button>
              ) : (
                <button
                  className="small primary"
                  disabled={myTeamId !== null}
                  title={myTeamId !== null ? 'Leave your current team first' : undefined}
                  onClick={() => void membership('join', t.id)}
                >
                  Join {t.name}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
