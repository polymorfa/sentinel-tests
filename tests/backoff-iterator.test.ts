import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffIteratorCases, iteratorConsumerCases } from '../support/backoff-iterator-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
const cases = [...backoffIteratorCases(), ...iteratorConsumerCases()];
test('Iterator plans use bounded original-generator references and actual source consumers', () => {
  assert.equal(new Set(cases.map((value) => value.id)).size, cases.length);
  for (const testCase of cases) {
    assert.ok(testCase.probes.length <= 96);
    validateProbeControls(testCase);
  }
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:backoff-iterator')
    ? `${subject.id} lacks wa-internal:backoff-iterator`
    : false;
if (reason) test.skip(`Backoff iterator suite skipped: ${reason}`, () => {});
for (const testCase of reason ? [] : cases)
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
