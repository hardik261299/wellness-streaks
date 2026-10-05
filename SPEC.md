# SPEC: Wellness Streaks

Status: DRAFT v0.1. Owner: Hardik. Edit freely; this is the source of truth for scope.

## 1. Problem
HR teams at mid-size companies run wellness programs (walk daily, drink water, sleep 7h) but have no lightweight way to let employees log habits and see team-level engagement. Existing tools are heavy, per-seat priced, or spreadsheets.

## 2. Goals
- Employees log a daily habit check-in in under 10 seconds.
- Employees see their current and longest streak per habit.
- Teams compete on a weekly leaderboard that rewards consistency, not volume.
- Admins create habits and challenges without engineering help.

## 3. Non-goals (v1)
Wearable integrations, SSO, push notifications, native mobile apps, payments, social feeds, multi-tenant company isolation.

## 4. Users and roles
| Role | Can do |
|---|---|
| Employee | Join a team, check in to habits, view own streaks, view leaderboards |
| Admin | Everything an employee can, plus create/archive habits, create teams, create challenges |

Auth for v1: email + password, JWT in an httpOnly cookie. Roles stored on the user record.

## 5. Domain rules (the part that must be right)
1. **Habit**: name, optional daily target of 1 (boolean check-in only in v1), `archived` flag.
2. **Check-in**: one per user per habit per *local calendar day*. A second check-in for the same day is a no-op that returns the existing record (idempotent), not an error.
3. **Local day**: determined by the user's stored IANA timezone (e.g. `Asia/Kolkata`), not server time. Check-ins are stored with a UTC timestamp and a derived `local_date`.
4. **Backfill**: users may check in for yesterday only (local date), never for future dates or earlier than yesterday.
5. **Streak**: count of consecutive local dates ending today or yesterday with a check-in. If the latest check-in is older than yesterday, current streak is 0. Longest streak is the max run ever.
6. **Leaderboard score (weekly, Mon-Sun in the team's timezone, which is set at team creation)**: `score = sum over members of (days with at least one check-in that week) / (members * 7)`. This is team participation rate, 0-100%. Teams are ranked by score; ties broken by team name ascending. Members with zero check-ins still count in the denominator.
7. Archived habits keep history but cannot receive new check-ins.
8. A user belongs to at most one team at a time. Leaving a team does not delete their check-ins; past weeks' scores are frozen at week end.

## 6. Functional requirements
- FR1 Register, login, logout.
- FR2 List active habits; admin create/archive habit.
- FR3 Check in (today or yesterday) for a habit; uncheck today's check-in.
- FR4 View my streaks (current, longest) per habit.
- FR5 Admin create team; user joins or leaves a team.
- FR6 View weekly team leaderboard, current and previous weeks.

## 7. API (REST, JSON)
| Method | Path | Notes |
|---|---|---|
| POST | /api/auth/register, /login, /logout | |
| GET | /api/habits | active only |
| POST | /api/habits | admin |
| PATCH | /api/habits/:id | admin; archive |
| PUT | /api/habits/:id/checkins/:date | idempotent; date = YYYY-MM-DD local |
| DELETE | /api/habits/:id/checkins/:date | today only |
| GET | /api/me/streaks | |
| POST | /api/teams | admin |
| POST | /api/teams/:id/join, /leave | |
| GET | /api/leaderboard?week=YYYY-MM-DD | week = Monday date; default current |

Errors use `{ "error": { "code": string, "message": string } }` with appropriate 4xx codes.

## 8. Data model (Postgres)
users, habits, checkins (unique user_id+habit_id+local_date), teams, team_memberships (unique active membership per user). Weekly scores computed on read for current week; frozen snapshot table written at week rollover is out of scope for v1 (compute on read for all weeks, accept that membership changes alter past scores, documented limitation).

## 9. UX
Three screens: Today (habit list with one-tap check-in and streak badges), Leaderboard (week selector, ranked teams), Admin (habits and teams CRUD). Mobile-first responsive web.

## 10. Non-functional
- API p95 under 300 ms at 1k users / 10k check-ins per day on a free-tier instance.
- Input validated server-side; passwords hashed with bcrypt or argon2; no secrets in repo.
- Test coverage: unit tests on streak and score logic (including DST and timezone edge cases), API integration tests on every endpoint.

## 11. Acceptance criteria (samples)
- Check in twice for same habit and day returns 200 both times and one DB row.
- User in `Pacific/Auckland` checking in at 23:30 local sees that check-in on the correct local date even though UTC date differs.
- Streak across a DST change does not break.
- Team of 4 where 2 members each check in 7 days and 2 check in 0 scores 50%.
- Check-in for 2 days ago returns 422.

## 12. Open questions
- Should uncheck be allowed for yesterday? (v1: no)
- Should leaderboard show individuals as well as teams? (v1: teams only)

## 13. Milestones
M1 schema + auth, M2 habits/check-ins/streaks, M3 teams/leaderboard, M4 UI, M5 deploy.
