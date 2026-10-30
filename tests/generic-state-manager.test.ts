import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { genericStateManagerCases } from '../support/generic-state-manager-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/suites/generic-state-manager.json';
const cases = genericStateManagerCases();
test('generic manager plans preserve real methods, bounded waits and separate reference histories', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(genericStateManagerCases(), cases);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    metadata.trials.probesPerRevision,
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  for (const item of cases) {
    validateProbeControls(item);
    assert.ok(item.probes.length <= 96);
    assert.equal(item.context, undefined);
    assert.deepEqual(item.stubs, [{ module: 'cr:6640', exports: null }]);
    assert.equal(item.module, 'WAGenericStateManager');
    assert.equal(item.export, 'WAGenericStateManager');
    assert.ok(item.construct);
    const starts = item.probes.filter((probe) => probe.pending?.action === 'start');
    assert.ok(starts.length <= 5);
    if (starts.length)
      assert.ok(
        item.probes.every((probe) => probe.retain === undefined && probe.result === undefined),
      );
    for (const probe of item.probes) {
      assert.ok([undefined, 'get', 'set', 'waitForValue'].includes(probe.method));
      assert.equal(probe.construct, undefined);
      assert.equal(probe.module, undefined);
      assert.equal(probe.export, undefined);
    }
  }
  for (const observation of metadata.observations) {
    assert.equal(observation.modules.length, 8);
    assert.deepEqual(observation.gates, []);
    assert.deepEqual(observation.unresolved, [{ code: 'missing-module', module: 'cr:6640' }]);
    assert.equal(observation.staticCoverage.complete, false);
    assert.equal(observation.staticCoverage.workBudget.exhausted, false);
  }
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:generic-state-manager')
    ? `${subject.id} lacks wa-internal:generic-state-manager`
    : false;
if (reason) test.skip(`Generic state manager suite skipped: ${reason}`, () => {});
function check(item: BehaviorCase, result: CaseResult) {
  assertCaseObservations(item, result);
  assert.deepEqual(result.gateObservations || [], []);
  assert.equal(result.bootstrapExecutions?.length || 0, 0);
}
for (const item of reason ? [] : cases)
  test(item.id, async () => {
    assert.ok(subject);
    check(item, await subject.runCase(item));
    if (subject.compareCase) {
      const pair = await subject.compareCase(item);
      assert.equal(pair.status, 'unchanged');
      check(item, pair.baseline);
      assert.ok(pair.candidate);
      check(item, pair.candidate);
    }
  });
