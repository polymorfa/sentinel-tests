import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { groupABPropsCases } from '../support/group-abprops-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import { createHash } from 'node:crypto';

const cases = groupABPropsCases();
test('Group ABProps plans retain bounded actual-reader, gate and reference controls', () => {
  assert.equal(new Set(cases.map((value) => value.id)).size, cases.length);
  const original = cases.filter(
    (testCase) => !testCase.id.includes('boolean-cartesian-transition'),
  );
  assert.equal(original.length, 22);
  assert.equal(
    createHash('sha256').update(JSON.stringify(original)).digest('hex'),
    'caac2a3ad516357f3f825bdc4b123c8448de520638e7b65a54137f8d37324212',
  );
  const product = cases.filter((testCase) => testCase.id.includes('boolean-cartesian-transition'));
  assert.equal(product.length, 64);
  const assignmentKeys = ['10314', '16539', '26256', '26258', '26259', '4112'];
  const signatures = new Set(
    product.map((testCase) =>
      assignmentKeys.map((key) => Number(testCase.context!.gates!.gkx![key])).join(''),
    ),
  );
  assert.equal(signatures.size, 64);
  for (let bits = 0; bits < 64; bits++)
    assert.ok(
      signatures.has(assignmentKeys.map((_, index) => Math.floor(bits / 2 ** index) % 2).join('')),
    );
  for (const testCase of cases) {
    assert.ok(testCase.probes.length <= 96);
    validateProbeControls(testCase);
  }
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:group-abprops')
    ? `${subject.id} lacks wa-internal:group-abprops`
    : false;
if (reason) test.skip(`Group ABProps suite skipped: ${reason}`, () => {});
function check(testCase: BehaviorCase, result: CaseResult) {
  assertCaseObservations(testCase, result);
  let values = { ...testCase.context!.gates!.gkx! };
  const expected = new Map<string, Record<string, boolean>>();
  for (const probe of testCase.probes) {
    const update = testCase.context!.gateUpdates?.find((update) => update.beforeProbe === probe.id);
    if (update?.gates.gkx) values = { ...values, ...update.gates.gkx };
    expected.set(probe.id, values);
  }
  assert.ok(
    result.gateObservations?.length,
    `${testCase.id}: actual reader gate observations required`,
  );
  for (const read of result.gateObservations!) {
    assert.equal(read.kind, 'gkx');
    const assignment = expected.get(read.probeId!)!;
    assert.ok(Object.hasOwn(assignment, read.key));
    assert.equal(read.value, assignment[read.key]);
  }
  assert.deepEqual(
    (result.gateUpdates || []).map(({ beforeProbe, gates }) => ({ beforeProbe, gates })),
    testCase.context!.gateUpdates || [],
  );
}
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
