import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  historyProgressGettersCases,
  historyProgressBabelSha256,
} from '../support/history-progress-getters-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/suites/history-progress-getters.json';

const cases = historyProgressGettersCases();
test('history getter plans retain all eight known boolean inputs and source-only state boundaries', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(historyProgressGettersCases(), cases);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    metadata.trials.probesPerRevision,
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  const contexts = new Map<string, number>();
  for (const item of cases) {
    validateProbeControls(item);
    assert.ok(item.probes.length <= 60);
    assert.equal(item.construct, undefined);
    assert.equal(item.context?.babelHelpers, undefined);
    assert.deepEqual(item.context?.bootstrap, { 'babel-helpers': historyProgressBabelSha256 });
    assert.deepEqual(item.stubs, [{ module: 'cr:6640', exports: null }]);
    const context = JSON.stringify(item.context!.gates);
    contexts.set(context, (contexts.get(context) || 0) + 1);
    for (const probe of item.probes) {
      assert.equal(probe.construct, undefined);
      assert.equal(probe.method, undefined);
      assert.ok([undefined, 'WAWebGetters'].includes(probe.module));
      if (probe.result) {
        assert.ok('method' in probe.result);
        assert.equal(probe.result.method, 'unsafeIdentityGetter');
        assert.equal(probe.retain?.stage, 'result');
      }
    }
  }
  assert.equal(contexts.size, 8);
  assert.deepEqual([...contexts.values()], Array(8).fill(6));
  for (const observation of metadata.observations) {
    assert.equal(observation.modules.length, 27);
    assert.equal(observation.analyzer.version, 4);
    assert.equal(observation.staticCoverage.complete, false);
    assert.equal(observation.staticCoverage.workBudget.exhausted, false);
    assert.equal(observation.gates.length, 3);
    assert.equal(observation.unresolved.length, 6);
  }
});
function check(item: BehaviorCase, result: CaseResult) {
  assertCaseObservations(item, result);
  const reads = result.gateObservations || [];
  assert.ok(
    reads.some(
      (read) => read.kind === 'abprops' && read.key === 'web_getters_lazy_slot_allocation',
    ),
  );
  for (const read of reads) {
    assert.ok(read.resolved);
    assert.equal(read.value, item.context!.gates![read.kind]?.[read.key]);
  }
  assert.equal(result.bootstrapAssets?.length, 1);
  const asset = result.bootstrapAssets![0]!;
  const observation = metadata.observations.find(
    (item) => `whatsapp-${item.revision}` === asset.origin.revisionId,
  );
  assert.ok(observation);
  assert.deepEqual(asset, observation.bootstrapAssets[0]);
  const { environment, ...event } = result.bootstrapExecutions![0]!;
  assert.deepEqual(environment, {
    globalAlias: 'bootstrap-only-realm-globalThis',
    namespace: 'guarded-original-mutable-target',
  });
  assert.deepEqual(event, { ...asset, executed: true, beforeModuleDefinitions: true });
}
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:history-progress-getters')
    ? `${subject.id} lacks wa-internal:history-progress-getters`
    : false;
if (reason) test.skip(`History progress getter suite skipped: ${reason}`, () => {});
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
