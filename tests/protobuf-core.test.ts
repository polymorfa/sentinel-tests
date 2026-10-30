import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import {
  protobufUtilityCases,
  protobufCompileCases,
  protobufEncodeCases,
  protobufDecodeCases,
} from '../support/protobuf-cases.ts';
import type { BehaviorCase, CaseResult, JsonValue } from '../support/types.ts';

const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:protobuf-core')
    ? `${subject.id} lacks wa-internal:protobuf-core`
    : false;
if (reason) test.skip(`Protobuf suite skipped: ${reason}`, () => {});

function checkObservations(testCase: BehaviorCase, result: CaseResult) {
  assertCaseObservations(testCase, result);
  const initial = testCase.context?.gates?.knobs?.['2451'];
  if (initial === undefined) return;
  assert.ok(result.gateObservations?.length, `${testCase.id}: actual knob read trace required`);
  for (const probe of testCase.probes) {
    let expected: JsonValue = initial;
    for (const update of testCase.context?.gateUpdates || []) {
      if (
        testCase.probes.findIndex((p) => p.id === update.beforeProbe) <=
        testCase.probes.indexOf(probe)
      )
        expected = update.gates.knobs?.['2451'] ?? expected;
    }
    const observed: NonNullable<CaseResult['gateObservations']> = result.gateObservations.filter(
      (read) => read.kind === 'knobs' && read.key === '2451' && read.probeId === probe.id,
    );
    assert.ok(observed.length, `${testCase.id}/${probe.id}: missing actual depth knob read`);
    assert.ok(observed.every((read) => read.resolved && read.value === expected));
  }
}

async function verify(cases: BehaviorCase[]) {
  assert.ok(subject);
  for (const testCase of cases) {
    checkObservations(testCase, await subject.runCase(testCase));
    if (subject.compareCase) {
      const pair = await subject.compareCase(testCase);
      assert.equal(pair.status, 'unchanged', testCase.id);
      checkObservations(testCase, pair.baseline);
      assert.ok(pair.candidate);
      checkObservations(testCase, pair.candidate);
    }
  }
}
describe('Actual protobuf core', { skip: reason }, () => {
  test('all 18 source-defined types and eight flag combinations', () =>
    verify(protobufUtilityCases()));
  test('schema sorting, defaults, enum/map metadata, oneofs, cache and errors', () =>
    verify(protobufCompileCases()));
  test('real encoder produces independently fixed protobuf bytes', () =>
    verify(protobufEncodeCases()));
  test('real decoder accepts independent wire vectors and rejects malformed input under both knob assignments', () =>
    verify(protobufDecodeCases()));
});
