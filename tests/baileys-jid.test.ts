import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  baileysJidCases,
  baileysJidCommit,
  baileysJidModule,
} from '../support/baileys-jid-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/library-suites/baileys-jid.json';

const cases = baileysJidCases();
type LibraryResult = CaseResult & {
  caseId?: string;
  caseVersion?: number;
  sourceAdmission?: unknown;
  sources?: unknown[];
  digests?: { sources?: string; runtimeSource?: string };
  gateInventory?: {
    digest?: string;
    analyzer?: unknown;
    gates?: unknown[];
    unresolved?: unknown[];
    coverage?: { complete?: boolean; modules?: number };
  };
};
function check(testCase: BehaviorCase, input: CaseResult) {
  assertCaseObservations(testCase, input);
  const result = input as LibraryResult;
  assert.equal(result.caseId, testCase.id);
  assert.equal(result.caseVersion, testCase.version);
  assert.deepEqual(
    result.probes!.map((probe) => probe.id),
    testCase.probes.map((probe) => probe.id),
  );
  // Closed exact provenance: a pass flag or arbitrary self-described source is insufficient.
  assert.deepEqual(result.sourceAdmission, metadata.sourceAdmission);
  assert.deepEqual(result.sources, [metadata.sourceAdmission.module]);
  assert.equal(result.digests?.sources, metadata.sourceIdentitySetSha256);
  assert.match(result.digests?.runtimeSource || '', /^[a-f0-9]{64}$/);
  assert.equal(result.gateInventory?.digest, metadata.staticInventory.digest);
  assert.deepEqual(result.gateInventory?.analyzer, metadata.staticInventory.analyzer);
  assert.deepEqual(result.gateInventory?.gates, []);
  assert.deepEqual(result.gateInventory?.unresolved, []);
  assert.equal(result.gateInventory?.coverage?.complete, true);
  assert.equal(result.gateInventory?.coverage?.modules, 1);
  assert.deepEqual(result.gateObservations || [], []);
  assert.equal(result.bootstrapExecutions?.length || 0, 0);
}

test('Baileys TS plans preserve the frozen nine-case oracle and one pinned leaf namespace', () => {
  assert.deepEqual(baileysJidCases(), cases);
  assert.equal(cases.length, 9);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    286,
  );
  assert.equal(Math.max(...cases.map((item) => item.probes.length)), 90);
  assert.equal(
    createHash('sha256')
      .update(JSON.stringify(cases, null, 2) + '\n')
      .digest('hex'),
    '5b07f1084f1c38ce0b2b96a06bf5c36b32b3ffa176671b1be0977cae03ca1e82',
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, 9);
  assert.deepEqual(
    cases.map((item) => ({ id: item.id, probes: item.probes.length })),
    metadata.families,
  );
  const exports = new Set<string>();
  for (const item of cases) {
    validateProbeControls(item);
    assert.equal(item.module, baileysJidModule);
    assert.deepEqual(item.stubs, []);
    assert.deepEqual(item.context, {
      clock: '2026-10-30T00:00:00.000Z',
      timezone: 'UTC',
      randomSeed: 1,
      gates: {},
    });
    for (const probe of item.probes) {
      exports.add(probe.export || item.export);
      assert.ok(
        Object.keys(probe).every((key) =>
          ['id', 'args', 'export', 'expected', 'throws'].includes(key),
        ),
      );
    }
  }
  assert.deepEqual([...exports].sort(), [...metadata.api.functions].sort());
  assert.equal(exports.size, 16);
  assert.deepEqual(metadata.api.domainEnumMembers, [0, 1, 128, 129]);
});

