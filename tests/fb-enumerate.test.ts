import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { fbEnumerateCases, equalsIterableCases } from '../support/fb-enumerate-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import { readFile } from 'node:fs/promises';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import type { SuiteMetadata } from '../support/suites.ts';
const cases = [...fbEnumerateCases(), ...equalsIterableCases()];
test('FB enumeration cases use pinned selectors and bounded source iterator/reference plans', () => {
  assert.equal(new Set(cases.map((testCase) => testCase.id)).size, cases.length);
  for (const testCase of cases) {
    assert.ok(testCase.probes.length <= 96);
    validateProbeControls(testCase);
  }
});
const metadata = JSON.parse(
  await readFile(new URL('../metadata/suites/fb-enumerate.json', import.meta.url), 'utf8'),
) as SuiteMetadata;
function check(testCase: BehaviorCase, result: CaseResult) {
  assertCaseObservations(testCase, result);
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
  const { environment: _environment, ...execution } = result.bootstrapExecutions![0]!;
  assert.deepEqual(execution, { ...asset, executed: true, beforeModuleDefinitions: true });
}
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:fb-enumerate')
    ? `${subject.id} lacks explicitly configured wa-internal:fb-enumerate`
    : false;
if (reason) test.skip(`FB enumeration suite skipped: ${reason}`, () => {});
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
