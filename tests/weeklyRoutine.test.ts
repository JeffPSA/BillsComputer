import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyWeeklyRoutine, restorePersistedRoutineJob, sanitizeRoutineError, uniqueSetQueue } from '../server/weeklyRoutineState';

test('weekly set queue deduplicates new and failed sets', () => {
  assert.deepEqual(uniqueSetQueue(['sv9', 'sv10'], ['sv8', 'sv9']), ['sv9', 'sv10', 'sv8']);
});

test('weekly routine classification distinguishes success, partial, failure, and stop', () => {
  assert.equal(classifyWeeklyRoutine({ failedSetIds: [] }), 'completed');
  assert.equal(classifyWeeklyRoutine({ failedSetIds: ['sv8'] }), 'partial');
  assert.equal(classifyWeeklyRoutine({ setSyncFailed: true, failedSetIds: [] }), 'failed');
  assert.equal(classifyWeeklyRoutine({ stopped: true, setSyncFailed: true }), 'stopped');
});

test('a persisted running job becomes a failed interrupted job after restart', () => {
  const restored = restorePersistedRoutineJob({ runId: 'run-1', running: true, status: 'running', startedAt: '2026-09-06T00:00:00.000Z' }, '2026-09-06T00:10:00.000Z');
  assert.equal(restored?.running, false);
  assert.equal(restored?.status, 'failed');
  assert.equal(restored?.finishedAt, '2026-09-06T00:10:00.000Z');
});

test('routine errors are bounded and redact bearer credentials', () => {
  const value = sanitizeRoutineError(new Error('request failed\nAuthorization: Bearer secret-value'));
  assert.doesNotMatch(value, /secret-value/);
  assert.ok(value.length <= 240);
});
