import { randomUUID } from 'node:crypto';
import type { CheckinRecord, HabitRecord, Repo, TeamRecord, UserRecord } from './repo';

const key = (u: string, h: string, d: string) => `${u}|${h}|${d}`;

export class InMemoryRepo implements Repo {
  private userMap = new Map<string, UserRecord>();
  private habitMap = new Map<string, HabitRecord>();
  private checkinMap = new Map<string, CheckinRecord>();
  private teamMap = new Map<string, TeamRecord>();
  private membership = new Map<string, string>(); // userId -> teamId

  users: Repo['users'] = {
    create: async (input) => {
      const rec = { ...input, id: randomUUID() };
      this.userMap.set(rec.id, rec);
      return rec;
    },
    findById: async (id) => this.userMap.get(id) ?? null,
    findByEmail: async (email) =>
      [...this.userMap.values()].find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null,
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
    listForUsers: async (ids) => [...this.checkinMap.values()].filter((c) => ids.includes(c.userId)),
  };

  teams: Repo['teams'] = {
    create: async (input) => {
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
      if (this.membership.has(userId)) throw new Error('user already has an active membership');
      this.membership.set(userId, teamId);
    },
    leave: async (userId, teamId) =>
      this.membership.get(userId) === teamId ? this.membership.delete(userId) : false,
    memberIds: async (teamId) =>
      [...this.membership.entries()].filter(([, t]) => t === teamId).map(([u]) => u),
  };
}
