import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { wamEventStateCases, originalBabelSha256 } from '../support/wam-event-state-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import { readFile } from 'node:fs/promises';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import type { SuiteMetadata } from '../support/suites.ts';
const cases = wamEventStateCases();
test('WAM state plans use original Babel and every known boolean assignment with bounded probes', () => {
  assert.equal(new Set(cases.map((testCase) => testCase.id)).size, cases.length);
  assert.equal(cases.length, 56);
  assert.equal(new Set(cases.map((item) => JSON.stringify(item.context!.gates))).size, 8);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    1296,
  );
  for (const knob of [false, true]) {
    const signatures = new Set(
      cases
        .filter((item) => item.context!.gates!.knobs!['1600'] === knob)
        .map((item) =>
          ['26258', '26259'].map((key) => Number(item.context!.gates!.gkx![key])).join(''),
        ),
    );
    assert.deepEqual([...signatures].sort(), ['00', '01', '10', '11']);
  }
  for (const testCase of cases) {
    assert.ok(testCase.probes.length <= 96);
    validateProbeControls(testCase);
    assert.equal(testCase.context?.babelHelpers, undefined);
    assert.deepEqual(testCase.context?.bootstrap, { 'babel-helpers': originalBabelSha256 });
    assert.ok(
      testCase.probes.every(
        (probe) => !['commit', 'commitAndWaitForFlush'].includes(probe.method || ''),
      ),
    );
  }
});
const metadata = JSON.parse(
  await readFile(new URL('../metadata/suites/wam-event-state.json', import.meta.url), 'utf8'),
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
  : !subject.capabilities?.includes('wa-internal:wam-event-state')
    ? `${subject.id} lacks explicitly configured wa-internal:wam-event-state`
    : false;
if (reason) test.skip(`WAM event state suite skipped: ${reason}`, () => {});
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
