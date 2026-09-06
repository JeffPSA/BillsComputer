export type WeeklyRoutineStatus = 'idle' | 'running' | 'completed' | 'partial' | 'stopped' | 'failed';

export interface WeeklyRoutineStats {
  stopped?: boolean;
  setSyncFailed?: boolean;
  failedSetIds?: string[];
  error?: string;
}

export interface PersistedWeeklyRoutineJob {
  runId?: string;
  running: boolean;
  source?: 'admin' | 'dashboard';
  startedAt?: string;
  finishedAt?: string;
  status?: WeeklyRoutineStatus;
  stats?: WeeklyRoutineStats;
  error?: string;
  [key: string]: unknown;
}

export function uniqueSetQueue(newSetIds: string[], failedSetIds: string[]): string[] {
  return Array.from(new Set([...newSetIds, ...failedSetIds].filter(Boolean)));
}

export function classifyWeeklyRoutine(stats: WeeklyRoutineStats): WeeklyRoutineStatus {
  if (stats.stopped) return 'stopped';
  if (stats.setSyncFailed) return 'failed';
  if ((stats.failedSetIds?.length ?? 0) > 0) return 'partial';
  return 'completed';
}

export function sanitizeRoutineError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Sync failed';
  return message.replace(/[\r\n\t]+/g, ' ').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').trim().slice(0, 240) || 'Sync failed';
}

export function restorePersistedRoutineJob(value: unknown, finishedAt = new Date().toISOString()): PersistedWeeklyRoutineJob | null {
  if (!value || typeof value !== 'object') return null;
  const job = value as PersistedWeeklyRoutineJob;
  if (job.running || job.status === 'running') {
    return {
      ...job,
      running: false,
      finishedAt,
      status: 'failed',
      error: 'Routine interrupted by a service restart.',
    };
  }
  return { ...job, running: false };
}
