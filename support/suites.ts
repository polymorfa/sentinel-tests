import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import type { BootstrapKind, BootstrapAssetIdentity } from './types.ts';
export type { BootstrapKind } from './types.ts';

export interface SuiteSource {
  module: string;
  variant: string;
  printedSourceSha256: string;
  dependencies: string[];
  citations: string[];
}
export type SuiteBootstrapAsset = BootstrapAssetIdentity;
export interface SuiteObservation {
  revision: string;
  bootstrapAssets?: SuiteBootstrapAsset[];
  modules: SuiteSource[];
  analyzer: { version: number; sourceSha256: string };
  inventoryDigest: string;
  gates: unknown[];
  unresolved: unknown[];
  staticCoverage: { complete: boolean; semanticProof: false; resolverCoverage: false };
}
export interface SuiteMetadata {
  schemaVersion: 1;
  id: string;
  version: number;
  title: string;
  file: string;
  capability: string;
  requiresBootstrapKinds?: BootstrapKind[];
  roots: string[];
  oracle: string;
  trials: Record<string, unknown>;
  observations: SuiteObservation[];
  exclusions: string[];
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const label = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 256 &&
  ![...value].some((character) => character.charCodeAt(0) < 32);
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const moduleName = (value: unknown): value is string => label(value) && /^[\w$:.@-]+$/.test(value);

/** Metadata validates coverage claims; it never executes a suite or downloads source. */
export function validateSuiteMetadata(value: unknown): SuiteMetadata {
  assert.ok(record(value), 'Suite metadata must be an object');
  assert.equal(value.schemaVersion, 1);
  assert.ok(typeof value.id === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(value.id));
  assert.ok(Number.isSafeInteger(value.version) && Number(value.version) > 0);
  assert.ok(label(value.title) && label(value.capability));
  assert.ok(
    typeof value.file === 'string' && /^tests\/[a-z0-9-]+\.test\.ts$/.test(value.file),
    'Suite file must be a repository test',
  );
  assert.ok(
    typeof value.oracle === 'string' && value.oracle.length > 0 && value.oracle.length <= 10000,
  );
  assert.ok(record(value.trials));
  assert.ok(Array.isArray(value.roots) && value.roots.length > 0 && value.roots.every(moduleName));
  assert.equal(new Set(value.roots).size, value.roots.length);
  assert.ok(
    Array.isArray(value.exclusions) &&
      value.exclusions.length > 0 &&
      value.exclusions.every((item) => typeof item === 'string' && item.length > 0),
  );
  if (value.requiresBootstrapKinds !== undefined)
    assert.ok(
      Array.isArray(value.requiresBootstrapKinds) &&
        value.requiresBootstrapKinds.length > 0 &&
        value.requiresBootstrapKinds.length <= 2 &&
        value.requiresBootstrapKinds.every(
          (kind) => typeof kind === 'string' && ['babel-helpers', 'fb-enumerate'].includes(kind),
        ) &&
        new Set(value.requiresBootstrapKinds).size === value.requiresBootstrapKinds.length,
      'Bootstrap requirements must name distinct known kinds',
    );
  assert.ok(Array.isArray(value.observations) && value.observations.length > 0);
  const revisions = new Set<string>();
  for (const observation of value.observations) {
    assert.ok(record(observation));
    assert.ok(typeof observation.revision === 'string' && /^\d{6,15}$/.test(observation.revision));
    assert.ok(!revisions.has(observation.revision), 'Duplicate revision observation');
    revisions.add(observation.revision);
    const bootstrapKinds = new Set<string>();
    if (observation.bootstrapAssets !== undefined) {
      assert.ok(
        Array.isArray(observation.bootstrapAssets) && observation.bootstrapAssets.length <= 2,
      );
      for (const asset of observation.bootstrapAssets) {
        assert.ok(
          record(asset) &&
            typeof asset.kind === 'string' &&
            ['babel-helpers', 'fb-enumerate'].includes(asset.kind) &&
            hash(asset.sourceSha256) &&
            Object.keys(asset).every((key) => ['kind', 'sourceSha256', 'origin'].includes(key)) &&
            !bootstrapKinds.has(asset.kind),
          'Invalid or duplicate bootstrap asset',
        );
        bootstrapKinds.add(asset.kind);
        const origin = asset.origin;
        assert.ok(
          record(origin) &&
            origin.revisionId === `whatsapp-${observation.revision}` &&
            hash(origin.rawSha256) &&
            Object.keys(origin).every((key) =>
              ['revisionId', 'rawSha256', 'startByte', 'endByte', 'rawBytes'].includes(key),
            ) &&
            Number.isSafeInteger(origin.rawBytes) &&
            Number(origin.rawBytes) > 0 &&
            Number(origin.rawBytes) <= 4 * 1024 * 1024 &&
            Number.isSafeInteger(origin.startByte) &&
            Number(origin.startByte) >= 0 &&
            Number.isSafeInteger(origin.endByte) &&
            Number(origin.endByte) > Number(origin.startByte) &&
            Number(origin.endByte) <= Number(origin.rawBytes),
          'Invalid bootstrap origin',
        );
      }
    }
    if (Array.isArray(value.requiresBootstrapKinds))
      value.requiresBootstrapKinds.forEach((requiredKind: string) =>
        assert.ok(
          bootstrapKinds.has(requiredKind),
          'Required bootstrap asset missing from revision observation',
        ),
      );
    assert.ok(hash(observation.inventoryDigest));
    assert.ok(
      record(observation.analyzer) &&
        Number.isSafeInteger(observation.analyzer.version) &&
        hash(observation.analyzer.sourceSha256),
    );
    assert.ok(Array.isArray(observation.gates) && Array.isArray(observation.unresolved));
    assert.ok(
      record(observation.staticCoverage) &&
        typeof observation.staticCoverage.complete === 'boolean',
    );
    assert.equal(observation.staticCoverage.semanticProof, false);
    assert.equal(observation.staticCoverage.resolverCoverage, false);
    if (observation.unresolved.length)
      assert.equal(
        observation.staticCoverage.complete,
        false,
        'Unresolved inventory cannot claim completeness',
      );
    assert.ok(
      Array.isArray(observation.modules) &&
        observation.modules.length > 0 &&
        observation.modules.length <= 10000,
    );
    const names = new Set<string>();
    for (const source of observation.modules) {
      assert.ok(record(source) && moduleName(source.module) && label(source.variant));
      assert.ok(!names.has(source.module), 'Duplicate selected module');
      names.add(source.module);
      assert.ok(hash(source.printedSourceSha256));
      assert.ok(Array.isArray(source.dependencies) && source.dependencies.every(moduleName));
      assert.ok(
        Array.isArray(source.citations) &&
          source.citations.length > 0 &&
          source.citations.every(
            (citation) =>
              typeof citation === 'string' && /^modules\/[^/\\]+\.js:\d+(?:-\d+)?$/.test(citation),
          ),
        'Source requires line citations',
      );
    }
    (value.roots as string[]).forEach((name: string) =>
      assert.ok(names.has(name), `Missing source root: ${name}`),
    );
  }
  return value as unknown as SuiteMetadata;
}

export async function validateSuites(): Promise<SuiteMetadata[]> {
  const directory = new URL('../metadata/suites/', import.meta.url);
  const files = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const suites: SuiteMetadata[] = [];
  const ids = new Set<string>();
  for (const entry of files) {
    assert.ok(
      entry.isFile() && /^[a-z0-9-]+\.json$/.test(entry.name),
      'Suite metadata must be a regular JSON file',
    );
    const bytes = await readFile(new URL(entry.name, directory));
    assert.ok(bytes.byteLength <= 2000000, 'Suite metadata exceeds its limit');
    const suite = validateSuiteMetadata(JSON.parse(bytes.toString('utf8')));
    assert.ok(!ids.has(suite.id), 'Duplicate suite identity');
    ids.add(suite.id);
    await readFile(new URL(`../${suite.file}`, import.meta.url));
    suites.push(suite);
  }
  return suites;
}
