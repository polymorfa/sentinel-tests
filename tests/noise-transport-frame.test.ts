import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  noiseTransportFrameCases,
  transportFrameWire,
  unsignedVarint,
} from '../support/noise-transport-frame-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/suites/noise-transport-frame.json';
const cases = noiseTransportFrameCases();
test('transport frame plans use an independent unsigned wire oracle and bounded recovery histories', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(noiseTransportFrameCases(), cases);
  assert.deepEqual(unsignedVarint(0n), [0]);
  assert.deepEqual(unsignedVarint(128n), [128, 1]);
  assert.deepEqual(
    unsignedVarint(0xffffffffffffffffn),
    [255, 255, 255, 255, 255, 255, 255, 255, 255, 1],
  );
  assert.deepEqual(
    transportFrameWire({
      chunkId: '0x0000000000000000',
      chunkIndex: 0,
      totalChunks: 0,
      payload: [],
    }),
    [],
  );
  assert.deepEqual(
    transportFrameWire({
      chunkId: '0x0000000000000001',
      chunkIndex: 1,
      totalChunks: 1,
      payload: [0],
    }),
    [8, 1, 16, 1, 24, 1, 34, 1, 0],
  );
  assert.equal(cases.length, 33);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((n, p) => n + p.probes.length, 0),
    1763,
  );
  assert.equal(metadata.trials.probesPerRevision, 1763);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const item of cases) {
    validateProbeControls(item);
    assert.ok(item.probes.length <= 64);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    assert.equal(item.module, 'WAWebHatchNoiseTransportFrameCodec');
    assert.equal(item.construct, undefined);
    assert.equal(item.context, undefined);
    assert.equal(item.stubs, undefined);
    for (let i = 0; i < item.probes.length; i++) {
      const p = item.probes[i]!;
      assert.ok(['encodeTransportFrame', 'decodeTransportFrame'].includes(p.export!));
      for (const key of ['module', 'method', 'construct', 'pending', 'clock'] as const)
        assert.equal(p[key], undefined);
      if (p.throws) {
        assert.equal(item.probes[i + 1]?.id, `${p.id}-retry`);
        assert.equal(item.probes[i + 1]?.export, p.export);
      }
      if (p.result) assert.ok('identityWith' in p.result);
      if (p.retain) assert.equal(p.retain.stage, 'call');
    }
  }
  const prefix = cases.filter((c) => c.id.includes('prefix-truncation')).flatMap((c) => c.probes);
  assert.equal(prefix.filter((p) => !p.throws && !p.id.endsWith('-retry')).length, 15);
  assert.equal(prefix.filter((p) => p.throws).length, 170);
  const duplicates = cases.find((c) => c.id.includes('duplicate-assignment-drafts'))!;
  assert.equal(duplicates.probes.length, 64);
  for (const observation of metadata.observations) {
    assert.equal(observation.modules.length, 8);
    assert.equal(observation.staticCoverage.complete, true);
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
  : !subject.capabilities?.includes('wa-internal:noise-transport-frame-codec')
    ? `${subject.id} lacks wa-internal:noise-transport-frame-codec`
    : false;
if (reason) test.skip(`Noise transport frame suite skipped: ${reason}`, () => {});
function check(item: BehaviorCase, result: CaseResult) {
  assertCaseObservations(item, result);
  assert.deepEqual(result.gateObservations || [], []);
  assert.equal(result.bootstrapExecutions?.length || 0, 0);
  const actual = result as CaseResult & {
    gateInventory?: { digest: string; roots: string[]; gates: unknown[]; unresolved: unknown[] };
    sources?: { name: string; revisionId?: string; sourceSha256: string }[];
  };
  const source = actual.sources?.find((s) => s.name === item.module);
  assert.ok(source);
  const observation = metadata.observations.find(
    (o) =>
      source.revisionId === `whatsapp-${o.revision}` ||
      o.modules.every((m) =>
        actual.sources?.some(
          (s) => s.name === m.module && s.sourceSha256 === m.printedSourceSha256,
        ),
      ),
  );
  assert.ok(observation);
  assert.ok(actual.gateInventory);
  assert.equal(actual.gateInventory.digest, observation.inventoryDigest);
  assert.deepEqual(actual.gateInventory.roots, [item.module]);
  assert.deepEqual(actual.gateInventory.gates, []);
  assert.deepEqual(actual.gateInventory.unresolved, []);
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
