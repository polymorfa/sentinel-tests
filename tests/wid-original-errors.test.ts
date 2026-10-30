import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  widOriginalErrorsCases,
  widOriginalBabelSha256,
} from '../support/wid-original-errors-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import { readFile } from 'node:fs/promises';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import type { SuiteMetadata } from '../support/suites.ts';
const cases = widOriginalErrorsCases();
test('original Wid error plans retain every finite boolean assignment and bounded original methods', () => {
  assert.equal(cases.length, 18);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    402,
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  const factoryCases = cases.filter((item) => item.module === 'WAWebWidFactory');
  assert.equal(factoryCases.length, 8);
  assert.deepEqual(
    factoryCases
      .map((item) =>
        ['16539', '26256', '26258'].map((key) => Number(item.context!.gates!.gkx![key])).join(''),
      )
      .sort(),
    ['000', '001', '010', '011', '100', '101', '110', '111'],
  );
  for (const item of cases) {
    validateProbeControls(item);
    assert.ok(item.probes.length <= 96);
    assert.equal(item.context?.babelHelpers, undefined);
    assert.deepEqual(item.context?.bootstrap, { 'babel-helpers': widOriginalBabelSha256 });
    if (item.module === 'WAWebWidError') assert.equal(item.stubs, undefined);
    else assert.deepEqual(item.stubs, [{ module: 'cr:6640', exports: null }]);
  }
});
const metadata = JSON.parse(
  await readFile(new URL('../metadata/suites/wid-original-errors.json', import.meta.url), 'utf8'),
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
  : !subject.capabilities?.includes('wa-internal:wid-original-errors')
    ? `${subject.id} lacks explicitly configured wa-internal:wid-original-errors`
    : false;
if (reason) test.skip(`Wid original errors suite skipped: ${reason}`, () => {});
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
