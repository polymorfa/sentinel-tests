import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { widStateCases } from '../support/wid-state-cases.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';

const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:wid-state')
    ? `${subject.id} lacks wa-internal:wid-state`
    : false;
if (reason) test.skip(`Wid state suite skipped: ${reason}`, () => {});
function check(testCase: BehaviorCase, result: CaseResult) {
  assertCaseObservations(testCase, result);
  let redaction = testCase.context!.gates!.gkx!['26258'];
  for (const probe of testCase.probes) {
    const update = testCase.context?.gateUpdates?.find((entry) => entry.beforeProbe === probe.id);
    if (update?.gates.gkx?.['26258'] !== undefined) redaction = update.gates.gkx['26258'];
    if (!probe.result || !('method' in probe.result) || probe.result.method !== 'toLogString')
      continue;
    const reads = result.gateObservations?.filter(
      (read) => read.probeId === probe.id && read.kind === 'gkx' && read.key === '26258',
    );
    assert.ok(reads?.length, `${testCase.id}/${probe.id}: real log redaction gate read required`);
    assert.ok(
      reads.every((read) => read.resolved && read.value === redaction),
      `${testCase.id}/${probe.id}: current redaction assignment`,
    );
  }
}
for (const testCase of reason ? [] : widStateCases()) {
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
}
