import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSubject,
  validateSubject,
  subjectModuleUrl,
  assertCaseObservations,
} from '../support/subject.ts';
import type { BehaviorCase, CaseResult, Subject } from '../support/types.ts';

const example: BehaviorCase = {
  schemaVersion: 1,
  id: 'synthetic-value',
  version: 1,
  module: 'Synthetic',
  export: 'value',
  probes: [{ id: 'value', args: [1], expected: 2 }],
};
test('subject code loads only from an explicit local module selection', async () => {
  assert.equal(await loadSubject(''), null);
  const subject = await loadSubject(new URL('./fixtures/mock-subject.ts', import.meta.url).href);
  assert.equal(subject?.id, 'synthetic-contract-fixture');
  assert.equal((await subject!.runCase(example)).status, 'unsupported');
  await subject?.close?.();
});
test('remote or credential-bearing subject module locators are rejected', () => {
  for (const locator of [
    'https://example.com/adapter.ts',
    'data:text/javascript,x',
    ' file.ts',
    'file:///adapter.ts?token=secret',
  ])
    assert.throws(() => subjectModuleUrl(locator), TypeError);
  assert.ok(subjectModuleUrl('./adapter.ts').startsWith('file:'));
});
test('subject contracts require identity and real callable operations', () => {
  for (const candidate of [
    null,
    {},
    { id: 'x' },
    { id: 'x', runCase: 'pass' },
    { id: 'x', runCase() {}, capabilities: [1] },
  ])
    assert.throws(() => validateSubject(candidate), TypeError);
});
test('ordinary unit mocks can verify the subject contract without claiming WhatsApp behavior', async () => {
  const runCase = mock.fn(async (testCase: BehaviorCase): Promise<CaseResult> => ({
    status: 'pass',
    probes: [{ id: testCase.probes[0].id, actual: 2 }],
  }));
  const subject: Subject = { id: 'explicit-synthetic-mock', runCase };
  assertCaseObservations(example, await subject.runCase(example));
  assert.equal(runCase.mock.callCount(), 1);
  assert.equal(runCase.mock.calls[0].arguments[0], example);
});
test('bare pass flags, wrong values, duplicated probes and swallowed errors cannot satisfy assertions', () => {
  for (const result of [
    { status: 'pass' },
    { status: 'pass', probes: [{ id: 'value', actual: 99, pass: true }] },
    {
      status: 'pass',
      probes: [
        { id: 'value', actual: 2 },
        { id: 'value', actual: 2 },
      ],
    },
    { status: 'unsupported' },
  ] satisfies CaseResult[])
    assert.throws(() => assertCaseObservations(example, result));
  const errorCase: BehaviorCase = {
    ...example,
    probes: [{ id: 'error', args: [], throws: { name: 'TypeError', message: 'bad input' } }],
  };
  assert.throws(() =>
    assertCaseObservations(errorCase, { status: 'pass', probes: [{ id: 'error', actual: null }] }),
  );
  assertCaseObservations(errorCase, {
    status: 'pass',
    probes: [{ id: 'error', thrown: { name: 'TypeError', message: 'bad input' } }],
  });
});
