import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { loadSubject, assertCaseObservations } from '../support/subject.ts';
import { parserProbes, exposureProbes } from '../support/abprops-cases.ts';
import type { BehaviorCase, CaseComparison, Probe } from '../support/types.ts';

const capability = 'wa-internal:abprops-leaves';
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const skip = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes(capability)
    ? `${subject.id} lacks ${capability}`
    : false;

if (skip) test.skip(`ABProps suite skipped: ${skip}`, () => {});

async function exercise(module: string, exported: string, probes: Probe[]) {
  assert.ok(subject);
  for (let offset = 0; offset < probes.length; offset += 100) {
    const testCase: BehaviorCase = {
      schemaVersion: 1,
      id: `abprops-${exported}-${offset}`,
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

describe('ABProps parser and exposure key leaves', { skip }, () => {
  test('typed parsing, nullish defaults, malformed coercion and bounded decimal domain', async () => {
    await exercise('WAWebABPropsParseConfigValue', 'parseConfigValue', parserProbes());
  });
  test('exposure key order, duplicates, iteration and coercion', async () => {
    await exercise('WAWebABPropsExpoKeyUtils', 'combineExposuresIntoExpoKey', exposureProbes());
  });
});
