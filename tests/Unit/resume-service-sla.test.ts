import test from 'node:test';
import assert from 'node:assert/strict';
import { ResumeServiceSlaCalculator } from '../../src/modules/resume-service/services/resume-service-sla-calculator.ts';

const calculator = new ResumeServiceSlaCalculator();

test('resume SLA skips weekends', () => {
  assert.equal(calculator.dueAt(new Date('2026-07-30T10:00:00Z')).toISOString(), '2026-08-03T10:00:00.000Z');
  assert.equal(calculator.dueAt(new Date('2026-07-31T10:00:00Z')).toISOString(), '2026-08-04T10:00:00.000Z');
  assert.equal(calculator.dueAt(new Date('2026-08-01T10:00:00Z')).toISOString(), '2026-08-05T10:00:00.000Z');
});

test('resume SLA pause and resume preserves working time', () => {
  const due = calculator.dueAt(new Date('2026-07-30T10:00:00Z'));
  const remaining = calculator.remainingSeconds(new Date('2026-07-31T10:00:00Z'), due);
  assert.equal(remaining, 24 * 3600);
  assert.equal(calculator.resumeAt(new Date('2026-08-03T12:00:00Z'), remaining).toISOString(), '2026-08-04T12:00:00.000Z');
});