test('named-library metadata binds commit, source, compiler and full one-module static scope', () => {
  assert.equal(metadata.kind, 'pinned-library-leaf-suite');
  assert.equal(metadata.capability, 'library:baileys:jid-leaf');
  assert.equal(metadata.repository, 'https://github.com/WhiskeySockets/Baileys');
  assert.equal(metadata.commit, baileysJidCommit);
  assert.equal(metadata.tree, '49fb125ed883a056cdfcaefb1b131ff25ae4dad8');
  assert.equal(
    metadata.sourceAdmission.original.gitBlob,
    'd699587973679c38285e7a94f5d3fff3236e2c37',
  );
  assert.equal(
    metadata.sourceAdmission.original.sha256,
    'a1ade1f051fc206218f2429a40f4b4da0d265f837c87a9b114d1a3205fe4a593',
  );
  assert.equal(metadata.sourceAdmission.module.name, baileysJidModule);
  assert.equal(metadata.sourceAdmission.module.revisionId, `baileys-${baileysJidCommit}`);
  assert.equal(metadata.sourceAdmission.module.variant, 'compiler-derived');
  assert.equal(
    metadata.sourceAdmission.module.sourceSha256,
    '9931f99f58011f5c9925d9d745f9ec72c11cf8b2f179d0f2450f15a5117304a6',
  );
  assert.deepEqual(metadata.sourceAdmission.compiler.compiler, { name: 'Bun', version: '1.4.4' });
  assert.deepEqual(metadata.sourceAdmission.compiler.buildOptions.plugins, []);
  assert.equal(
    metadata.sourceAdmission.compiler.outputs[0]!.sha256,
    '8e4928169bd84471fb1b947b4cf67d2278dc49b12cf40f9bbeabe2f30a9f4b40',
  );
  assert.equal(metadata.sourceAdmission.files.length, 8);
  assert.equal(new Set(metadata.sourceAdmission.files.map((file) => file.path)).size, 8);
  for (const file of metadata.sourceAdmission.files) {
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0);
    assert.ok(!file.path.startsWith('/') && !file.path.split('/').includes('..'));
  }
  assert.deepEqual(metadata.dependencyGraph.originalImports, []);
  assert.deepEqual(metadata.dependencyGraph.edges, []);
  assert.equal(metadata.dependencyGraph.modules.length, 1);
  assert.equal(metadata.staticInventory.coverage.complete, true);
  assert.equal(metadata.staticInventory.coverage.modules, 1);
  assert.equal(metadata.staticInventory.coverage.workBudget.exhausted, false);
  assert.deepEqual(metadata.staticInventory.gates, []);
  assert.deepEqual(metadata.staticInventory.unresolved, []);
  assert.equal(metadata.sourceAdmission.registeredAdapter, false);
  assert.equal(metadata.sourceAdmission.fullPackage, false);
  assert.equal(metadata.trials.comparisonEvidence, false);
  assert.equal(Object.hasOwn(metadata, 'observations'), false);
});

test('bare pass, missing observations and forged source admission cannot satisfy library assertions', () => {
  const item = cases[0]!;
  assert.throws(() => check(item, { status: 'pass' }));
  assert.throws(() => check(item, { status: 'pass', probes: [] }));
  const observed = item.probes.map((probe) => ({ id: probe.id, actual: probe.expected }));
  assert.throws(() => check(item, { status: 'pass', probes: observed }));
  const forged = {
    status: 'pass' as const,
    probes: observed,
    caseId: item.id,
    caseVersion: item.version,
    sourceAdmission: { ...metadata.sourceAdmission, commit: '0'.repeat(40) },
  };
  assert.throws(() => check(item, forged));
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed pinned library Subject'
  : !subject.capabilities?.includes('library:baileys:jid-leaf')
    ? `${subject.id} lacks library:baileys:jid-leaf`
    : false;
if (reason) test.skip(`Baileys JID leaf skipped: ${reason}`, () => {});
for (const item of reason ? [] : cases)
  test(item.id, async () => {
    assert.ok(subject);
    check(item, await subject.runCase(item));
    // One exact commit: no compareCase invocation or preservation claim.
  });
