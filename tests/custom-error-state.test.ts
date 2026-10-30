import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  customErrorStateCases,
  customErrorBabelSha256,
} from '../support/custom-error-state-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import { readFile } from 'node:fs/promises';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import type { SuiteMetadata } from '../support/suites.ts';
const cases = customErrorStateCases();
test('custom error plans use genuine construction and bounded earlier references', () => {
  assert.equal(cases.length, 10);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    74,
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  for (const item of cases) {
    validateProbeControls(item);
    assert.ok(item.probes.length <= 96);
    assert.equal(item.stubs, undefined);
    assert.equal(item.context?.babelHelpers, undefined);
    assert.deepEqual(item.context?.bootstrap, { 'babel-helpers': customErrorBabelSha256 });
    for (const probe of item.probes) {
      if (item.construct) {
        assert.equal(probe.method, 'toString');
        assert.equal(probe.construct, undefined);
      } else {
        assert.equal(probe.construct, true);
        assert.equal(probe.method, undefined);
      }
    }
  }
});
const metadata = JSON.parse(
  await readFile(new URL('../metadata/suites/custom-error-state.json', import.meta.url), 'utf8'),
) as SuiteMetadata;
function check(testCase: BehaviorCase, result: CaseResult) {
  assertCaseObservations(testCase, result);
  assert.deepEqual(
    (result.clockUpdates || []).map(({ beforeProbe, clock }) => ({ beforeProbe, clock })),
    testCase.probes
      .filter((probe) => probe.clock)
      .map((probe) => ({ beforeProbe: probe.id, clock: probe.clock })),
  );
  for (const observation of result.gateObservations || []) {
    assert.ok(observation.resolved);
    assert.equal(observation.value, testCase.context!.gates![observation.kind]?.[observation.key]);
  }

  assert.equal(result.bootstrapAssets?.length, 1, 'Actual admitted source asset required');
  assert.equal(
    result.bootstrapExecutions?.length,
    1,
    'Actual bootstrap execution observation required',
  );
  const asset = result.bootstrapAssets![0]!;
  const observation = metadata.observations.find(
    (item) => `whatsapp-${item.revision}` === asset.origin.revisionId,
  );
  assert.ok(observation);
  assert.deepEqual(asset, observation.bootstrapAssets![0]);
  const { environment, ...execution } = result.bootstrapExecutions![0]!;
  assert.deepEqual(environment, {
    globalAlias: 'bootstrap-only-realm-globalThis',
    namespace: 'guarded-original-mutable-target',
  });
  assert.deepEqual(execution, { ...asset, executed: true, beforeModuleDefinitions: true });
}
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:custom-error-state')
    ? `${subject.id} lacks explicitly configured wa-internal:custom-error-state`
    : false;
if (reason) test.skip(`Custom error state suite skipped: ${reason}`, () => {});
for (const testCase of reason ? [] : cases)
  test(testCase.id, async () => {
    assert.ok(subject);
    check(testCase, await subject.runCase(testCase));
    if (subject.compareCase) {
      const pair = await subject.compareCase(testCase);
      assert.equal(pair.status, 'unchanged', testCase.id);
      check(testCase, pair.baseline);
      assert.ok(pair.candidate);
      check(testCase, pair.candidate);
    }
  });
