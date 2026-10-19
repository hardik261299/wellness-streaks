import type { User } from '@wellness/shared';

type Role = User['role'];

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  timezone: string;
  passwordHash: string;
}
export interface HabitRecord {
  id: string;
  name: string;
  archived: boolean;
}
export interface CheckinRecord {
  userId: string;
  habitId: string;
  localDate: string;
  createdAt: Date;
}
export interface TeamRecord {
  id: string;
  name: string;
  timezone: string;
}

/** Thrown by a Repo when a uniqueness rule is violated (including races the route's pre-check missed). */
export class ConflictError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Repo {
  users: {
    create(input: Omit<UserRecord, 'id'>): Promise<UserRecord>;
    findById(id: string): Promise<UserRecord | null>;
    /** email lookup is case-insensitive */
    findByEmail(email: string): Promise<UserRecord | null>;
  };
  habits: {
    create(name: string): Promise<HabitRecord>;
    findById(id: string): Promise<HabitRecord | null>;
    listActive(): Promise<HabitRecord[]>;
    setArchived(id: string, archived: boolean): Promise<HabitRecord | null>;
    /** Returns false if the habit does not exist. Throws ConflictError('HABIT_HAS_CHECKINS') if any
     *  check-in references it; the Repo enforces this itself, so a racing check-in cannot be orphaned. */
    remove(id: string): Promise<boolean>;
  };
  checkins: {
    find(userId: string, habitId: string, localDate: string): Promise<CheckinRecord | null>;
    /** Must be idempotent on (userId, habitId, localDate): returns existing row if present. */
    create(input: CheckinRecord): Promise<CheckinRecord>;
    delete(userId: string, habitId: string, localDate: string): Promise<boolean>;
    listForUser(userId: string): Promise<CheckinRecord[]>;
    /** Inclusive local-date range (YYYY-MM-DD) keeps leaderboard reads bounded to one week. */
    listForUsers(userIds: string[], range?: { from: string; to: string }): Promise<CheckinRecord[]>;
  };
  teams: {
    create(input: Omit<TeamRecord, 'id'>): Promise<TeamRecord>;
    findById(id: string): Promise<TeamRecord | null>;
    list(): Promise<TeamRecord[]>;
  };
  memberships: {
    /** Team id of the user's single active membership, or null. */
    activeTeamId(userId: string): Promise<string | null>;
    /** Caller checks activeTeamId first, but the Repo must still enforce one active membership
     *  and throw ConflictError('ALREADY_IN_TEAM') if two joins race. */
    join(userId: string, teamId: string): Promise<void>;
    /** Returns false if the user had no active membership in that team. */
    leave(userId: string, teamId: string): Promise<boolean>;
    memberIds(teamId: string): Promise<string[]>;
  };
}
