import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSubject, assertCaseObservations } from '../support/subject.ts';
import type { CaseComparison } from '../support/types.ts';
import { addressingMediaCases } from '../support/addressing-media-cases.ts';
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
describe(
  'JID address and media representation contracts',
  {
    skip: !subject
      ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed adapter'
      : !subject.capabilities?.includes('wa-internal:addressing-media')
        ? `${subject.id} lacks wa-internal:addressing-media`
        : false,
  },
  () => {
    for (const testCase of addressingMediaCases)
      test(testCase.id, async () => {
        assert.ok(subject);
        assertCaseObservations(testCase, await subject.runCase(testCase));
        if (subject.compareCase) {
          const comparison: CaseComparison = await subject.compareCase(testCase);
          assert.equal(comparison.status, 'unchanged', testCase.id);
          assertCaseObservations(testCase, comparison.baseline);
          assert.ok(comparison.candidate);
          assertCaseObservations(testCase, comparison.candidate);
        }
      });
  },
);
