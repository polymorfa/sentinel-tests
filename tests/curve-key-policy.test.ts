import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { curveKeyPolicyCases } from '../support/curve-key-policy-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import metadata from '../metadata/suites/curve-key-policy.json';
const cases = curveKeyPolicyCases();
test('pure WA curve helper plans preserve source pins and bounded empty gate assignment', () => {
  assert.deepEqual(curveKeyPolicyCases(), cases);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    metadata.trials.probesPerRevision,
  );
  for (const item of cases) {
    validateProbeControls(item);
    assert.ok(item.probes.length <= 96);
    assert.equal(item.context, undefined);
    assert.equal(item.stubs, undefined);
  }
  for (const observed of metadata.observations) {
    assert.equal(observed.modules.length, 10);
    assert.equal(observed.staticCoverage.complete, true);
    assert.equal(observed.staticCoverage.workBudget.exhausted, false);
    assert.deepEqual(observed.gates, []);
    assert.deepEqual(observed.unresolved, []);
  }
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:curve-key-policy')
    ? `${subject.id} lacks wa-internal:curve-key-policy`
    : false;
if (reason) test.skip(`Curve key policy suite skipped: ${reason}`, () => {});
for (const item of reason ? [] : cases)
  test(item.id, async () => {
    assert.ok(subject);
    assertCaseObservations(item, await subject.runCase(item));
    if (subject.compareCase) {
      const pair = await subject.compareCase(item);
      assert.equal(pair.status, 'unchanged');
      assertCaseObservations(item, pair.baseline);
      assert.ok(pair.candidate);
      assertCaseObservations(item, pair.candidate);
    }
  });
