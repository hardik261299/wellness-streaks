import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Streak } from '@wellness/shared';
import { api, ApiError } from './client';

export const keys = {
  me: ['me'] as const,
  habits: ['habits'] as const,
  streaks: ['streaks'] as const,
  teams: ['teams'] as const,
  leaderboard: (week: string | undefined) => ['leaderboard', week ?? 'current'] as const,
};

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useHabits() {
  return useQuery({ queryKey: keys.habits, queryFn: api.listHabits });
}
export function useStreaks() {
  return useQuery({ queryKey: keys.streaks, queryFn: api.myStreaks });
}
export function useTeams() {
  return useQuery({ queryKey: keys.teams, queryFn: api.listTeams });
}
export function useLeaderboard(week: string | undefined) {
  return useQuery({ queryKey: keys.leaderboard(week), queryFn: () => api.leaderboard(week) });
}

interface StreaksData {
  streaks: Streak[];
}

/** Optimistic check-in toggle. `date` is today's local date in the user's timezone. */
export function useToggleCheckin(date: string, onError: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ habitId, checked }: { habitId: string; checked: boolean }) => {
      if (checked) await api.putCheckin(habitId, date);
      else await api.deleteCheckin(habitId, date);
    },
    onMutate: async ({ habitId, checked }) => {
      await qc.cancelQueries({ queryKey: keys.streaks });
      const prev = qc.getQueryData<StreaksData>(keys.streaks);
      if (prev) {
        qc.setQueryData<StreaksData>(keys.streaks, {
          streaks: prev.streaks.map((s) => {
            if (s.habitId !== habitId || s.checkedInToday === checked) return s;
            const current = Math.max(0, s.current + (checked ? 1 : -1));
            return { ...s, checkedInToday: checked, current, longest: Math.max(s.longest, current) };
          }),
        });
      }
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.streaks, ctx.prev);
      onError(e instanceof Error ? e.message : 'Something went wrong');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.streaks }),
  });
}
