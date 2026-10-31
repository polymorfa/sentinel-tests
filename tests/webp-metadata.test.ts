import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  webpMetadataCases,
  webpMetadataDefaults,
  webpMetadataBabelSha256,
} from '../support/webp-metadata-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/suites/webp-metadata.json';
const cases = webpMetadataCases();
test('WebP metadata plans preserve full selected flag input model and independent field oracles', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(webpMetadataCases(), cases);
  assert.equal(
    createHash('sha256')
      .update(JSON.stringify(cases, null, 2) + '\n')
      .digest('hex'),
    '76806bcbf5ad8472a7739d889125d68d8f4d42874edb70c167cf062cb810a5ee',
  );
  assert.equal(cases.length, 11);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((n, c) => n + c.probes.length, 0),
    464,
  );
  assert.equal(metadata.trials.probesPerRevision, 464);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const c of cases) {
    validateProbeControls(c);
    assert.equal(c.module, 'WAWebWebpMetadata');
    assert.deepEqual(c.context, { bootstrap: { 'babel-helpers': webpMetadataBabelSha256 } });
    assert.equal(c.stubs, undefined);
    assert.equal(c.construct, undefined);
    assert.ok(c.probes.length <= 64);
    assert.ok(Buffer.byteLength(JSON.stringify(c)) <= 256 * 1024);
    for (let i = 0; i < c.probes.length; i++) {
      const p = c.probes[i]!;
      assert.ok(
        ['toRawWebpMetadata', 'toWebpMetadata', 'getStickerMakerSourceType'].includes(p.export!),
      );
      for (const key of ['module', 'method', 'construct', 'pending', 'clock'] as const)
        assert.equal(p[key], undefined);
      if (p.throws) {
        assert.equal(c.probes[i + 1]?.id, `${p.id}-retry`);
        assert.equal(c.probes[i + 1]?.export, p.export);
      }
      if (p.result) assert.ok('identityWith' in p.result);
      if (p.retain) assert.equal(p.retain.stage, 'call');
    }
  }
  const model = cases[0]!.probes;
  assert.equal(model.length, 32);
  const masks = new Set<number>();
  for (let i = 0; i < model.length; i += 2) {
    const input = model[i]!.args[0] as Record<string, boolean>,
      flagNames = ['isFirstParty', 'isFromStickerMaker', 'isAvatar', 'isAiSticker'];
    assert.ok(flagNames.every((name) => typeof input[name] === 'boolean'));
    const mask = flagNames.reduce((n, name, bit) => n + (input[name] ? 1 << bit : 0), 0);
    assert.equal(model[i]!.id, `mask-${mask}-serialize`);
    masks.add(mask);
    assert.deepEqual(model[i + 1]!.args, [model[i]!.expected!]);
    assert.deepEqual(model[i + 1]!.expected, { ...webpMetadataDefaults(), ...input });
  }
  assert.deepEqual(
    [...masks].sort((a, b) => a - b),
    Array.from({ length: 16 }, (_, i) => i),
  );
  const all = cases.flatMap((c) => c.probes);
  assert.equal(
    cases.filter((c) => c.id.includes('generated-unicode-records')).flatMap((c) => c.probes).length,
    64,
  );
  assert.equal(all.filter((p) => p.id.startsWith('member-')).length, 18);
  assert.equal(all.filter((p) => p.throws?.name === 'Error').length, 10);
  assert.equal(all.filter((p) => p.throws?.name === 'TypeError').length, 4);
  const natural = cases.at(-1)!.probes;
  assert.deepEqual(natural[1]!.args, [{ $type: 'reference', value: 'raw' }]);
  assert.deepEqual(
    natural.slice(2).map((p) => p.expected),
    [false, false],
  );
  for (const o of metadata.observations) {
    assert.equal(o.modules.length, 5);
    assert.equal(o.staticCoverage.complete, false);
    assert.equal(o.staticCoverage.workBudget.exhausted, false);
    assert.deepEqual(o.gates, []);
    assert.equal(o.unresolved.length, 2);
    assert.ok(o.unresolved.every((issue) => issue.code === 'dynamic-code-or-import'));
    assert.equal(o.bootstrapAssets.length, 1);
    assert.equal(o.bootstrapAssets[0]!.sourceSha256, webpMetadataBabelSha256);
  }
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:webp-metadata')
    ? `${subject.id} lacks wa-internal:webp-metadata`
    : false;
if (reason) test.skip(`WebP metadata suite skipped: ${reason}`, () => {});
function check(c: BehaviorCase, result: CaseResult) {
  assertCaseObservations(c, result);
  assert.deepEqual(result.gateObservations || [], []);
  assert.equal(result.bootstrapAssets?.length, 1);
  assert.equal(result.bootstrapExecutions?.length, 1);
  const asset = result.bootstrapAssets![0]!,
    o = metadata.observations.find((o) => asset.origin.revisionId === `whatsapp-${o.revision}`);
  assert.ok(o);
  assert.deepEqual(asset, o.bootstrapAssets[0]);
  const { environment, ...event } = result.bootstrapExecutions![0]!;
  assert.deepEqual(environment, {
    globalAlias: 'bootstrap-only-realm-globalThis',
    namespace: 'guarded-original-mutable-target',
  });
  assert.deepEqual(event, { ...asset, executed: true, beforeModuleDefinitions: true });
  const actual = result as CaseResult & {
    gateInventory?: { digest: string; roots: string[]; gates: unknown[]; unresolved: unknown[] };
  };
  assert.ok(actual.gateInventory);
  assert.equal(actual.gateInventory.digest, o.inventoryDigest);
  assert.deepEqual(actual.gateInventory.roots, ['@bootstrap/babel-helpers', c.module].sort());
  assert.deepEqual(actual.gateInventory.gates, []);
  assert.deepEqual(actual.gateInventory.unresolved, o.unresolved);
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
