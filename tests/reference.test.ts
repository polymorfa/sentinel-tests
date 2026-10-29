import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSubject, assertCaseObservations } from '../support/subject.ts';
import { validateFixtures } from '../support/fixtures.ts';

const subject = await loadSubject();
const fixtures = await validateFixtures();
after(async () => {
  await subject?.close?.();
});
if (!subject)
  test.skip('Archived fixture suite requires an explicit SENTINEL_SUBJECT_MODULE', () => {});
describe(
  'archived behavior fixtures against the explicitly selected subject',
  { skip: subject ? false : 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter' },
  () => {
    for (const { testCase, metadata } of fixtures)
      test(`${testCase.id}@${testCase.version}`, async (t) => {
        assert.ok(subject);
        const result = await subject.runCase(testCase);
        if (result.status === 'unsupported') {
          t.skip(`${subject.id} does not support this operation`);
          return;
        }
        assertCaseObservations(testCase, result);
        if (subject.compareCase) {
          const comparison = await subject.compareCase(testCase);
          assert.equal(
            comparison.status,
            metadata.expectedComparison ?? 'unchanged',
            `${testCase.id}: unexpected revision comparison`,
          );
          assertCaseObservations(testCase, comparison.baseline);
          assert.ok(comparison.candidate);
          if (comparison.status === 'unchanged')
            assertCaseObservations(testCase, comparison.candidate);
          else
            assert.equal(
              comparison.candidate.status,
              'assertion-failed',
              'Expected drift needs an actual candidate assertion mismatch',
            );
        }
      });
  },
);
