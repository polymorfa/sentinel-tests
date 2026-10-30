import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fifoCacheStateCases } from '../support/fifo-cache-state-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import metadata from '../metadata/suites/fifo-cache-state.json';

const cases = fifoCacheStateCases();
test('FIFO cache plans pin bounded original set/get histories and independent expectations', () => {
  assert.deepEqual(fifoCacheStateCases(), cases);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  assert.equal(cases.length, metadata.trials.cases);
  assert.ok(cases.length <= 20);
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
  for (const item of cases) {
    validateProbeControls(item);
    assert.equal(item.module, 'LRUCache');
    assert.equal(item.export, '$module');
    assert.ok(item.construct);
    assert.equal(item.context, undefined);
    assert.equal(item.stubs, undefined);
    assert.ok(item.probes.length <= 96);
    assert.ok(item.probes.filter((probe) => probe.retain).length <= 128);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    for (const probe of item.probes) {
      assert.ok(probe.method === 'set' || probe.method === 'get');
      assert.equal(probe.module, undefined);
      assert.equal(probe.export, undefined);
      assert.equal(probe.construct, undefined);
      assert.equal(probe.pending, undefined);
      if (probe.result) assert.ok('identityWith' in probe.result);
    }
  }
  for (const observation of metadata.observations) {
    assert.equal(observation.modules.length, 2);
    assert.equal(observation.staticCoverage.complete, true);
    assert.equal(observation.staticCoverage.sourceBytes, 1256);
    assert.equal(observation.staticCoverage.workBudget.consumed, 5667);
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
  : !subject.capabilities?.includes('wa-internal:fifo-cache-state')
    ? `${subject.id} lacks wa-internal:fifo-cache-state`
    : false;
if (reason) test.skip(`FIFO cache state skipped: ${reason}`, () => {});
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
