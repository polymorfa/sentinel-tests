import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wwebjsReactionCases,
  wwebjsReactionCommit,
  wwebjsReactionModule,
} from '../support/wwebjs-reaction-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult } from '../support/types.ts';
import metadata from '../metadata/library-suites/wwebjs-reaction.json';
const cases = wwebjsReactionCases();
type StateResult = CaseResult & {
  caseId?: string;
  caseVersion?: number;
  sourceAdmission?: unknown;
  sources?: unknown[];
  digests?: { sources?: string; runtimeSource?: string };
  gateInventory?: {
    digest?: string;
    analyzer?: unknown;
    roots?: string[];
    modules?: unknown[];
    gates?: unknown[];
    unresolved?: unknown[];
    coverage?: { complete?: boolean; modules?: number };
  };
};
function check(item: BehaviorCase, observation: CaseResult) {
  assertCaseObservations(item, observation);
  const result = observation as StateResult;
  assert.equal(result.caseId, item.id);
  assert.equal(result.caseVersion, item.version);
  assert.deepEqual(
    result.probes!.map((probe) => probe.id),
    item.probes.map((probe) => probe.id),
  );
  assert.deepEqual(result.sourceAdmission, metadata.sourceAdmission);
  assert.deepEqual(result.sources, metadata.sourceAdmission.modules);
  assert.equal(result.digests?.sources, metadata.sourceIdentitySetSha256);
  assert.match(result.digests?.runtimeSource || '', /^[a-f0-9]{64}$/);
  const inventory = item.probes.some((probe) => probe.module === './Base')
    ? metadata.staticInventories.qualifiedBase
    : metadata.staticInventories.reaction;
  assert.equal(result.gateInventory?.digest, inventory.digest);
  assert.deepEqual(result.gateInventory?.analyzer, inventory.analyzer);
  assert.deepEqual(result.gateInventory?.roots, inventory.roots);
  assert.deepEqual(result.gateInventory?.modules, inventory.modules);
  assert.deepEqual(result.gateInventory?.gates, []);
  assert.deepEqual(result.gateInventory?.unresolved, []);
  assert.equal(result.gateInventory?.coverage?.complete, true);
  assert.equal(result.gateInventory?.coverage?.modules, 2);
  assert.deepEqual(result.gateObservations || [], []);
  assert.equal(result.bootstrapExecutions?.length || 0, 0);
}

test('Reaction plans use only genuine state methods, constructors and bounded earlier references', () => {
  assert.deepEqual(wwebjsReactionCases(), cases);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    metadata.trials.probes,
  );
  assert.equal(Math.max(...cases.map((item) => item.probes.length)), 54);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  for (const item of cases) {
    validateProbeControls(item);
    assert.equal(item.module, wwebjsReactionModule);
    assert.equal(item.export, '$module');
    assert.equal(item.construct, undefined);
    assert.deepEqual(item.stubs, []);
    assert.deepEqual(item.context, {
      clock: '2026-10-30T00:00:00.000Z',
      timezone: 'UTC',
      randomSeed: 1,
      gates: {},
    });
    assert.ok(item.probes.length <= 96);
    assert.ok(item.probes.filter((probe) => probe.retain).length <= 128);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    for (const probe of item.probes) {
      assert.equal(probe.pending, undefined);
      assert.equal(probe.clock, undefined);
      assert.equal(probe.method, undefined);
      assert.ok([undefined, './Base'].includes(probe.module));
      if (probe.module === './Base') assert.ok(['$module', '_normalizeId'].includes(probe.export!));
      if (probe.construct) {
        assert.equal(probe.args[0], null);
        assert.ok(probe.result && 'method' in probe.result);
      }
      if (probe.result && 'method' in probe.result)
        assert.ok(['_patch', '_clone'].includes(probe.result.method!));
    }
    const stack: unknown[] = [item];
    while (stack.length) {
      const value = stack.pop();
      if (value === null || typeof value !== 'object') continue;
      assert.ok(
        !Object.keys(value).some((key) => ['constructor', 'prototype', '__proto__'].includes(key)),
      );
      assert.notEqual((value as Record<string, unknown>).$type, 'function');
      stack.push(...Object.values(value));
    }
  }
});

