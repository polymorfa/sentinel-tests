import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import type { BehaviorCase, CaseResult, Subject } from './types.ts';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateSubject(value: unknown): Subject {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    value.id.length > 256 ||
    [...value.id].some((character) => character.charCodeAt(0) < 32) ||
    typeof value.runCase !== 'function'
  )
    throw new TypeError('createSubject() must return an identified subject with runCase()');
  if (
    value.capabilities !== undefined &&
    (!Array.isArray(value.capabilities) ||
      !value.capabilities.every(
        (capability) =>
          typeof capability === 'string' && capability.length > 0 && capability.length <= 256,
      ))
  )
    throw new TypeError('Subject capabilities must be named strings');
  if (value.compareCase !== undefined && typeof value.compareCase !== 'function')
    throw new TypeError('Subject compareCase must be a function');
  if (value.close !== undefined && typeof value.close !== 'function')
    throw new TypeError('Subject close must be a function');
  return value as unknown as Subject;
}

export function subjectModuleUrl(specifier: string): string {
  if (!specifier.trim() || specifier !== specifier.trim())
    throw new TypeError('Supply an explicit subject module file path or file URL');
  if (/^[a-z][a-z0-9+.-]*:/i.test(specifier)) {
    const url = new URL(specifier);
    if (url.protocol !== 'file:' || url.username || url.password || url.search || url.hash)
      throw new TypeError('Subject modules must be local files');
    return url.href;
  }
  return pathToFileURL(resolve(specifier)).href;
}

/** Executable subject code loads only after an explicit caller/environment selection. */
export async function loadSubject(
  specifier: string | undefined = process.env.SENTINEL_SUBJECT_MODULE,
): Promise<Subject | null> {
  if (specifier === undefined || specifier === '') return null;
  const loaded: unknown = await import(subjectModuleUrl(specifier));
  if (!record(loaded) || typeof loaded.createSubject !== 'function')
    throw new TypeError('The selected subject module must export createSubject()');
  const factory = loaded.createSubject as () => unknown | Promise<unknown>;
  return validateSubject(await factory());
}

/** Assertions use observed values; a subject's bare pass flag cannot satisfy the test. */
export function assertCaseObservations(testCase: BehaviorCase, result: CaseResult): void {
  assert.equal(
    result.status,
    'pass',
    `${testCase.id}: ${result.status}${result.error?.code ? ` (${result.error.code})` : ''}`,
  );
  assert.ok(Array.isArray(result.probes), `${testCase.id}: actual probe observations are required`);
  assert.equal(
    result.probes.length,
    testCase.probes.length,
    `${testCase.id}: incomplete probe coverage`,
  );
  const seen = new Set<string>();
  for (const observed of result.probes) {
    assert.ok(!seen.has(observed.id), `${testCase.id}: duplicate probe ${observed.id}`);
    seen.add(observed.id);
    const expected = testCase.probes.find((probe) => probe.id === observed.id);
    assert.ok(expected, `${testCase.id}: unexpected probe ${observed.id}`);
    if (expected.throws) {
      assert.ok(observed.thrown, `${testCase.id}/${observed.id}: expected an application error`);
      for (const field of ['name', 'message'] as const)
        if (expected.throws[field] !== undefined)
          assert.equal(observed.thrown[field], expected.throws[field]);
    } else {
      assert.equal(
        observed.thrown,
        undefined,
        `${testCase.id}/${observed.id}: unexpected application error`,
      );
      assert.ok(
        Object.hasOwn(observed, 'actual'),
        `${testCase.id}/${observed.id}: missing actual value`,
      );
      assert.deepEqual(
        observed.actual,
        expected.expected,
        `${testCase.id}/${observed.id}: actual value differs`,
      );
    }
  }
}
