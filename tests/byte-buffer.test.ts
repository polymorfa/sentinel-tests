import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { byteBufferCases } from '../support/byte-buffer-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import metadata from '../metadata/suites/byte-buffer.json';

const cases = byteBufferCases();
test('byte buffer plans pin bounded independent byte oracles and complete supported gate closure', () => {
  assert.deepEqual(byteBufferCases(), cases);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((n, item) => n + item.probes.length, 0),
    metadata.trials.probesPerRevision,
  );
  assert.equal(
    createHash('sha256').update(JSON.stringify(cases)).digest('hex'),
    metadata.trials.plansSha256,
  );
  assert.equal(
    Math.max(...cases.map((item) => Buffer.byteLength(JSON.stringify(item)))),
    metadata.trials.maxSerializedCaseBytes,
  );
  assert.deepEqual(
    new Set(cases.flatMap((item) => item.probes.map((probe) => probe.export))),
    new Set(['wrapString', 'wrapBufferToString', 'wrapUint8Array', 'wrapArrayBuffer']),
  );
  for (const item of cases) {
    validateProbeControls(item);
    assert.ok(item.probes.length <= 96);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    assert.ok(item.probes.filter((probe) => probe.retain).length <= 128);
    assert.equal(item.context, undefined);
    assert.equal(item.stubs, undefined);
    assert.equal(item.construct, undefined);
    for (const probe of item.probes) {
      assert.equal(probe.method, undefined);
      assert.equal(probe.construct, undefined);
      assert.equal(probe.pending, undefined);
    }
  }
  for (const observation of metadata.observations) {
    assert.equal(observation.modules.length, 6);
    assert.equal(observation.staticCoverage.complete, true);
    assert.equal(observation.staticCoverage.workBudget.consumed, 174642);
    assert.equal(observation.staticCoverage.workBudget.exhausted, false);
    assert.deepEqual(observation.gates, []);
    assert.deepEqual(observation.unresolved, []);
  }
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:byte-buffer')
    ? `${subject.id} lacks wa-internal:byte-buffer`
    : false;
if (reason) test.skip(`WAByteBuffer suite skipped: ${reason}`, () => {});
for (const item of reason ? [] : cases)
  test(item.id, async () => {
    assert.ok(subject);
    assertCaseObservations(item, await subject.runCase(item));
    if (subject.compareCase) {
      const pair = await subject.compareCase(item);
      assert.equal(pair.status, 'unchanged');
      assertCaseObservations(item, pair.baseline);
      assert.ok(pair.candidate);
      assertCaseObservations(item, pair.candidate);
    }
  });
