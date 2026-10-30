import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { lruStateCases, wwAiCacheCases } from '../support/cache-state-cases.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';

const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:cache-state')
    ? `${subject.id} lacks wa-internal:cache-state`
    : false;
if (reason) test.skip(`Cache state suite skipped: ${reason}`, () => {});
function check(testCase: BehaviorCase, result: CaseResult) {
  assertCaseObservations(testCase, result);
  const expected = testCase.probes
    .filter((probe) => probe.clock)
    .map((probe) => ({ beforeProbe: probe.id, clock: probe.clock }));
  assert.deepEqual(
    result.clockUpdates || [],
    expected,
    `${testCase.id}: actual ordered clock updates required`,
  );
}
for (const testCase of reason ? [] : [...lruStateCases(), ...wwAiCacheCases()]) {
  test(testCase.id, async () => {
    assert.ok(subject);
    check(testCase, await subject.runCase(testCase));
    if (subject.compareCase) {
      const pair = await subject.compareCase(testCase);
      assert.equal(pair.status, 'unchanged', testCase.id);
      check(testCase, pair.baseline);
      assert.ok(pair.candidate);
      check(testCase, pair.candidate);
    }
  });
}
