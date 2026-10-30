import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { simpleHookStateCases } from '../support/simple-hook-state-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/suites/simple-hook-state.json';

const cases = simpleHookStateCases();
test('SimpleHook plans preserve data-only public methods and source return lifetimes', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(simpleHookStateCases(), cases);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    metadata.trials.probesPerRevision,
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  assert.ok(cases.length <= 16);
  const methods = new Set<string>();
  for (const item of cases) {
    validateProbeControls(item);
    assert.equal(item.module, 'SimpleHook');
    assert.equal(item.export, 'SimpleHook');
    assert.deepEqual(item.construct, { args: [] });
    assert.deepEqual(item.context, { gates: {} });
    assert.equal(item.stubs, undefined);
    assert.ok(item.probes.length <= 96);
    assert.ok(item.probes.filter((probe) => probe.retain).length <= 128);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    for (const probe of item.probes) {
      assert.ok(probe.method);
      methods.add(probe.method);
      assert.equal(probe.module, undefined);
      assert.equal(probe.export, undefined);
      assert.equal(probe.construct, undefined);
      assert.equal(probe.pending, undefined);
      assert.equal(probe.clock, undefined);
      if (probe.result) assert.ok('identityWith' in probe.result);
      if (probe.retain) assert.equal(probe.retain.stage, 'call');
      if (probe.method === 'add') {
        const options = probe.args[1];
        if (options && typeof options === 'object' && !Array.isArray(options))
          assert.notEqual(options.once, true);
      }
    }
  }
  assert.deepEqual([...methods].sort(), [
    'add',
    'call',
    'clear',
    'hasCallback',
    'remove',
    'removeLast',
  ]);
  assert.ok(cases.some((item) => item.id.includes('plain-data-dollar-one')));
  assert.ok(cases.some((item) => item.id.includes('nan-strict')));
  const repair = cases.find(
    (item) => item.id === 'simple-hook-state-null-before-match-error-repair-v1',
  )!;
  assert.deepEqual(repair.probes.find((probe) => probe.id === 'null-blocks-later-match')!.throws, {
    name: 'TypeError',
  });
  assert.equal(repair.probes.find((probe) => probe.id === 'A-now-reachable')!.expected, true);
  for (const observation of metadata.observations) {
    assert.equal(observation.modules.length, 1);
    assert.equal(observation.staticCoverage.complete, true);
    assert.equal(observation.staticCoverage.workBudget.consumed, 4767);
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
  : !subject.capabilities?.includes('wa-internal:simple-hook-state')
    ? `${subject.id} lacks wa-internal:simple-hook-state`
    : false;
if (reason) test.skip(`SimpleHook data-state suite skipped: ${reason}`, () => {});
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
