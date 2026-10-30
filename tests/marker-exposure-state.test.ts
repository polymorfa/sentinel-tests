import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { markerExposureStateCases } from '../support/marker-exposure-state-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { validateSuiteMetadata } from '../support/suites.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, CaseResult, JsonValue } from '../support/types.ts';
import metadata from '../metadata/suites/marker-exposure-state.json';
const cases = markerExposureStateCases();
const noFunctions = (value: JsonValue): boolean =>
  value === null ||
  typeof value !== 'object' ||
  (Array.isArray(value)
    ? value.every(noFunctions)
    : value.$type !== 'function' && Object.values(value).every(noFunctions));
test('marker exposure plans observe direct queue effects without carriers, callbacks or provider fixtures', () => {
  validateSuiteMetadata(metadata);
  assert.deepEqual(markerExposureStateCases(), cases);
  assert.equal(cases.length, 13);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    133,
  );
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    metadata.trials.probesPerRevision,
  );
  assert.deepEqual(metadata.roots, ['replaceTransportMarkers', 'BanzaiLazyQueue']);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  for (const item of cases) {
    validateProbeControls(item);
    assert.equal(item.module, 'replaceTransportMarkers');
    assert.equal(item.export, '$module');
    assert.deepEqual(item.context, { gates: {} });
    assert.equal(item.stubs, undefined);
    assert.equal(item.construct, undefined);
    assert.ok(item.probes.length <= 96);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    assert.ok(item.probes.some((probe) => probe.module === 'BanzaiLazyQueue'));
    for (const probe of item.probes) {
      assert.ok(probe.args.every(noFunctions));
      assert.equal(probe.method, undefined);
      assert.equal(probe.construct, undefined);
      assert.equal(probe.result, undefined);
      assert.equal(probe.retain, undefined);
      assert.equal(probe.pending, undefined);
      assert.equal(probe.clock, undefined);
      if (probe.module) {
        assert.equal(probe.module, 'BanzaiLazyQueue');
        assert.equal(probe.export, 'flushQueue');
        assert.deepEqual(probe.args, []);
      } else {
        assert.equal(probe.export, undefined);
        assert.equal(probe.args.length, 2);
        if (!probe.throws) assert.deepEqual(probe.expected, { $type: 'undefined' });
      }
    }
  }
  const partial = cases.find(
    (item) => item.id === 'marker-exposure-state-partial-committed-event-and-retry-v1',
  )!;
  assert.deepEqual(partial.probes[0]!.throws, { name: 'TypeError' });
  assert.deepEqual(partial.probes[1]!.expected, [
    ['require_cond_exposure_logging', { identifier: 'kept' }, { $type: 'undefined' }],
  ]);
  assert.deepEqual(partial.probes[3]!.expected, []);
  for (const observation of metadata.observations) {
    assert.equal(observation.staticCoverage.complete, false);
    assert.equal(observation.staticCoverage.workBudget.exhausted, false);
    assert.deepEqual(observation.gates, []);
    assert.ok(
      observation.unresolved.some(
        (issue) =>
          (issue as { code: string; module?: string }).code === 'missing-module' &&
          (issue as { module?: string }).module === 'cr:6640',
      ),
    );
  }
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-internal:marker-exposure-state')
    ? `${subject.id} lacks wa-internal:marker-exposure-state`
    : false;
if (reason) test.skip(`Marker exposure suite skipped: ${reason}`, () => {});
type InventoriedResult = CaseResult & {
  sources?: { name: string; variant: string; sourceSha256: string; revisionId?: string }[];
  gateInventory?: {
    roots: string[];
    digest: string;
    analyzer: unknown;
    modules: unknown[];
    gates: unknown[];
    unresolved: unknown[];
    coverage: unknown;
    boundaries: unknown[];
  };
  gateReads?: unknown[];
};
function check(item: BehaviorCase, result: CaseResult) {
  assertCaseObservations(item, result);
  const observed = result as InventoriedResult;
  assert.ok(Array.isArray(observed.sources), 'Actual source identities are required');
  const rootSource = observed.sources.find((source) => source.name === item.module);
  assert.ok(rootSource, 'The original marker source must be admitted');
  const observation =
    rootSource.revisionId !== undefined
      ? metadata.observations.find(
          (entry) => rootSource.revisionId === `whatsapp-${entry.revision}`,
        )
      : metadata.observations.find((entry) =>
          entry.modules.every((expected) =>
            observed.sources!.some(
              (source) =>
                source.name === expected.module &&
                source.variant === expected.variant &&
                source.sourceSha256 === expected.printedSourceSha256,
            ),
          ),
        );
  assert.ok(observation, 'Actual revision/source pins must match a metadata observation');
  for (const expected of observation.modules)
    assert.ok(
      observed.sources.some(
        (source) =>
          source.name === expected.module &&
          source.variant === expected.variant &&
          source.sourceSha256 === expected.printedSourceSha256,
      ),
      `Missing pinned reachable source: ${expected.module}`,
    );
  const inventory = observed.gateInventory;
  assert.ok(inventory, 'Actual full dependency inventory is required');
  assert.deepEqual(inventory.roots, [...metadata.roots].sort());
  assert.equal(inventory.digest, observation.inventoryDigest);
  assert.deepEqual(inventory.analyzer, observation.analyzer);
  assert.deepEqual(
    inventory.modules,
    observation.modules.map((source) => ({
      name: source.module,
      variant: source.variant,
      sourceSha256: source.printedSourceSha256,
      dependencies: source.dependencies,
    })),
  );
  assert.deepEqual(inventory.gates, observation.gates);
  assert.deepEqual(inventory.unresolved, observation.unresolved);
  assert.deepEqual(inventory.coverage, observation.staticCoverage);
  assert.deepEqual(inventory.boundaries, []);
  assert.deepEqual(observed.gateReads, []);
  assert.deepEqual(result.gateObservations, []);
  assert.deepEqual(result.clockUpdates, []);
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
