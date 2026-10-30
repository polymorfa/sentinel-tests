import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { groupABPropsStorageInputCases } from '../support/group-abprops-storage-input-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';

const cases = groupABPropsStorageInputCases();
test('storage-input plans use bounded original transform controls without storage acquisition', () => {
  assert.equal(cases.length, 14);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    332,
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  assert.equal(new Set(cases.map((item) => item.context!.gates!.gkx!['16539'])).size, 2);
  for (const item of cases) {
    validateProbeControls(item);
    assert.ok(item.probes.length <= 96);
    assert.equal(item.module, 'WAWebGroupABPropsUpdateFromStorage');
    assert.equal(item.export, 'updateSingleGroupABPropsCache');
    assert.ok(item.probes.some((probe) => probe.export === item.export));
    assert.ok(item.probes.every((probe) => probe.export !== 'updateGroupABPropsFromStorage'));
    assert.deepEqual(
      item.stubs!.map((stub) => stub.module),
      ['JSErrorLoggingConfig', 'SiteData', 'cr:38444', 'cr:5292', 'cr:6640'],
    );
  }
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:group-abprops-storage-input')
    ? `${subject.id} lacks wa-internal:group-abprops-storage-input`
    : false;
if (reason) test.skip(`Group ABProps storage-input suite skipped: ${reason}`, () => {});
function check(item: BehaviorCase, result: CaseResult) {
  assertCaseObservations(item, result);
  assert.ok(result.gateObservations?.some((read) => read.kind === 'gkx' && read.key === '16539'));
  for (const read of result.gateObservations || []) {
    assert.ok(read.resolved);
    assert.equal(read.value, item.context!.gates![read.kind]?.[read.key]);
  }
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
