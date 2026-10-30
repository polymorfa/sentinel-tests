import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { msgkeyCases } from '../support/msgkey-cases.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';

const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:msgkey')
    ? `${subject.id} lacks wa-internal:msgkey`
    : false;
if (reason) test.skip(`MsgKey suite skipped: ${reason}`, () => {});
for (const testCase of reason ? [] : msgkeyCases()) {
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
