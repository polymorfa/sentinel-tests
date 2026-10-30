import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { gkxProviderStateCases } from '../support/gkx-provider-state-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/suites/gkx-provider-state.json';

const cases = gkxProviderStateCases();
test('original gkx plans preserve real selectors, staged histories and unresolved bootstrap scope', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(gkxProviderStateCases(), cases);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((n, item) => n + item.probes.length, 0),
    metadata.trials.probesPerRevision,
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  const exports = new Set<string>();
  for (const item of cases) {
    validateProbeControls(item);
    assert.equal(item.module, 'gkx');
    assert.equal(item.export, '$module');
    assert.deepEqual(item.context, { gates: {} });
    assert.equal(item.stubs, undefined);
    assert.equal(item.construct, undefined);
    assert.ok(item.probes.length <= 96);
    assert.ok(item.probes.filter((probe) => probe.retain).length <= 128);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    for (const probe of item.probes) {
      exports.add(probe.export || item.export);
      assert.equal(probe.module, undefined);
      assert.equal(probe.method, undefined);
      assert.equal(probe.construct, undefined);
      assert.equal(probe.pending, undefined);
      assert.equal(probe.clock, undefined);
      if (probe.result) assert.ok('identityWith' in probe.result);
      if (probe.retain) assert.equal(probe.retain.stage, 'call');
    }
  }
  assert.deepEqual([...exports].sort(), [
    '$module',
    'add',
    'addLoggedInternal',
    'clear',
    'getGKs',
    'getLogged',
    'setFail',
    'setPass',
  ]);
  const metrics = cases.find(
    (item) => item.id === 'gkx-provider-state-real-returned-metrics-mutation-v1',
  )!;
  assert.deepEqual(metrics.probes.find((probe) => probe.id === 'stats-after-two')!.expected, {
    entry: 4,
    dup_entry: 2,
  });
  const ordering = cases.find(
    (item) => item.id === 'gkx-provider-state-numeric-and-read-order-v1',
  )!;
  assert.deepEqual(
    ordering.probes.at(-1)!.expected,
    ['2', '10', 'b', 'a'].map((identifier) => ({ identifier, hash: null })),
  );
  for (const observation of metadata.observations) {
    assert.equal(observation.modules.length, 9);
    assert.equal(observation.staticCoverage.complete, false);
    assert.equal(observation.staticCoverage.workBudget.exhausted, false);
    assert.deepEqual(observation.gates, []);
    assert.deepEqual(observation.unresolved, [
      {
        code: 'unresolved-bootstrap-provider',
        module: 'ExecutionEnvironment',
        line: 3,
        column: 12,
      },
    ]);
  }
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:gkx-provider-state')
    ? `${subject.id} lacks wa-internal:gkx-provider-state`
    : false;
if (reason) test.skip(`Original gkx provider suite skipped: ${reason}`, () => {});
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
