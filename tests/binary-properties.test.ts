import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSubject, assertCaseObservations } from '../support/subject.ts';
import type { BehaviorCase, Probe, CaseComparison } from '../support/types.ts';

const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const seed = 0x5e171e1;
if (!subject)
  test.skip('UTF-8 property suite requires an explicit SENTINEL_SUBJECT_MODULE', () => {});
else if (!subject.capabilities?.includes('wa-internal:binary-utf8'))
  test.skip(`UTF-8 property suite unsupported: ${subject.id} lacks wa-internal:binary-utf8`, () => {});

function generatedStrings(count: number): string[] {
  let state = seed;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const strings: string[] = [];
  for (let at = 0; at < count; at++) {
    const length = next() % 97;
    let value = '';
    for (let unit = 0; unit < length; unit++) value += String.fromCharCode(next() & 0xffff);
    strings.push(value);
  }
  return strings;
}

describe(
  'UTF-8 generated inputs and odd size boundaries',
  {
    skip: !subject
      ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
      : !subject.capabilities?.includes('wa-internal:binary-utf8')
        ? `${subject.id} lacks wa-internal:binary-utf8`
        : false,
  },
  () => {
    test('2,048 seeded Unicode strings match the independent TextEncoder oracle', async () => {
      assert.ok(subject);
      const values = generatedStrings(2048);
      const encoder = new TextEncoder();
      for (let offset = 0; offset < values.length; offset += 128) {
        const probes: Probe[] = values.slice(offset, offset + 128).map((value, index) => ({
          id: `seed-${seed}-input-${offset + index}`,
          args: [value],
          expected: encoder.encode(value).byteLength,
        }));
        const testCase: BehaviorCase = {
          schemaVersion: 1,
          id: `utf8-seed-${seed}-batch-${offset}`,
          version: 1,
          module: 'WABinary',
          export: 'numUtf8Bytes',
          probes,
        };
        const result = await subject.runCase(testCase);
        assertCaseObservations(testCase, result);
        if (subject.compareCase) {
          const pair: CaseComparison = await subject.compareCase(testCase);
          assert.equal(
            pair.status,
            'unchanged',
            `Unicode batch ${offset}; preserve this seed and failing input`,
          );
        }
      }
    });

    test('odd lengths and allocation boundaries through 65,537 bytes remain exact', async () => {
      assert.ok(subject);
      for (const length of [
        0, 1, 3, 7, 15, 31, 63, 127, 255, 257, 511, 513, 1023, 1025, 4095, 4097, 16383, 16385,
        65535, 65537,
      ]) {
        const testCase: BehaviorCase = {
          schemaVersion: 1,
          id: `utf8-odd-${length}`,
          version: 1,
          module: 'WABinary',
          export: 'numUtf8Bytes',
          probes: [{ id: 'length', args: ['x'.repeat(length)], expected: length }],
        };
        const result = await subject.runCase(testCase);
        assertCaseObservations(testCase, result);
      }
    });
  },
);
