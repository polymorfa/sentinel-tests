import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { wavHeaderCases, wavHeaderFixture } from '../support/wav-header-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/suites/wav-header.json';
const cases = wavHeaderCases();
test('WAV plans distinguish magic-only validation from raw fields and native buffer guards', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(wavHeaderCases(), cases);
  const anchor = wavHeaderFixture(513, 48000);
  assert.deepEqual(anchor.slice(0, 12), [82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69]);
  assert.deepEqual(anchor.slice(22, 28), [1, 2, 128, 187, 0, 0]);
  assert.equal(cases.length, 24);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((n, c) => n + c.probes.length, 0),
    1395,
  );
  assert.equal(metadata.trials.probesPerRevision, 1395);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const item of cases) {
    validateProbeControls(item);
    assert.equal(item.module, 'WAParseWav');
    assert.equal(item.export, 'validateWav');
    assert.equal(item.context, undefined);
    assert.equal(item.stubs, undefined);
    assert.equal(item.construct, undefined);
    assert.ok(item.probes.length <= 64);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    for (let i = 0; i < item.probes.length; i++) {
      const p = item.probes[i]!;
      assert.ok(['validateWav', 'parseWav'].includes(p.export!));
      for (const key of ['module', 'method', 'construct', 'pending', 'clock'] as const)
        assert.equal(p[key], undefined);
      if (p.throws) {
        assert.equal(item.probes[i + 1]?.id, `${p.id}-retry`);
        assert.equal(item.probes[i + 1]?.export, p.export);
      }
      if (p.retain) assert.equal(p.retain.stage, 'call');
      if (p.result) assert.ok('identityWith' in p.result);
    }
  }
  const all = cases.flatMap((c) => c.probes);
  const short = cases.filter((c) => c.id.includes('short-lengths')).flatMap((c) => c.probes);
  assert.equal(short.filter((p) => p.export === 'validateWav').length, 44);
  assert.equal(short.filter((p) => p.throws?.name === 'RangeError').length, 28);
  assert.equal(
    short.filter((p) => p.export === 'parseWav' && !p.throws && !p.id.endsWith('-retry')).length,
    16,
  );
  assert.equal(all.filter((p) => p.throws?.name === 'TypeError').length, 20);
  const magic = cases.filter((c) => c.id.includes('magic-bit-flips')).flatMap((c) => c.probes);
  assert.equal(magic.filter((p) => p.export === 'validateWav').length, 64);
  assert.ok(magic.filter((p) => p.export === 'validateWav').every((p) => p.expected === null));
  const other = cases
    .filter((c) => c.id.includes('other-header-bit-flips'))
    .flatMap((c) => c.probes);
  assert.equal(other.length, 576);
  assert.ok(other.every((p) => !p.throws));
  const identity = cases.find((c) => c.id.includes('returned-buffer-identity'))!.probes;
  assert.deepEqual(identity[1]!.result, { identityWith: 'validated' });
  assert.equal(identity[1]!.expected, true);
  assert.deepEqual(identity[2]!.args, [{ $type: 'reference', value: 'validated' }]);
  for (const o of metadata.observations) {
    assert.equal(o.modules.length, 1);
    assert.deepEqual(o.modules[0]!.dependencies, []);
    assert.equal(o.staticCoverage.complete, true);
    assert.deepEqual(o.gates, []);
    assert.deepEqual(o.unresolved, []);
  }
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:wav-header')
    ? `${subject.id} lacks wa-internal:wav-header`
    : false;
if (reason) test.skip(`WAV header suite skipped: ${reason}`, () => {});
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
  const o = metadata.observations.find(
    (o) =>
      source.revisionId === `whatsapp-${o.revision}` ||
      o.modules.every((m) =>
        actual.sources?.some(
          (s) => s.name === m.module && s.sourceSha256 === m.printedSourceSha256,
        ),
      ),
  );
  assert.ok(o);
  assert.ok(actual.gateInventory);
  assert.equal(actual.gateInventory.digest, o.inventoryDigest);
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
