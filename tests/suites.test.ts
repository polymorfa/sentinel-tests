import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSuiteMetadata, validateSuites } from '../support/suites.ts';

test('executable suites name actual files, exact source pins and honest gate boundaries', async () => {
  const suites = await validateSuites();
  assert.ok(suites.length > 0);
  for (const suite of suites) {
    assert.ok(suite.observations.every((item) => item.modules.length > 0));
    assert.ok(suite.exclusions.length > 0);
  }
});

test('suite metadata rejects escaping paths, missing pins, duplicate revisions and false completeness', async () => {
  const [suite] = await validateSuites();
  assert.ok(suite);
  const modify = (change: (value: typeof suite) => void) => {
    const value = structuredClone(suite);
    change(value);
    return value;
  };
  const invalid = [
    modify((value) => {
      value.file = '../private/test.ts';
    }),
    modify((value) => {
      value.observations[0]!.modules[0]!.printedSourceSha256 = 'missing';
    }),
    modify((value) => {
      value.observations.push(value.observations[0]!);
    }),
    modify((value) => {
      value.observations[0]!.unresolved = [{ code: 'unknown' }];
      value.observations[0]!.staticCoverage.complete = true;
    }),
    modify((value) => {
      value.observations[0]!.modules[0]!.module = '../private';
    }),
    modify((value) => {
      value.observations[0]!.modules[0]!.citations = [];
    }),
  ];
  for (const value of invalid) assert.throws(() => validateSuiteMetadata(value));
});
