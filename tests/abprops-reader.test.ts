import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { abpropsReaderCases } from '../support/abprops-reader-cases.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';

const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:abprops-reader')
    ? `${subject.id} lacks wa-internal:abprops-reader`
    : false;
if (reason) test.skip(`ABProps reader suite skipped: ${reason}`, () => {});
function check(testCase: BehaviorCase, result: CaseResult) {
  assertCaseObservations(testCase, result);
  const initial = testCase.context!.gates!;
  const current = structuredClone(initial);
  for (const probe of testCase.probes) {
    const update = testCase.context?.gateUpdates?.find((item) => item.beforeProbe === probe.id);
    if (update?.gates.gkx) Object.assign(current.gkx!, update.gates.gkx);
    const reads = result.gateObservations?.filter((read) => read.probeId === probe.id) || [];
    for (const read of reads) {
      assert.ok(read.resolved, `${testCase.id}/${probe.id}: unresolved gate observation`);
      assert.deepEqual(
        read.value,
        current[read.kind]?.[read.key],
        `${testCase.id}/${probe.id}: current gate assignment`,
      );
    }
    if (probe.module !== 'WAWebABProps' || probe.throws) continue;
    for (const key of ['16539', '26256'])
      assert.ok(
        reads.some((read) => read.kind === 'gkx' && read.key === key),
        `${testCase.id}/${probe.id}: real reader gate${key} required`,
      );
  }
}
for (const testCase of reason ? [] : abpropsReaderCases()) {
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