test('Reaction metadata pins raw unchanged bodies and both selected-root inventories separately', () => {
  assert.equal(metadata.kind, 'pinned-library-state-suite');
  assert.equal(metadata.capability, 'library:whatsapp-web-js:reaction-state');
  assert.equal(metadata.commit, wwebjsReactionCommit);
  assert.equal(metadata.repository, 'https://github.com/wwebjs/whatsapp-web.js');
  assert.equal(metadata.tree, '7ca5d2eb5b1eb7aaf729821ebfc5ed92ff45d592');
  assert.deepEqual(metadata.sourceAdmission.packaging, {
    kind: 'source-body-wrapper',
    compilerRequired: false,
    bodyUnchanged: true,
  });
  assert.deepEqual(
    metadata.sourceAdmission.originals.map((source) => source.gitBlob),
    ['a22afdf817a527e6dff4182220c8818750206af1', 'd763124303691c9e474a3ea1dfd9319e36c8e67f'],
  );
  assert.deepEqual(
    metadata.sourceAdmission.originals.map((source) => source.sha256),
    [
      '837f981a2131995d61df277baec8f5ee59a798b75a1178de846b255a949e1a7c',
      'a8a2922a85b73e2c10dbac649cb5d7773f499b1e0b7334a8f8161f41a171a604',
    ],
  );
  assert.equal(metadata.sourceAdmission.files.length, 6);
  assert.equal(new Set(metadata.sourceAdmission.files.map((file) => file.path)).size, 6);
  for (const file of metadata.sourceAdmission.files) {
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0);
    assert.ok(!file.path.startsWith('/') && !file.path.split('/').includes('..'));
  }
  assert.deepEqual(
    metadata.sourceAdmission.modules.map((module) => module.name),
    ['./Base', wwebjsReactionModule],
  );
  assert.deepEqual(metadata.dependencyGraph.edges, [{ from: wwebjsReactionModule, to: './Base' }]);
  for (const inventory of Object.values(metadata.staticInventories)) {
    assert.equal(inventory.coverage.complete, true);
    assert.equal(inventory.coverage.modules, 2);
    assert.equal(inventory.coverage.workBudget.exhausted, false);
    assert.deepEqual(inventory.gates, []);
    assert.deepEqual(inventory.unresolved, []);
  }
  assert.notEqual(
    metadata.staticInventories.reaction.digest,
    metadata.staticInventories.qualifiedBase.digest,
  );
  assert.equal(metadata.sourceAdmission.registeredAdapter, false);
  assert.equal(metadata.sourceAdmission.fullPackage, false);
  assert.equal(metadata.trials.comparisonEvidence, false);
  assert.equal(Object.hasOwn(metadata, 'observations'), false);
});

test('Reaction observations cannot be replaced by a pass flag or forged source admission', () => {
  const item = cases[0]!;
  assert.throws(() => check(item, { status: 'pass' }));
  const probes = item.probes.map((probe) => ({ id: probe.id, actual: probe.expected }));
  assert.throws(() => check(item, { status: 'pass', probes }));
  const forged = {
    status: 'pass' as const,
    probes,
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
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed pinned state Subject'
  : !subject.capabilities?.includes('library:whatsapp-web-js:reaction-state')
    ? `${subject.id} lacks library:whatsapp-web-js:reaction-state`
    : false;
if (reason) test.skip(`whatsapp-web.js Reaction state skipped: ${reason}`, () => {});
for (const item of reason ? [] : cases)
  test(item.id, async () => {
    assert.ok(subject);
    check(item, await subject.runCase(item));
  });
