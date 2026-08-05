'use client';

import { useMutation } from '@apollo/client';
import { useRouter } from 'next/navigation';

import { INGEST_MEMORY, MARK_SKILL, ME, SET_GOAL } from './graphql';

/**
 * Shared mutations used by the twin dashboard; each refetches the twin so the
 * UI reflects the new state immediately.
 */
export function useTwinActions() {
  const router = useRouter();
  const refetch = () => router.refresh();

  const [markSkillMutation] = useMutation(MARK_SKILL, { refetchQueries: [ME] });
  const [setGoalMutation] = useMutation(SET_GOAL, { refetchQueries: [ME] });
  const [ingestMutation] = useMutation(INGEST_MEMORY, { refetchQueries: [ME] });

  return {
    markSkill: (name: string) => markSkillMutation({ variables: { name } }).then(() => refetch()),
    setGoal: (title: string, description?: string) =>
      setGoalMutation({ variables: { title, description } }).then(() => refetch()),
    ingest: (type: string, summary: string, payload?: Record<string, unknown>) =>
      ingestMutation({
        variables: { type, summary, payload: payload ? JSON.stringify(payload) : null },
      }).then(() => refetch()),
  };
}
