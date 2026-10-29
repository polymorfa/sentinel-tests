import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const metadata = JSON.parse(await readFile(new URL('metadata/cases.json', root), 'utf8'));
const schema = JSON.parse(await readFile(new URL('schemas/case.schema.json', root), 'utf8'));
assert.equal(schema.properties.schemaVersion.const, 1);
const files = (await readdir(new URL('tests/', root))).filter(f => f.endsWith('.case.json')).sort();
const identities = new Set();
const result = [];
for (const file of files) {
  const bytes = await readFile(new URL(`tests/${file}`, root));
  assert.ok(bytes.length < 256 * 1024, `${file}: case exceeds limit`);
  const c = JSON.parse(bytes);
  for (const key of schema.required) assert.ok(Object.hasOwn(c, key), `${file}: missing ${key}`);
  for (const key of Object.keys(c)) assert.ok(Object.hasOwn(schema.properties, key), `${file}: unknown field ${key}`);
  assert.equal(c.schemaVersion, 1);
  assert.match(c.id, /^[a-z0-9][a-z0-9._-]{0,127}$/);
  assert.ok(Number.isSafeInteger(c.version) && c.version > 0);
  const identity = `${c.id}@${c.version}`; assert.ok(!identities.has(identity), `Duplicate ${identity}`); identities.add(identity);
  for (const key of ['title', 'module', 'export']) assert.ok(typeof c[key] === 'string' && c[key].length > 0 && c[key].length <= 256);
  assert.ok(Number.isFinite(Date.parse(c.context.clock)));
  new Intl.DateTimeFormat('en', { timeZone: c.context.timezone }).format(0);
  assert.ok(Number.isInteger(c.context.randomSeed) && c.context.randomSeed >= 0 && c.context.randomSeed <= 0xffffffff);
  assert.ok(c.context.gates && !Array.isArray(c.context.gates));
  assert.ok(Array.isArray(c.probes) && c.probes.length > 0 && c.probes.length <= 128);
  const probeIds = new Set();
  for (const probe of c.probes) {
    assert.ok(typeof probe.id === 'string' && !probeIds.has(probe.id)); probeIds.add(probe.id);
    assert.ok(Array.isArray(probe.args));
    assert.notEqual(Object.hasOwn(probe, 'expected'), Object.hasOwn(probe, 'throws'));
  }
  const info = metadata.cases.filter(i => i.id === c.id && i.version === c.version);
  assert.equal(info.length, 1, `${identity}: metadata missing/duplicated`);
  assert.equal(info[0].file, `tests/${file}`);
  assert.equal(info[0].sourceModule, c.module);
  assert.ok(info[0].coverage && Array.isArray(info[0].notCovered) && info[0].notCovered.length > 0);
  result.push({ id: identity, sha256: createHash('sha256').update(bytes).digest('hex') });
}
assert.equal(metadata.cases.length, result.length, 'Metadata includes missing cases');
console.log(JSON.stringify({ validated: result.length, cases: result, runtimeExecution: false }, null, 2));
