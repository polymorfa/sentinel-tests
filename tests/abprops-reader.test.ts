import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

test('reader v1 plans are immutable and v2 waiter histories stay bounded', () => {
  const cases = abpropsReaderCases();
  const original = cases.filter((item) => item.version === 1);
  assert.equal(original.length, 32);
  assert.equal(
    original.reduce((sum, item) => sum + item.probes.length, 0),
    800,
  );
  assert.equal(
    createHash('sha256').update(JSON.stringify(original)).digest('hex'),
    '787cb5e54d4dd26ddebc0ea2db2c500b8dd4ce1b7f3943be1e08f61a71eda91d',
  );
  const added = cases.filter((item) => item.version === 2);
  assert.equal(added.length, 16);
  assert.equal(
    added.reduce((sum, item) => sum + item.probes.length, 0),
    656,
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  for (const item of added) {
    assert.ok(item.id.endsWith('-v2'));
    assert.ok(item.probes.length < 128);
    const handles = new Set<string>();
    for (const probe of item.probes) {
      if (!probe.pending) continue;
      const { id, action } = probe.pending;
      if (action === 'start') {
        assert.ok(!handles.has(id), `${item.id}: unique handle ${id}`);
        handles.add(id);
      } else assert.ok(handles.has(id), `${item.id}: earlier start for ${id}`);
    }
    assert.ok(handles.size >= 4 && handles.size <= 128);
  }
});
