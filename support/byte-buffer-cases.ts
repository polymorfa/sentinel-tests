import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const buffer = (value: number[]): JsonValue => ({ $type: 'ArrayBuffer', value });
const bytes = (value: number[], byteOffset?: number, byteLength?: number): JsonValue => ({
  $type: 'Uint8Array',
  value,
  ...(byteOffset === undefined
    ? {}
    : { byteOffset, byteLength: byteLength ?? value.length - byteOffset }),
});
const ref = (value: string): JsonValue => ({ $type: 'reference', value });
const binary = (value: number[]): string => value.map((byte) => String.fromCharCode(byte)).join('');
const call = (id: string, selected: string, args: JsonValue[], expected: JsonValue): Probe => ({
  id,
  export: selected,
  args,
  expected,
});
const failure = (
  id: string,
  selected: string,
  args: JsonValue[],
  name: string,
  message?: string,
): Probe => ({
  id,
  export: selected,
  args,
  throws: { name, ...(message === undefined ? {} : { message }) },
});
const make = (name: string, probes: Probe[]): BehaviorCase => ({
  schemaVersion: 1,
  id: `byte-buffer-${name}-v1`,
  version: 1,
  module: 'WAByteBuffer',
  export: 'wrapString',
  probes,
});

/** Byte-to-code-unit oracles, not UTF-8 encoding or a replacement implementation. */
export function byteBufferCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  for (let page = 0; page < 8; page++) {
    const probes: Probe[] = [];
    for (let byte = page * 32; byte < (page + 1) * 32; byte++) {
      probes.push(
        call(`encode-${byte}`, 'wrapString', [String.fromCharCode(byte)], buffer([byte])),
        call(`decode-${byte}`, 'wrapBufferToString', [buffer([byte])], String.fromCharCode(byte)),
      );
    }
    cases.push(make(`all-byte-code-units-${page}`, probes));
  }
  const alphabet = Array.from({ length: 256 }, (_, i) => i);
  cases.push(
    make('latin1-is-not-utf8', [
      call('entire-alphabet', 'wrapString', [binary(alphabet)], buffer(alphabet)),
      call('literal-latin1', 'wrapString', ['\0Aéÿ'], buffer([0, 65, 233, 255])),
      call('literal-bytes', 'wrapBufferToString', [buffer([0, 65, 233, 255])], '\0Aéÿ'),
      call('utf8-bytes-are-two-code-units', 'wrapBufferToString', [buffer([195, 169])], 'Ã©'),
    ]),
  );
  for (const length of [0, 1, 31, 255, 1023, 1024, 1025, 2048, 4097, 8193, 16385]) {
    // Fixed arithmetic profile and literal character mapping are independent of WA's conversion loops.
    const value = Array.from({ length }, (_, i) => (i * 73 + Math.floor(i / 7) + 19) % 256);
    const text = binary(value);
    cases.push(
      make(`chunk-and-odd-length-${length}`, [
        {
          ...call('encode-retained', 'wrapString', [text], buffer(value)),
          retain: { id: 'encoded', stage: 'call' },
        },
        call('decode-actual-encoded', 'wrapBufferToString', [ref('encoded')], text),
        {
          ...call('whole-buffer-identity', 'wrapArrayBuffer', [ref('encoded')], true),
          result: { identityWith: 'encoded' },
        },
        call('direct-typed-buffer-decode', 'wrapBufferToString', [buffer(value)], text),
      ]),
    );
  }
  for (const seed of [1, 17, 4294967295]) {
    let state = seed >>> 0;
    const value = Array.from({ length: 257 }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state >>> 24;
    });
    cases.push(
      make(`seeded-byte-profile-${seed}`, [
        call('encode-profile', 'wrapString', [binary(value)], buffer(value)),
        call('decode-profile', 'wrapBufferToString', [buffer(value)], binary(value)),
        call('wrap-profile', 'wrapUint8Array', [bytes(value)], buffer(value)),
      ]),
    );
  }
  const views: Probe[] = [];
  for (const [index, [backing, offset, length]] of (
    [
      [[238, 0, 255, 17, 221], 1, 3],
      [[238, 221], 1, 0],
      [[1, 2, 3], 0, 3],
      [[1, 2, 3], 3, 0],
      [[238, ...alphabet, 221], 1, 256],
      [[238, 11, 12, 13, 221], 2, 1],
    ] as [number[], number, number][]
  ).entries()) {
    const selected = backing.slice(offset, offset + length);
    views.push(
      {
        ...call(
          `view-${index}`,
          'wrapUint8Array',
          [bytes(backing, offset, length)],
          buffer(selected),
        ),
        retain: { id: `view${index}`, stage: 'call' },
      },
      call(`decode-view-${index}`, 'wrapBufferToString', [ref(`view${index}`)], binary(selected)),
      {
        ...call(
          `returned-buffer-stays-whole-${index}`,
          'wrapArrayBuffer',
          [ref(`view${index}`)],
          true,
        ),
        result: { identityWith: `view${index}` },
      },
    );
  }
  cases.push(make('typed-offset-length-sentinels', views));
  const empties: Probe[] = [
    {
      ...call('retain-original-empty', 'wrapString', [''], buffer([])),
      retain: { id: 'empty', stage: 'call' },
    },
  ];
  for (const [index, [selected, input]] of (
    [
      ['wrapString', ''],
      ['wrapArrayBuffer', buffer([])],
      ['wrapUint8Array', bytes([])],
      ['wrapUint8Array', bytes([238, 221], 1, 0)],
      ['wrapUint8Array', bytes([1, 2], 2, 0)],
    ] as [string, JsonValue][]
  ).entries())
    empties.push({
      ...call(`same-empty-${index}`, selected, [input], true),
      result: { identityWith: 'empty' },
    });
  empties.push(
    {
      ...call('retain-nonempty', 'wrapString', ['A'], buffer([65])),
      retain: { id: 'nonempty', stage: 'call' },
    },
    {
      ...call('nonempty-not-empty', 'wrapArrayBuffer', [ref('nonempty')], false),
      result: { identityWith: 'empty' },
    },
    {
      ...call('same-bytes-new-allocation', 'wrapString', ['A'], false),
      result: { identityWith: 'nonempty' },
    },
    call('original-after-new-allocation', 'wrapBufferToString', [ref('nonempty')], 'A'),
  );
  cases.push(make('shared-empty-and-real-buffer-identity', empties));
  const errors: Probe[] = [];
  for (const [index, input] of [null, 42, false, {}, [], buffer([65])].entries()) {
    errors.push(
      failure(
        `wrong-string-${index}`,
        'wrapString',
        [input],
        'Error',
        'TypedError: Illegal input => not a string',
      ),
      call(`recover-string-${index}`, 'wrapString', ['é'], buffer([233])),
    );
  }
  for (const [index, text, unit, position] of [
    [0, 'Ā', 256, 0],
    [1, 'AĀ', 256, 1],
    [2, '🌍', 55356, 0],
    [3, '\udfff', 57343, 0],
  ] as const) {
    errors.push(
      failure(
        `high-unit-${index}`,
        'wrapString',
        [text],
        'Error',
        `RangeError: Illegal charCode at ${position}: 0 <= ${unit} <= 255`,
      ),
      call(`recover-high-unit-${index}`, 'wrapBufferToString', [buffer([255, 0])], 'ÿ\0'),
    );
  }
  for (const [index, input, type] of [
    [0, null, 'object'],
    [1, [], 'object'],
    [2, 'A', 'string'],
    [3, 7, 'number'],
  ] as [number, JsonValue, string][]) {
    errors.push(
      failure(
        `wrong-view-${index}`,
        'wrapUint8Array',
        [input],
        'Error',
        `TypeError: Illegal input => not an Uint8Array but ${type}`,
      ),
      failure(
        `wrong-buffer-${index}`,
        'wrapArrayBuffer',
        [input],
        'Error',
        `TypeError: Illegal input => not an ArrayBuffer but ${type}`,
      ),
      call(`recover-buffer-${index}`, 'wrapArrayBuffer', [buffer([0, 255])], buffer([0, 255])),
    );
  }
  cases.push(make('source-errors-and-recovery', errors));
  cases.push(
    make('unguarded-buffer-decoder-characterization', [
      call('plain-object-empty', 'wrapBufferToString', [{}], ''),
      call('zero-length-record-empty', 'wrapBufferToString', [{ byteLength: 0 }], ''),
      call('negative-length-record-empty', 'wrapBufferToString', [{ byteLength: -1 }], ''),
      call(
        'nan-length-record-empty',
        'wrapBufferToString',
        [{ byteLength: { $type: 'number', value: 'NaN' } }],
        '',
      ),
      failure(
        'positive-record-native-dataview-error',
        'wrapBufferToString',
        [{ byteLength: 1 }],
        'TypeError',
      ),
      call('recover-after-native-dataview-error', 'wrapBufferToString', [buffer([65])], 'A'),
      failure('null-native-access-error', 'wrapBufferToString', [null], 'TypeError'),
      call('recover-after-null', 'wrapString', ['ÿ'], buffer([255])),
    ]),
  );
  return cases;
}
