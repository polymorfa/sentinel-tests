import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { knobProviderStateCases } from '../support/knob-provider-state-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/suites/knob-provider-state.json';
const cases = knobProviderStateCases();
test('original provider plans preserve source methods, metrics lifetime and empty gate context', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(knobProviderStateCases(), cases);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    metadata.trials.probesPerRevision,
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  const methods = new Set<string>();
  for (const item of cases) {
    validateProbeControls(item);
    assert.equal(item.module, 'justknobx');
    assert.equal(item.export, '_');
    assert.deepEqual(item.context, { gates: {} });
    assert.equal(item.stubs, undefined);
    assert.equal(item.construct, undefined);
    assert.ok(item.probes.length <= 96);
    assert.ok(item.probes.filter((probe) => probe.retain).length <= 128);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    for (const probe of item.probes) {
      methods.add(probe.export || item.export);
      assert.equal(probe.module, undefined);
      assert.equal(probe.method, undefined);
      assert.equal(probe.construct, undefined);
      assert.equal(probe.pending, undefined);
      assert.equal(probe.clock, undefined);
      if (probe.result) assert.ok('identityWith' in probe.result);
      if (probe.retain) assert.equal(probe.retain.stage, 'call');
    }
  }
  assert.deepEqual([...methods].sort(), ['_', 'add', 'getBool', 'getInt']);
  const metrics = cases.find((item) => item.id === 'knob-provider-state-real-metrics-mutation-v1')!;
  assert.deepEqual(metrics.probes.find((probe) => probe.id === 'stats-after-two')!.expected, {
    entry: 4,
    dup_entry: 2,
  });
  const nullEntry = cases.find(
    (item) => item.id === 'knob-provider-state-null-entry-cannot-repair-v1',
  )!;
  assert.deepEqual(nullEntry.probes[1]!.throws, nullEntry.probes[3]!.throws);
  for (const observation of metadata.observations) {
    assert.equal(observation.modules.length, 5);
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
  : !subject.capabilities?.includes('wa-internal:knob-provider-state')
    ? `${subject.id} lacks wa-internal:knob-provider-state`
    : false;
if (reason) test.skip(`Original knob provider suite skipped: ${reason}`, () => {});
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
