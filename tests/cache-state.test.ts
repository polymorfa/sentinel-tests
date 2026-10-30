import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lruStateCases,
  wwAiCacheCases,
  lruReferenceCases,
  wwAiReferenceCases,
} from '../support/cache-state-cases.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import { createHash } from 'node:crypto';
import { validateProbeControls } from '../support/probe-controls.ts';

test('existing36 cache v1 plans remain immutable and new reference histories are bounded', () => {
  const original = [...lruStateCases(), ...wwAiCacheCases()];
  assert.equal(original.length, 36);
  assert.equal(
    createHash('sha256').update(JSON.stringify(original)).digest('hex'),
    '0b4268d7dbe7902326502baf27dcc40dc2ef1f2dc6f3dff987fddfeca1354061',
  );
  const referenceCases = [...lruReferenceCases(), ...wwAiReferenceCases()];
  assert.equal(new Set(referenceCases.map((testCase) => testCase.id)).size, referenceCases.length);
  for (const testCase of referenceCases) {
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
  : !subject.capabilities?.includes('wa-internal:cache-state')
    ? `${subject.id} lacks wa-internal:cache-state`
    : false;
if (reason) test.skip(`Cache state suite skipped: ${reason}`, () => {});
function check(testCase: BehaviorCase, result: CaseResult) {
  assertCaseObservations(testCase, result);
  const expected = testCase.probes
    .filter((probe) => probe.clock)
    .map((probe) => ({ beforeProbe: probe.id, clock: probe.clock }));
  assert.deepEqual(
    result.clockUpdates || [],
    expected,
    `${testCase.id}: actual ordered clock updates required`,
  );
}
for (const testCase of reason
  ? []
  : [...lruStateCases(), ...wwAiCacheCases(), ...lruReferenceCases(), ...wwAiReferenceCases()]) {
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
