import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { semaphoreStateCases } from '../support/semaphore-state-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/suites/semaphore-state.json';
const cases = semaphoreStateCases();
test('semaphore plans preserve bounded reservations and separate unresolved acquisitions', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(semaphoreStateCases(), cases);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    metadata.trials.probesPerRevision,
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  let pendingCases = 0;
  for (const item of cases) {
    validateProbeControls(item);
    assert.equal(item.module, 'WASemaphore');
    assert.equal(item.export, 'Semaphore');
    assert.ok(item.construct);
    assert.equal(item.context, undefined);
    assert.deepEqual(item.stubs, [{ module: 'cr:6640', exports: null }]);
    assert.ok(item.probes.length <= 96);
    assert.ok(item.probes.filter((probe) => probe.retain).length <= 128);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    const pending = item.probes.some((probe) => probe.pending);
    if (pending) {
      pendingCases++;
      assert.equal(item.probes.filter((probe) => probe.pending?.action === 'start').length, 2);
      assert.ok(
        item.probes.every(
          (probe) => !probe.retain && !probe.result && probe.pending?.action !== 'await',
        ),
      );
    } else {
      assert.equal(
        item.probes.filter((probe) => probe.result && 'method' in probe.result).length,
        1,
      );
      assert.equal(item.probes[1]!.retain?.stage, 'call');
      assert.deepEqual(item.probes[1]!.result, { method: 'release' });
    }
    for (const probe of item.probes) {
      assert.ok([undefined, 'acquire', 'availablePermits'].includes(probe.method));
      assert.equal(probe.module, undefined);
      assert.equal(probe.export, undefined);
      assert.equal(probe.construct, undefined);
      assert.equal(probe.clock, undefined);
      if (probe.result && 'method' in probe.result) assert.equal(probe.result.method, 'release');
    }
  }
  assert.equal(pendingCases, 7);
  for (const observation of metadata.observations) {
    assert.equal(observation.modules.length, 7);
    assert.equal(observation.staticCoverage.complete, false);
    assert.equal(observation.staticCoverage.workBudget.exhausted, false);
    assert.deepEqual(observation.gates, []);
    assert.deepEqual(observation.unresolved, [{ code: 'missing-module', module: 'cr:6640' }]);
  }
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:semaphore-state')
    ? `${subject.id} lacks wa-internal:semaphore-state`
    : false;
if (reason) test.skip(`Semaphore reservation suite skipped: ${reason}`, () => {});
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
