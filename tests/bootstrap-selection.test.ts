import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateProbeControls } from '../support/probe-controls.ts';
import {
  validateSuiteMetadata,
  validateSuites,
  type SuiteBootstrapAsset,
} from '../support/suites.ts';

const selectionCase = (bootstrap: unknown) => ({
  module: 'Example',
  export: 'value',
  context: { bootstrap },
  probes: [{ id: 'one', args: [], expected: 1 }],
});
const asset = (
  revision: string,
  kind: SuiteBootstrapAsset['kind'] = 'fb-enumerate',
): SuiteBootstrapAsset => ({
  kind,
  sourceSha256: 'a'.repeat(64),
  origin: {
    revisionId: `whatsapp-${revision}`,
    rawSha256: 'b'.repeat(64),
    startByte: 100,
    endByte: 900,
    rawBytes: 1000,
  },
});

test('bootstrap context selects only known kinds by exact source hash and never accepts paths or code', async () => {
  for (const bootstrap of [
    {},
    { 'fb-enumerate': 'a'.repeat(64) },
    { 'babel-helpers': 'b'.repeat(64), 'fb-enumerate': 'a'.repeat(64) },
  ])
    assert.doesNotThrow(() => validateProbeControls(selectionCase(bootstrap)));
  for (const bootstrap of [
    null,
    [],
    'fb-enumerate',
    { other: 'a'.repeat(64) },
    { 'fb-enumerate': '../private.js' },
    { 'fb-enumerate': 'https://example.invalid/source.js' },
    { 'fb-enumerate': 'A'.repeat(64) },
    { 'fb-enumerate': 'a'.repeat(63) },
    { 'fb-enumerate': { source: 'code' } },
  ])
    assert.throws(() => validateProbeControls(selectionCase(bootstrap)));
  const schema = JSON.parse(
    await readFile(new URL('../schemas/case.schema.json', import.meta.url), 'utf8'),
  );
  assert.equal(schema.properties.context.properties.bootstrap.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties.context.properties.bootstrap.properties).sort(), [
    'babel-helpers',
    'fb-enumerate',
  ]);
});

test('optional bootstrap metadata retains source and raw-parent identity without enrolling executable code', async () => {
  const [source] = await validateSuites();
  const suite = structuredClone(source!);
  suite.requiresBootstrapKinds = ['fb-enumerate'];
  for (const observation of suite.observations)
    observation.bootstrapAssets = [asset(observation.revision)];
  const admitted = validateSuiteMetadata(suite);
  assert.deepEqual(
    admitted.observations[0]!.bootstrapAssets,
    suite.observations[0]!.bootstrapAssets,
  );
  assert.deepEqual(admitted.requiresBootstrapKinds, ['fb-enumerate']);
});

test('bootstrap metadata rejects mismatched revision, duplicate kind, byte escape and private source fields', async () => {
  const [source] = await validateSuites();
  for (const change of [
    (value: SuiteBootstrapAsset) => {
      value.origin.revisionId = 'whatsapp-9999999999';
    },
    (value: SuiteBootstrapAsset) => {
      value.origin.rawSha256 = '../private';
    },
    (value: SuiteBootstrapAsset) => {
      value.sourceSha256 = 'missing';
    },
    (value: SuiteBootstrapAsset) => {
      value.origin.startByte = -1;
    },
    (value: SuiteBootstrapAsset) => {
      value.origin.endByte = value.origin.startByte;
    },
    (value: SuiteBootstrapAsset) => {
      value.origin.endByte = value.origin.rawBytes + 1;
    },
    (value: SuiteBootstrapAsset) => {
      value.origin.rawBytes = 4 * 1024 * 1024 + 1;
    },
    (value: SuiteBootstrapAsset) => {
      value.origin.startByte = 1.5;
    },
    (value: SuiteBootstrapAsset) => {
      Object.assign(value, { source: 'unpublished code' });
    },
    (value: SuiteBootstrapAsset) => {
      Object.assign(value.origin, { path: '/private/source.js' });
    },
    (value: SuiteBootstrapAsset) => {
      Object.assign(value, { kind: 'unknown' });
    },
  ]) {
    const suite = structuredClone(source!);
    const observation = suite.observations[0]!;
    const declared = asset(observation.revision);
    change(declared);
    observation.bootstrapAssets = [declared];
    assert.throws(() => validateSuiteMetadata(suite));
  }
  const duplicate = structuredClone(source!);
  duplicate.observations[0]!.bootstrapAssets = [
    asset(duplicate.observations[0]!.revision),
    asset(duplicate.observations[0]!.revision),
  ];
  assert.throws(() => validateSuiteMetadata(duplicate));
  for (const required of [['fb-enumerate'], ['unknown'], ['fb-enumerate', 'fb-enumerate']]) {
    const suite = structuredClone(source!);
    Object.assign(suite, { requiresBootstrapKinds: required });
    assert.throws(() => validateSuiteMetadata(suite));
  }
});
