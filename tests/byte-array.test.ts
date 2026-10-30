import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { byteArrayCases, integerByteOracle } from '../support/byte-array-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/suites/byte-array.json';

const cases = byteArrayCases();
test('byte-array plans preserve independent word oracles and bounded object histories', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(byteArrayCases(), cases);
  assert.deepEqual(integerByteOracle(0, -1), []);
  assert.deepEqual(integerByteOracle(3, 0x12345678), [0x34, 0x56, 0x78]);
  assert.deepEqual(integerByteOracle(6, -1), [0, 0, 255, 255, 255, 255]);
  assert.deepEqual(integerByteOracle(4, 0x100000001), [0, 0, 0, 1]);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    metadata.trials.probesPerRevision,
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  const exports = new Set<string>();
  for (const item of cases) {
    validateProbeControls(item);
    assert.equal(item.module, 'WAByteArray');
    assert.equal(item.export, 'intToBytes');
    assert.equal(item.context, undefined);
    assert.equal(item.stubs, undefined);
    assert.equal(item.construct, undefined);
    assert.ok(item.probes.length <= 96);
    assert.ok(item.probes.filter((probe) => probe.retain).length <= 128);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    for (const probe of item.probes) {
      exports.add(probe.export || item.export);
      assert.equal(probe.module, undefined);
      assert.equal(probe.method, undefined);
      assert.equal(probe.construct, undefined);
      assert.equal(probe.pending, undefined);
      assert.equal(probe.clock, undefined);
      if (probe.result) assert.ok('identityWith' in probe.result);
      if (probe.retain) assert.equal(probe.retain.stage, 'call');
    }
  }
  assert.deepEqual([...exports].sort(), ['compareArrayBuffer', 'intToBytes', 'uint8ArrayToBuffer']);
  for (const observation of metadata.observations) {
    assert.equal(observation.modules.length, 1);
    assert.equal(observation.staticCoverage.complete, true);
    assert.equal(observation.staticCoverage.workBudget.exhausted, false);
    assert.deepEqual(observation.gates, []);
    assert.deepEqual(observation.unresolved, []);
    assert.deepEqual(observation.modules[0]!.dependencies, []);
  }
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:byte-array')
    ? `${subject.id} lacks wa-internal:byte-array`
    : false;
if (reason) test.skip(`Byte-array suite skipped: ${reason}`, () => {});
function check(item: BehaviorCase, result: CaseResult) {
  assertCaseObservations(item, result);
  assert.deepEqual(result.gateObservations || [], []);
  assert.equal(result.bootstrapExecutions?.length || 0, 0);
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
