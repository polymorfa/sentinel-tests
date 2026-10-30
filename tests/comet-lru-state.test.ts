import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { cometClock, cometLruStateCases } from '../support/comet-lru-state-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/suites/comet-lru-state.json';
const cases = cometLruStateCases();
test('Comet plans preserve genuine new-create scope, positive capacities and literal clock boundaries', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(cometLruStateCases(), cases);
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
    assert.equal(item.module, 'CometLruCache');
    assert.equal(item.export, 'create');
    assert.ok(
      item.construct && typeof item.construct.args[0] === 'number' && item.construct.args[0] > 0,
    );
    assert.deepEqual(item.context, { clock: cometClock(0), gates: {} });
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
      assert.equal(probe.throws, undefined);
      if (probe.clock) assert.ok(Number.isFinite(Date.parse(probe.clock)));
      if (probe.result) assert.ok('identityWith' in probe.result);
      if (probe.retain) assert.equal(probe.retain.stage, 'call');
    }
  }
  assert.deepEqual([...methods].sort(), [
    'capacity',
    'clear',
    'delete',
    'get',
    'has',
    'set',
    'size',
  ]);
  const boundary = cases.find(
    (item) => item.id === 'comet-lru-state-exact-deadline-and-no-hit-refresh-v1',
  )!;
  assert.equal(boundary.probes.find((probe) => probe.id === 'exact-deadline')!.expected, 'A');
  assert.equal(boundary.probes.find((probe) => probe.id === 'one-ms-after')!.expected, null);
  for (const observation of metadata.observations) {
    assert.equal(observation.modules.length, 6);
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
  : !subject.capabilities?.includes('wa-internal:comet-lru-state')
    ? `${subject.id} lacks wa-internal:comet-lru-state`
    : false;
if (reason) test.skip(`Comet LRU state suite skipped: ${reason}`, () => {});
function check(item: BehaviorCase, result: CaseResult) {
  assertCaseObservations(item, result);
  assert.deepEqual(
    result.clockUpdates || [],
    item.probes
      .filter((probe) => probe.clock)
      .map((probe) => ({ beforeProbe: probe.id, clock: probe.clock })),
    `${item.id}: actual ordered clock updates required`,
  );
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
