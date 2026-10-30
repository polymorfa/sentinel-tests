import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import type { BehaviorCase, CaseMetadata } from './types.ts';
import { validateProbeControls } from './probe-controls.ts';

const root = new URL('../', import.meta.url);
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export interface FixtureEntry {
  file: string;
  testCase: BehaviorCase;
  metadata: CaseMetadata;
  sha256: string;
}
export async function validateFixtures(): Promise<FixtureEntry[]> {
  const metadata: unknown = JSON.parse(
    await readFile(new URL('metadata/cases.json', root), 'utf8'),
  );
  const schema = JSON.parse(await readFile(new URL('schemas/case.schema.json', root), 'utf8')) as {
    required: string[];
    properties: Record<string, unknown>;
  };
  assert.ok(record(metadata) && metadata.schemaVersion === 1 && Array.isArray(metadata.cases));
  const files = (await readdir(new URL('fixtures/', root)))
    .filter((file) => file.endsWith('.case.json'))
    .sort();
  const identities = new Set<string>(),
    entries: FixtureEntry[] = [];
  for (const filename of files) {
    const bytes = await readFile(new URL(`fixtures/${filename}`, root));
    assert.ok(bytes.length < 256 * 1024, `${filename}: fixture exceeds limit`);
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    assert.ok(record(value));
    for (const key of schema.required)
      assert.ok(Object.hasOwn(value, key), `${filename}: missing ${key}`);
    for (const key of Object.keys(value))
      assert.ok(Object.hasOwn(schema.properties, key), `${filename}: unknown field ${key}`);
    assert.equal(value.schemaVersion, 1);
    assert.ok(typeof value.id === 'string' && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(value.id));
    assert.ok(Number.isSafeInteger(value.version) && Number(value.version) > 0);
    const identity = `${value.id}@${value.version}`;
    assert.ok(!identities.has(identity));
    identities.add(identity);
    for (const key of ['title', 'module', 'export'])
      assert.ok(
        typeof value[key] === 'string' && value[key].length > 0 && value[key].length <= 256,
      );
    assert.ok(record(value.context));
    assert.ok(
      typeof value.context.clock === 'string' && Number.isFinite(Date.parse(value.context.clock)),
    );
    assert.ok(typeof value.context.timezone === 'string');
    new Intl.DateTimeFormat('en', { timeZone: value.context.timezone }).format(0);
    assert.ok(
      Number.isInteger(value.context.randomSeed) &&
        Number(value.context.randomSeed) >= 0 &&
        Number(value.context.randomSeed) <= 0xffffffff,
    );
    assert.ok(record(value.context.gates));
    if (value.context.babelHelpers !== undefined)
      assert.ok(
        Array.isArray(value.context.babelHelpers) &&
          value.context.babelHelpers.length <= 2 &&
          value.context.babelHelpers.every((helper) =>
            ['extends', 'taggedTemplateLiteralLoose'].includes(String(helper)),
          ) &&
          new Set(value.context.babelHelpers).size === value.context.babelHelpers.length,
      );
    validateProbeControls(value);
    const candidates: unknown[] = (metadata.cases as unknown[]).filter(
      (entry: unknown) => record(entry) && entry.id === value.id && entry.version === value.version,
    );
    assert.equal(candidates.length, 1, `${identity}: metadata missing/duplicated`);
    const info = candidates[0];
    assert.ok(record(info));
    assert.equal(info.file, `fixtures/${filename}`);
    assert.equal(info.sourceModule, value.module);
    assert.ok(
      typeof info.coverage === 'string' &&
        info.coverage.length > 0 &&
        Array.isArray(info.notCovered) &&
        info.notCovered.length > 0,
    );
    entries.push({
      file: `fixtures/${filename}`,
      testCase: value as unknown as BehaviorCase,
      metadata: info as unknown as CaseMetadata,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  assert.equal(metadata.cases.length, entries.length, 'Metadata includes missing fixtures');
  return entries;
}
