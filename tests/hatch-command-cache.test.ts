import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hatchCommandCacheCases } from '../support/hatch-command-cache-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult, JsonValue } from '../support/types.ts';
import metadata from '../metadata/suites/hatch-command-cache.json';
const cases = hatchCommandCacheCases();
test('Hatch cache plans enumerate all selected ordered histories with independent state checks', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(hatchCommandCacheCases(), cases);
  assert.equal(
    createHash('sha256')
      .update(JSON.stringify(cases, null, 2) + '\n')
      .digest('hex'),
    '25c73fe1fdf5050e119e9b3bf191fd5962a393b3b40df40ec8fec1d21d5b8d9a',
  );
  assert.equal(cases.length, 69);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((n, c) => n + c.probes.length, 0),
    837,
  );
  assert.equal(metadata.trials.probesPerRevision, 837);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  const keys = ['19995550101@s.whatsapp.net', '19995550102@s.whatsapp.net'];
  const values: JsonValue[] = [
    [{ name: '/alpha', description: 'Alpha command', prompt: 'Synthetic alpha prompt' }],
    [
      { name: 'beta', description: 'Beta command', prompt: 'Synthetic beta prompt' },
      { name: '/beta-long', description: 'Second', prompt: 'Different' },
    ],
  ];
  const seen = new Set<string>();
  for (let history = 0; history < 64; history++) {
    const c = cases[history]!,
      digits = history.toString(4).padStart(3, '0'),
      state = new Map<string, JsonValue>();
    seen.add(digits);
    assert.equal(c.probes.length, 11);
    assert.deepEqual(
      c.probes.slice(0, 2).map((p) => p.expected),
      [{ $type: 'undefined' }, { $type: 'undefined' }],
    );
    for (let step = 0; step < 3; step++) {
      const op = Number(digits[step]),
        key = keys[Math.floor(op / 2)]!,
        value = values[op % 2]!,
        write = c.probes[2 + step * 3]!;
      assert.equal(write.id, `step-${step}-op-${op}`);
      assert.deepEqual(write.args, [key, value]);
      state.set(key, value);
      for (let k = 0; k < 2; k++) {
        const read = c.probes[3 + step * 3 + k]!;
        assert.deepEqual(read.args, [keys[k]!]);
        assert.deepEqual(read.expected, state.get(keys[k]!) ?? { $type: 'undefined' });
      }
    }
  }
  assert.equal(seen.size, 64);
  for (const a of '0123')
    for (const b of '0123') for (const c of '0123') assert.ok(seen.has(a + b + c));
  for (const c of cases) {
    validateProbeControls(c);
    assert.equal(c.module, 'WAWebHatchCommandCache');
    assert.equal(c.context, undefined);
    assert.equal(c.stubs, undefined);
    assert.equal(c.construct, undefined);
    assert.ok(c.probes.length <= 64);
    assert.ok(Buffer.byteLength(JSON.stringify(c)) <= 256 * 1024);
    for (const p of c.probes) {
      assert.ok(['getHatchCommands', 'setHatchCommands'].includes(p.export!));
      assert.equal(p.throws, undefined);
      for (const key of ['module', 'method', 'construct', 'pending', 'clock'] as const)
        assert.equal(p[key], undefined);
      if (p.export === 'setHatchCommands') assert.deepEqual(p.expected, { $type: 'undefined' });
      if (p.retain) {
        assert.equal(p.export, 'getHatchCommands');
        assert.equal(p.retain.stage, 'call');
      }
      if (p.result) assert.ok('identityWith' in p.result);
    }
  }
  const natural = cases.find((c) => c.id.includes('natural-cached-array'))!.probes;
  assert.deepEqual(natural.find((p) => p.id === 'restore-actual-old')!.args, [
    'key',
    { $type: 'reference', value: 'original' },
  ]);
  assert.equal(natural.find((p) => p.id === 'restored-old')!.expected, true);
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
  : !subject.capabilities?.includes('wa-internal:hatch-command-cache')
    ? `${subject.id} lacks wa-internal:hatch-command-cache`
    : false;
if (reason) test.skip(`Hatch command cache suite skipped: ${reason}`, () => {});
function check(c: BehaviorCase, result: CaseResult) {
  assertCaseObservations(c, result);
  assert.deepEqual(result.gateObservations || [], []);
  assert.equal(result.bootstrapExecutions?.length || 0, 0);
  const actual = result as CaseResult & {
    gateInventory?: { digest: string; roots: string[]; gates: unknown[]; unresolved: unknown[] };
    sources?: { name: string; revisionId?: string; sourceSha256: string }[];
  };
  const source = actual.sources?.find((s) => s.name === c.module);
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
  assert.deepEqual(actual.gateInventory.roots, [c.module]);
  assert.deepEqual(actual.gateInventory.gates, []);
  assert.deepEqual(actual.gateInventory.unresolved, []);
}
for (const c of reason ? [] : cases)
  test(c.id, async () => {
    assert.ok(subject);
    check(c, await subject.runCase(c));
    if (subject.compareCase) {
      const p = await subject.compareCase(c);
      assert.equal(p.status, 'unchanged');
      check(c, p.baseline);
      assert.ok(p.candidate);
      check(c, p.candidate);
    }
  });
