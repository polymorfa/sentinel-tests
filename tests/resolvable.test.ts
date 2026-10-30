import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvableCases } from '../support/resolvable-cases.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';

const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:resolvable')
    ? `${subject.id} lacks wa-internal:resolvable`
    : false;
if (reason) test.skip(`Resolvable suite skipped: ${reason}`, () => {});
for (const testCase of reason ? [] : resolvableCases()) {
  test(testCase.id, async () => {
    assert.ok(subject);
    assertCaseObservations(testCase, await subject.runCase(testCase));
    if (subject.compareCase) {
      const pair = await subject.compareCase(testCase);
      assert.equal(pair.status, 'unchanged', testCase.id);
      assertCaseObservations(testCase, pair.baseline);
      assert.ok(pair.candidate);
      assertCaseObservations(testCase, pair.candidate);
    }
  });
}
