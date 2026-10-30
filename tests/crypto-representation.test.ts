import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { loadSubject, assertCaseObservations } from '../support/subject.ts';
import {
  paddingProbes,
  littleEndianProbes,
  fixedWidthProbes,
  hexProbes,
} from '../support/crypto-representation-cases.ts';
import type { BehaviorCase, CaseComparison, Probe } from '../support/types.ts';

const capability = 'wa-internal:crypto-representation';
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const skip = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes(capability)
    ? `${subject.id} lacks ${capability}`
    : false;
if (skip) test.skip(`Crypto representation suite skipped: ${skip}`, () => {});

async function exercise(module: string, exported: string, probes: Probe[]) {
  assert.ok(subject);
  for (let offset = 0; offset < probes.length; offset += 100) {
    const testCase: BehaviorCase = {
      schemaVersion: 1,
      id: `crypto-representation-${exported}-${offset}`,
      version: 1,
      module,
      export: exported,
      probes: probes.slice(offset, offset + 100),
    };
    if (subject.compareCase) {
      const pair: CaseComparison = await subject.compareCase(testCase);
      assertCaseObservations(testCase, pair.baseline);
      assert.ok(pair.candidate, 'Candidate observations required');
      assertCaseObservations(testCase, pair.candidate);
      assert.equal(pair.status, 'unchanged');
    } else assertCaseObservations(testCase, await subject.runCase(testCase));
  }
}

describe('Crypto byte representation characterization', { skip }, () => {
  test(
    'unpad checks the final byte rather than strict PKCS#7 validation',
    { timeout: 30000 },
    async () => {
      await exercise('WACryptoPkcs7', 'unpadPkcs7', paddingProbes());
    },
  );
  test('little-endian decoding honors byte views and arbitrary byte lengths', async () => {
    await exercise('WACryptoCurveEncoding', 'bytesToBigIntLE', littleEndianProbes());
  });
  test('32-byte encoding preserves the low 256 bits of signed and oversized integers', async () => {
    await exercise('WACryptoCurveEncoding', 'bigIntTo32LE', fixedWidthProbes());
  });
  test('hex byte parsing and malformed prefixes retain the source behavior', async () => {
    await exercise('WACryptoCurveEncoding', 'hexToU8', hexProbes());
  });
});
