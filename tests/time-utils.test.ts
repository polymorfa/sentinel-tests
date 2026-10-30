import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { timeUtilsCases } from '../support/time-utils-cases.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';

const cases = timeUtilsCases();
test('TimeUtils transport plans retain bounded probes and admitted clock/export controls', () => {
  assert.ok(cases.length > 20);
  assert.equal(new Set(cases.map((value) => value.id)).size, cases.length);
  for (const testCase of cases) validateProbeControls(testCase);
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:time-utils')
    ? `${subject.id} lacks wa-internal:time-utils`
    : false;
if (reason) test.skip(`TimeUtils suite skipped: ${reason}`, () => {});
function check(testCase: BehaviorCase, result: CaseResult) {
  assertCaseObservations(testCase, result);
  assert.deepEqual(
    result.clockUpdates || [],
    testCase.probes
      .filter((probe) => probe.clock)
      .map((probe) => ({ beforeProbe: probe.id, clock: probe.clock })),
    `${testCase.id}: actual ordered clock updates required`,
  );
}
for (const testCase of reason ? [] : cases)
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
