import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { abpropsCacheCases } from '../support/abprops-cache-cases.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';

const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:abprops-cache')
    ? `${subject.id} lacks wa-internal:abprops-cache`
    : false;
if (reason) test.skip(`ABProps cache suite skipped: ${reason}`, () => {});
function check(testCase: BehaviorCase, result: CaseResult) {
  assertCaseObservations(testCase, result);
  let enabled = testCase.context!.gates!.gkx!['16539'];
  for (const probe of testCase.probes) {
    const update = testCase.context?.gateUpdates?.find((item) => item.beforeProbe === probe.id);
    if (update?.gates.gkx?.['16539'] !== undefined) enabled = update.gates.gkx['16539'];
    if (probe.export !== 'peekABPropConfigValue') continue;
    const reads = result.gateObservations?.filter(
      (read) => read.kind === 'gkx' && read.key === '16539' && read.probeId === probe.id,
    );
    assert.ok(reads?.length, `${testCase.id}/${probe.id}: actual gkx16539 read required`);
    assert.ok(
      reads.every((read) => read.resolved && read.value === enabled),
      `${testCase.id}/${probe.id}: current assignment must reach original cache`,
    );
  }
}
for (const testCase of reason ? [] : abpropsCacheCases()) {
  test(testCase.id, async () => {
    assert.ok(subject);
    const result = await subject.runCase(testCase);
    check(testCase, result);
    if (subject.compareCase) {
      const pair = await subject.compareCase(testCase);
      assert.equal(pair.status, 'unchanged', testCase.id);
      check(testCase, pair.baseline);
      assert.ok(pair.candidate);
      check(testCase, pair.candidate);
    }
  });
}
