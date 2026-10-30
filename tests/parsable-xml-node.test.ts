import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parsableXmlNodeCases } from '../support/parsable-xml-node-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/suites/parsable-xml-node.json';
const cases = parsableXmlNodeCases();
test('XML parser plans preserve literal failures, bounded integer oracles and real cached-child flows', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(parsableXmlNodeCases(), cases);
  assert.equal(
    createHash('sha256')
      .update(JSON.stringify(cases, null, 2) + '\n')
      .digest('hex'),
    '814a5345c01e74f8bf6343ab969a12f26ca44de69e2183aa45e75c1d34005289',
  );
  assert.equal(cases.length, 30);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((n, c) => n + c.probes.length, 0),
    432,
  );
  assert.equal(metadata.trials.probesPerRevision, 432);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const item of cases) {
    validateProbeControls(item);
    assert.equal(item.module, 'WAParsableXmlNode');
    assert.equal(item.export, 'ParsableXmlNode');
    assert.equal(item.construct?.args[0], 'parser');
    assert.equal(item.context, undefined);
    assert.equal(item.stubs, undefined);
    assert.ok(item.probes.length <= 64);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    for (const p of item.probes) {
      assert.ok(p.method);
      assert.ok(!p.method.startsWith('$'));
      for (const key of ['module', 'export', 'construct', 'pending', 'clock'] as const)
        assert.equal(p[key], undefined);
      if (p.result?.method !== undefined)
        assert.ok(
          ['tag', 'attrString', 'includes', 'unsafeSetNodeContent', 'contentString'].includes(
            p.result.method,
          ),
        );
      if (p.throws) {
        assert.equal(p.throws.name, 'Error');
        assert.ok(
          p.throws.message?.startsWith('XmlParsingFailure: parser: expected <root> ') ||
            p.throws.message?.startsWith('decodeAsString: attribute is '),
        );
      }
    }
  }
  const ints = cases.find((c) => c.id.includes('decimal-prefix-integers'))!.probes;
  assert.equal(ints.find((p) => p.id === 'required-3')!.expected, 17);
  assert.equal(ints.find((p) => p.id === 'required-4')!.expected, 0);
  const binary = cases.filter((c) => c.id.includes('binary-content'));
  assert.equal(binary.length, 4);
  for (const item of binary) {
    assert.equal(item.probes.length, 38);
    for (let sample = 0; sample < 12; sample++) {
      const typed = item.probes[sample * 3]!.args[0] as { value: number[] };
      const expected = Number(typed.value.reduce((sum, b) => sum * 256n + BigInt(b), 0n));
      assert.equal(item.probes[sample * 3 + 2]!.expected, expected);
    }
  }
  const cache = cases.find((c) => c.id.includes('cached-children-and-unsafe-state'))!.probes;
  assert.deepEqual(cache.find((p) => p.id === 'cached-array-membership')!.result, {
    method: 'includes',
    args: [{ $type: 'reference', value: 'first' }],
  });
  assert.deepEqual(cache.find((p) => p.id === 'restore-actual-cache')!.args, [
    { $type: 'reference', value: 'children' },
  ]);
  assert.equal(cache.find((p) => p.id === 'cache-not-rebuilt')!.expected, true);
  assert.deepEqual(cache.find((p) => p.id === 'first-duplicate-id')!.result, {
    method: 'attrString',
    args: ['id'],
  });
  assert.equal(cache.find((p) => p.id === 'first-duplicate-id')!.expected, 'first');
  assert.deepEqual(
    cases
      .filter((c) => c.id.includes('generated-child-cache'))
      .map((c) => (c.construct!.args[1] as { content: unknown[] }).content.length),
    [0, 1, 2, 7, 16, 31],
  );
  for (const o of metadata.observations) {
    assert.equal(o.modules.length, 8);
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
  : !subject.capabilities?.includes('wa-internal:parsable-xml-node')
    ? `${subject.id} lacks wa-internal:parsable-xml-node`
    : false;
if (reason) test.skip(`Parsable XML node suite skipped: ${reason}`, () => {});
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
