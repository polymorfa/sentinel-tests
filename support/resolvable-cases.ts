import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const makeCase = (id: string, probes: Probe[]): BehaviorCase => ({
  schemaVersion: 1,
  id: `resolvable-${id}-v1`,
  version: 1,
  module: 'WAResolvable',
  export: 'Resolvable',
  construct: { args: [] },
  probes,
  stubs: [{ module: 'cr:6640', exports: null }],
});
const capture = (id: string, handle: string): Probe => ({
  id,
  args: [],
  pending: { id: handle, action: 'start', property: 'promise' },
  expected: absent,
});
const flag = (id: string, expected: boolean): Probe => ({
  id,
  method: 'resolveWasCalled',
  args: [],
  expected,
});
const method = (id: string, name: string, args: JsonValue[]): Probe => ({
  id,
  method: name,
  args,
  expected: absent,
});
const inspect = (id: string, handle: string, expected: JsonValue): Probe => ({
  id,
  args: [],
  pending: { id: handle, action: 'inspect' },
  expected,
});
const fulfilled = (value: JsonValue): JsonValue => ({ state: 'fulfilled', value });
const values: { id: string; value: JsonValue }[] = [
  { id: 'undefined', value: absent },
  { id: 'null', value: null },
  { id: 'false', value: false },
  { id: 'zero', value: 0 },
  { id: 'empty-string', value: '' },
  { id: 'int32-minimum', value: -2147483648 },
  { id: 'uint32-maximum', value: 4294967295 },
  { id: 'unicode-controls', value: 'odd\u0000\n\\é😀' },
  { id: 'odd-byte-view', value: { $type: 'Uint8Array', value: [0, 127, 128, 255, 1] } },
  {
    id: 'large-bigint',
    value: { $type: 'BigInt', value: '340282366920938463463374607431768211455' },
  },
  { id: 'large-odd-array', value: Array.from({ length: 4097 }, (_, index) => (index * 251) % 257) },
  {
    id: 'nested-data',
    value: Array.from({ length: 32 }).reduce<JsonValue>((value, _, level) => ({ level, value }), {
      leaf: [false, 0, '', null],
    }),
  },
];
const reasons: { id: string; value: JsonValue; error: { name: string; message: string } }[] = [
  { id: 'undefined', value: absent, error: { name: 'Error', message: 'undefined' } },
  { id: 'null', value: null, error: { name: 'Error', message: 'null' } },
  { id: 'false', value: false, error: { name: 'Error', message: 'false' } },
  { id: 'zero', value: 0, error: { name: 'Error', message: '0' } },
  { id: 'empty-string', value: '', error: { name: 'Error', message: '' } },
  {
    id: 'string',
    value: 'synthetic\nrejection',
    error: { name: 'Error', message: 'synthetic\nrejection' },
  },
  { id: 'nan', value: { $type: 'number', value: 'NaN' }, error: { name: 'Error', message: 'NaN' } },
  {
    id: 'error-shaped',
    value: { name: 'SyntheticFailure', message: 'original reason' },
    error: { name: 'SyntheticFailure', message: 'original reason' },
  },
  {
    id: 'empty-message',
    value: { name: 'SyntheticFailure', message: '' },
    error: { name: 'SyntheticFailure', message: '' },
  },
  {
    id: 'plain-object',
    value: { payload: [0, false, null] },
    error: { name: 'Error', message: '[object Object]' },
  },
  { id: 'array', value: [false, 0, ''], error: { name: 'Error', message: 'false,0,' } },
];

/** Actual WAResolvable methods and its own realm-native Promise, with observers installed first. */
export function resolvableCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = values.map(({ id, value }) =>
    makeCase(`resolve-${id}`, [
      capture('capture-before-settle', 'first'),
      flag('initial-not-resolved', false),
      inspect('initial-pending', 'first', { state: 'pending' }),
      method('resolve-value', 'resolve', [value]),
      flag('resolve-marked', true),
      inspect('fulfilled-original', 'first', fulfilled(value)),
      {
        id: 'await-original',
        args: [],
        pending: { id: 'first', action: 'await' },
        expected: value,
      },
      method('later-resolve-ignored', 'resolve', ['ignored-second-value']),
      flag('still-marked', true),
      inspect('first-value-retained', 'first', fulfilled(value)),
      capture('capture-same-promise-after-resolve', 'late'),
      inspect('late-observer-same-value', 'late', fulfilled(value)),
      { id: 'late-await', args: [], pending: { id: 'late', action: 'await' }, expected: value },
    ]),
  );
  for (const { id, value, error } of reasons) {
    const rejected = { state: 'rejected', error };
    cases.push(
      makeCase(`reject-${id}`, [
        capture('capture-before-reject', 'first'),
        flag('initial-not-resolved', false),
        inspect('initial-pending', 'first', { state: 'pending' }),
        method('reject-reason', 'reject', [value]),
        flag('reject-also-marks-resolve', true),
        inspect('original-rejected', 'first', rejected),
        {
          id: 'await-rejection',
          args: [],
          pending: { id: 'first', action: 'await' },
          throws: error,
        },
        method('later-resolve-cannot-recover', 'resolve', ['ignored-recovery-value']),
        inspect('rejection-retained', 'first', rejected),
        capture('capture-same-rejected-promise', 'late'),
        inspect('late-observer-same-rejection', 'late', rejected),
        {
          id: 'late-await-rejection',
          args: [],
          pending: { id: 'late', action: 'await' },
          throws: error,
        },
      ]),
    );
  }
  return cases;
}
