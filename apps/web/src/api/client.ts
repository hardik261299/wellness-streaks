import { z } from 'zod';
import {
  checkinSchema,
  createHabitBody,
  createTeamBody,
  errorResponse,
  habitSchema,
  leaderboardResponse,
  loginBody,
  registerBody,
  routes,
  streaksResponse,
  teamSchema,
  userSchema,
} from '@wellness/shared';

type Route = { method: string; path: string };

/** Non-2xx response from the API, parsed with the shared errorResponse schema. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Response did not match the shared zod schema (contract drift). */
export class ContractError extends Error {
  constructor(
    public readonly route: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(`Response from ${route} did not match the API contract`);
    this.name = 'ContractError';
  }
}

function buildPath(route: Route, params: Record<string, string> = {}): string {
  return route.path.replace(/:(\w+)/g, (_, k: string) => encodeURIComponent(params[k] ?? ''));
}

interface CallOptions {
  params?: Record<string, string>;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

async function call<T>(route: Route, schema: z.ZodType<T, z.ZodTypeDef, unknown>, opts: CallOptions = {}): Promise<T> {
  let url = `${window.location.origin}${buildPath(route, opts.params)}`;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) qs.set(k, v);
  if (qs.size > 0) url += `?${qs.toString()}`;

  const res = await fetch(url, {
    method: route.method,
    credentials: 'include',
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let json: unknown = undefined;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }

  if (!res.ok) {
    const parsed = errorResponse.safeParse(json);
    if (!parsed.success) throw new ContractError(`${route.method} ${route.path} (error body)`, parsed.error.issues);
    throw new ApiError(res.status, parsed.data.error.code, parsed.data.error.message);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ContractError(`${route.method} ${route.path}`, parsed.error.issues);
  return parsed.data;
}

// The contract does not define bodies for some responses (see README assumptions):
// accept either a bare value or a wrapper object, and empty bodies for no-content calls.
const habitList = z.union([z.array(habitSchema), z.object({ habits: z.array(habitSchema) }).transform((v) => v.habits)]);
const teamList = z.union([z.array(teamSchema), z.object({ teams: z.array(teamSchema) }).transform((v) => v.teams)]);
const userResp = z.union([userSchema, z.object({ user: userSchema }).transform((v) => v.user)]);
const empty = z.undefined().or(z.object({}).passthrough()).transform(() => undefined);

export const api = {
  register: (body: z.input<typeof registerBody>) =>
    call(routes.register, userResp, { body: registerBody.parse(body) }),
  login: (body: z.input<typeof loginBody>) => call(routes.login, userResp, { body: loginBody.parse(body) }),
  logout: () => call(routes.logout, empty),
  me: () => call(routes.me, userResp),
  listHabits: () => call(routes.listHabits, habitList),
  createHabit: (body: z.input<typeof createHabitBody>) =>
    call(routes.createHabit, habitSchema, { body: createHabitBody.parse(body) }),
  archiveHabit: (id: string) => call(routes.patchHabit, habitSchema, { params: { id }, body: { archived: true } }),
  deleteHabit: (id: string) => call(routes.deleteHabit, empty, { params: { id } }),
  putCheckin: (habitId: string, date: string) =>
    call(routes.putCheckin, checkinSchema, { params: { id: habitId, date } }),
  deleteCheckin: (habitId: string, date: string) =>
    call(routes.deleteCheckin, empty, { params: { id: habitId, date } }),
  myStreaks: () => call(routes.myStreaks, streaksResponse),
  listTeams: () => call(routes.listTeams, teamList),
  createTeam: (body: z.input<typeof createTeamBody>) =>
    call(routes.createTeam, teamSchema, { body: createTeamBody.parse(body) }),
  joinTeam: (id: string) => call(routes.joinTeam, empty, { params: { id } }),
  leaveTeam: (id: string) => call(routes.leaveTeam, empty, { params: { id } }),
  leaderboard: (week?: string) => call(routes.leaderboard, leaderboardResponse, { query: { week } }),
};
