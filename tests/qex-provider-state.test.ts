import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { qexProviderStateCases } from '../support/qex-provider-state-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/suites/qex-provider-state.json';
const cases = qexProviderStateCases();
test('qex plans preserve original provider selectors, real queue observations and bounded histories', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(qexProviderStateCases(), cases);
  assert.equal(cases.length, metadata.trials.cases);
  assert.ok(cases.length <= 20);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    metadata.trials.probesPerRevision,
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  for (const item of cases) {
    validateProbeControls(item);
    assert.equal(item.module, 'qex');
    assert.equal(item.export, '_');
    assert.deepEqual(item.context, { gates: {} });
    assert.equal(item.stubs, undefined);
    assert.equal(item.construct, undefined);
    assert.ok(item.probes.length <= 96);
    assert.ok(item.probes.filter((probe) => probe.retain).length <= 128);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    assert.ok(item.probes.some((probe) => probe.module === 'BanzaiLazyQueue'));
    for (const probe of item.probes) {
      if (probe.module) {
        assert.equal(probe.module, 'BanzaiLazyQueue');
        assert.equal(probe.export, 'flushQueue');
        assert.deepEqual(probe.args, []);
      } else assert.ok([undefined, 'add'].includes(probe.export));
      assert.equal(probe.method, undefined);
      assert.equal(probe.construct, undefined);
      assert.equal(probe.pending, undefined);
      assert.equal(probe.clock, undefined);
      if (probe.result) assert.ok('identityWith' in probe.result);
      if (probe.retain) assert.equal(probe.retain.stage, 'call');
    }
  }
  const ordered = cases.find(
    (item) => item.id === 'qex-provider-state-first-read-order-and-flush-v1',
  )!;
  assert.deepEqual(
    ordered.probes.find((probe) => probe.id === 'first-queue')!.expected,
    ['B', 'A', 'C'].map((l) => ['qex', { l }, { $type: 'undefined' }]),
  );
  assert.deepEqual(
    ordered.probes.find((probe) => probe.id === 'logged-map-survives-flush')!.expected,
    [],
  );
  for (const observation of metadata.observations) {
    assert.equal(observation.modules.length, 7);
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
  : !subject.capabilities?.includes('wa-internal:qex-provider-state')
    ? `${subject.id} lacks wa-internal:qex-provider-state`
    : false;
if (reason) test.skip(`Original qex provider suite skipped: ${reason}`, () => {});
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
