import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { smallQueueStateCases } from '../support/small-queue-state-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/suites/small-queue-state.json';
const cases = smallQueueStateCases();
test('SmallQueue plans preserve real constructor/public methods and bounded FIFO histories', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(smallQueueStateCases(), cases);
  assert.equal(cases.length, metadata.trials.cases);
  assert.ok(cases.length <= 20);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    metadata.trials.probesPerRevision,
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  const methods = new Set<string>();
  for (const item of cases) {
    validateProbeControls(item);
    assert.equal(item.module, 'SmallQueue');
    assert.equal(item.export, '$module');
    assert.deepEqual(item.construct, { args: [] });
    assert.deepEqual(item.context, { gates: {} });
    assert.equal(item.stubs, undefined);
    assert.ok(item.probes.length <= 96);
    assert.ok(item.probes.filter((probe) => probe.retain).length <= 128);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    for (const probe of item.probes) {
      assert.ok(probe.method);
      methods.add(probe.method);
      assert.equal(probe.export, undefined);
      assert.equal(probe.module, undefined);
      assert.equal(probe.construct, undefined);
      assert.equal(probe.pending, undefined);
      assert.equal(probe.clock, undefined);
      if (probe.result) assert.ok('identityWith' in probe.result);
      if (probe.retain) assert.equal(probe.retain.stage, 'call');
    }
  }
  assert.deepEqual([...methods].sort(), [
    'dequeue',
    'enqueue',
    'enqueueList',
    'getLength',
    'isEmpty',
    'peek',
    'remove',
  ]);
  const duplicates = cases.find(
    (item) => item.id === 'small-queue-state-remove-first-strict-duplicate-v1',
  )!;
  assert.equal(duplicates.probes.find((probe) => probe.id === 'only-one-removed')!.expected, 4);
  const large = cases.find(
    (item) => item.id === 'small-queue-state-large-list-prefix-and-count-v1',
  )!;
  assert.equal(large.probes.find((probe) => probe.id === 'remaining-count-only')!.expected, 2043);
  assert.equal(large.probes.filter((probe) => probe.method === 'dequeue').length, 5);
  for (const observation of metadata.observations) {
    assert.equal(observation.modules.length, 1);
    assert.equal(observation.staticCoverage.complete, true);
    assert.equal(observation.staticCoverage.workBudget.exhausted, false);
    assert.deepEqual(observation.gates, []);
    assert.deepEqual(observation.unresolved, []);
  }
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:small-queue-state')
    ? `${subject.id} lacks wa-internal:small-queue-state`
    : false;
if (reason) test.skip(`SmallQueue suite skipped: ${reason}`, () => {});
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
