import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSubject, assertCaseObservations } from '../support/subject.ts';
import type { CaseComparison, CaseResult } from '../support/types.ts';
import { backoffCases } from '../support/backoff-cases.ts';

const subject = await loadSubject();
if (!subject?.capabilities?.includes('wa-internal:backoff-state'))
  test.skip('Backoff suite requires a subject with wa-internal:backoff-state', () => {});
after(async () => {
  await subject?.close?.();
});
describe(
  'BackoffCache ordered clock and key state',
  {
    skip: !subject
      ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed adapter'
      : !subject.capabilities?.includes('wa-internal:backoff-state')
        ? `${subject.id} lacks wa-internal:backoff-state`
        : false,
  },
  () => {
    for (const testCase of backoffCases)
      test(testCase.id, async () => {
        assert.ok(subject);
        function observations(result: CaseResult) {
          assertCaseObservations(testCase, result);
          assert.deepEqual(
            result.clockUpdates,
            testCase.probes.map((probe) => ({ beforeProbe: probe.id, clock: probe.clock })),
          );
        }
        observations(await subject.runCase(testCase));
        if (subject.compareCase) {
          const comparison: CaseComparison = await subject.compareCase(testCase);
          assert.equal(comparison.status, 'unchanged', testCase.id);
          observations(comparison.baseline);
          assert.ok(comparison.candidate);
          observations(comparison.candidate);
        }
      });
  },
);
