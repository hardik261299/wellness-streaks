import { randomUUID } from 'node:crypto';
import {
  ConflictError,
  type CheckinRecord,
  type HabitRecord,
  type Repo,
  type TeamRecord,
  type UserRecord,
} from './repo';

const key = (u: string, h: string, d: string) => `${u}|${h}|${d}`;

/** Test double. Mirrors the uniqueness rules the Postgres schema enforces. */
export class InMemoryRepo implements Repo {
  private userMap = new Map<string, UserRecord>();
  private habitMap = new Map<string, HabitRecord>();
  private checkinMap = new Map<string, CheckinRecord>();
  private teamMap = new Map<string, TeamRecord>();
  private membership = new Map<string, string>(); // userId -> teamId

  users: Repo['users'] = {
    create: async (input) => {
      const email = input.email.toLowerCase();
      if ([...this.userMap.values()].some((u) => u.email === email)) {
        throw new ConflictError('EMAIL_TAKEN', 'email already registered');
      }
      const rec = { ...input, email, id: randomUUID() };
      this.userMap.set(rec.id, rec);
      return rec;
    },
    findById: async (id) => this.userMap.get(id) ?? null,
    findByEmail: async (email) =>
      [...this.userMap.values()].find((u) => u.email === email.toLowerCase()) ?? null,
  };

  habits: Repo['habits'] = {
    create: async (name) => {
      const rec = { id: randomUUID(), name, archived: false };
      this.habitMap.set(rec.id, rec);
      return rec;
    },
    findById: async (id) => this.habitMap.get(id) ?? null,
    listActive: async () => [...this.habitMap.values()].filter((h) => !h.archived),
    setArchived: async (id, archived) => {
      const h = this.habitMap.get(id);
      if (!h) return null;
      h.archived = archived;
      return { ...h };
    },
  };

  checkins: Repo['checkins'] = {
    find: async (u, h, d) => this.checkinMap.get(key(u, h, d)) ?? null,
    create: async (input) => {
      const k = key(input.userId, input.habitId, input.localDate);
      const existing = this.checkinMap.get(k);
      if (existing) return existing;
      this.checkinMap.set(k, input);
      return input;
    },
    delete: async (u, h, d) => this.checkinMap.delete(key(u, h, d)),
    listForUser: async (userId) => [...this.checkinMap.values()].filter((c) => c.userId === userId),
    listForUsers: async (ids, range) =>
      [...this.checkinMap.values()].filter(
        (c) =>
          ids.includes(c.userId) &&
          (!range || (c.localDate >= range.from && c.localDate <= range.to)),
      ),
  };

  teams: Repo['teams'] = {
    create: async (input) => {
      if ([...this.teamMap.values()].some((t) => t.name === input.name)) {
        throw new ConflictError('TEAM_NAME_TAKEN', 'a team with that name already exists');
      }
      const rec = { ...input, id: randomUUID() };
      this.teamMap.set(rec.id, rec);
      return rec;
    },
    findById: async (id) => this.teamMap.get(id) ?? null,
    list: async () => [...this.teamMap.values()],
  };

  memberships: Repo['memberships'] = {
    activeTeamId: async (userId) => this.membership.get(userId) ?? null,
    join: async (userId, teamId) => {
      if (this.membership.has(userId)) {
        throw new ConflictError('ALREADY_IN_TEAM', 'leave your current team first');
      }
      this.membership.set(userId, teamId);
    },
    leave: async (userId, teamId) =>
      this.membership.get(userId) === teamId ? this.membership.delete(userId) : false,
    memberIds: async (teamId) =>
      [...this.membership.entries()].filter(([, t]) => t === teamId).map(([u]) => u),
  };
}
