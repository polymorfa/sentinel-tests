import { Buffer } from 'node:buffer';
import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const bytes = (value: number[]): JsonValue => ({ $type: 'Uint8Array', value });
const buffer = (value: number[]): JsonValue => ({ $type: 'ArrayBuffer', value });
const special = (value: string): JsonValue => ({ $type: 'number', value });
const reference = (value: string): JsonValue => ({ $type: 'reference', value });
function plan(name: string, probes: Probe[]): BehaviorCase {
  return {
    schemaVersion: 1,
    id: `byte-array-${name}-v1`,
    version: 1,
    module: 'WAByteArray',
    export: 'intToBytes',
    probes,
  };
}
/** Authoring oracle: an unsigned 32-bit word encoded by Buffer, then sliced/padded. */
export function integerByteOracle(width: number, value: number): number[] {
  const word = Buffer.alloc(4);
  const integer = Number.isFinite(value) ? BigInt(Math.trunc(value)) : 0n;
  word.writeUInt32BE(Number(BigInt.asUintN(32, integer)));
  return [...Buffer.alloc(Math.max(0, width - 4)), ...word.subarray(Math.max(0, 4 - width))];
}
export function byteArrayCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const values = [
    0,
    1,
    127,
    128,
    255,
    256,
    257,
    65535,
    65536,
    0x12345678,
    0x80000000,
    0xffffffff,
    0x100000000,
    0x100000001,
    -1,
    -128,
    -256,
    -65537,
    -2147483648,
    -4294967297,
    1.75,
    -1.75,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
  ];
  for (const width of [0, 1, 2, 3, 4, 5, 6, 7, 8, 16, 64, 257])
    cases.push(
      plan(
        `width-${width}`,
        values.map((value, index) => ({
          id: `value-${index}`,
          args: [width, value],
          expected: bytes(integerByteOracle(width, value)),
        })),
      ),
    );
  const coerced: [string, JsonValue, number][] = [
    ['nan', special('NaN'), 0],
    ['infinity', special('Infinity'), 0],
    ['negative-infinity', special('-Infinity'), 0],
    ['undefined', absent, 0],
    ['null', null, 0],
    ['true', true, 1],
    ['false', false, 0],
    ['decimal-string', '66051', 66051],
    ['hex-string', '0x1234', 0x1234],
    ['empty-string', '', 0],
    ['bad-string', 'odd', 0],
    ['array', [257], 257],
    ['record', {}, 0],
  ];
  cases.push(
    plan(
      'numeric-coercions',
      coerced.map(([id, value, number]) => ({
        id,
        args: [6, value],
        expected: bytes(integerByteOracle(6, number)),
      })),
    ),
  );
  cases.push(
    plan('widths-errors-and-recovery', [
      { id: 'fractional-width', args: [2.5, 0x1234], expected: bytes([0, 0]) },
      { id: 'string-width', args: ['2', 0x1234], expected: bytes([0x12, 0x34]) },
      { id: 'null-width', args: [null, 99], expected: bytes([]) },
      { id: 'nan-width', args: [special('NaN'), 99], expected: bytes([]) },
      { id: 'negative-width', args: [-1, 99], throws: { name: 'RangeError' } },
      { id: 'infinite-width', args: [special('Infinity'), 99], throws: { name: 'RangeError' } },
      {
        id: 'bigint-width',
        args: [{ $type: 'BigInt', value: '2' }, 99],
        throws: { name: 'TypeError' },
      },
      {
        id: 'bigint-value',
        args: [1, { $type: 'BigInt', value: '1' }],
        throws: { name: 'TypeError' },
      },
      { id: 'bigint-value-empty', args: [0, { $type: 'BigInt', value: '1' }], expected: bytes([]) },
      { id: 'recovered', args: [4, 0x12345678], expected: bytes([0x12, 0x34, 0x56, 0x78]) },
    ]),
  );
  for (const width of [0, 1, 3, 4, 8, 257]) {
    const expected = integerByteOracle(width, 0x89abcdef);
    cases.push(
      plan(`returned-objects-${width}`, [
        {
          id: 'actual-word',
          args: [width, 0x89abcdef],
          retain: { id: 'word', stage: 'call' },
          expected: bytes(expected),
        },
        {
          id: 'actual-buffer',
          export: 'uint8ArrayToBuffer',
          args: [reference('word')],
          retain: { id: 'first', stage: 'call' },
          expected: buffer(expected),
        },
        {
          id: 'distinct-second-buffer',
          export: 'uint8ArrayToBuffer',
          args: [reference('word')],
          retain: { id: 'second', stage: 'call' },
          result: { identityWith: 'first' },
          expected: false,
        },
        {
          id: 'equal-buffer-bytes',
          export: 'compareArrayBuffer',
          args: [reference('first'), reference('second')],
          expected: true,
        },
        {
          id: 'view-and-buffer-bytes',
          export: 'compareArrayBuffer',
          args: [reference('word'), reference('first')],
          expected: true,
        },
      ]),
    );
  }
  const slicing: Probe[] = [];
  for (const length of [0, 1, 2, 7, 16, 31, 64, 257])
    for (const offset of [0, 1, 7]) {
      const value = Array.from({ length }, (_, index) => (index * 73 + length) % 256);
      slicing.push({
        id: `length-${length}-offset-${offset}`,
        export: 'uint8ArrayToBuffer',
        args: [
          {
            $type: 'Uint8Array',
            value: [...Array<number>(offset).fill(0xee), ...value, 0xdd, 0xcc],
            byteOffset: offset,
            byteLength: length,
          },
        ],
        expected: buffer(value),
      });
    }
  slicing.push(
    { id: 'null-input', export: 'uint8ArrayToBuffer', args: [null], throws: { name: 'TypeError' } },
    {
      id: 'array-input',
      export: 'uint8ArrayToBuffer',
      args: [[1, 2]],
      throws: { name: 'TypeError' },
    },
    {
      id: 'valid-after-errors',
      export: 'uint8ArrayToBuffer',
      args: [bytes([0, 127, 128, 255])],
      expected: buffer([0, 127, 128, 255]),
    },
  );
  cases.push(plan('offset-views-and-errors', slicing));
  const compare: Probe[] = [];
  for (const length of [0, 1, 2, 3, 16, 31, 64]) {
    const original = Array.from({ length }, (_, index) => (index * 97 + 19) % 256);
    compare.push({
      id: `same-${length}`,
      export: 'compareArrayBuffer',
      args: [buffer(original), buffer([...original])],
      expected: true,
    });
    compare.push({
      id: `longer-${length}`,
      export: 'compareArrayBuffer',
      args: [buffer(original), buffer([...original, 0])],
      expected: false,
    });
    for (let index = 0; index < length; index++)
      for (let bit = 0; bit < 8; bit++) {
        const changed = [...original];
        changed[index] = changed[index]! ^ (2 ** bit);
        compare.push({
          id: `flip-${length}-${index}-${bit}`,
          export: 'compareArrayBuffer',
          args: [buffer(original), buffer(changed)],
          expected: false,
        });
      }
  }
  for (let index = 0; index < compare.length; index += 80)
    cases.push(plan(`comparison-history-${index / 80}`, compare.slice(index, index + 80)));
  const odd: [string, JsonValue, JsonValue, boolean][] = [
    ['empty', buffer([]), buffer([]), true],
    ['null', null, buffer([]), false],
    ['undefined', absent, buffer([]), false],
    ['false', false, [], false],
    ['zero', 0, [], false],
    ['empty-string', '', [], false],
    ['nan', special('NaN'), [], false],
    ['empty-array-record', [], {}, true],
    ['length-record', { length: 2, '0': 257, '1': -1 }, [1, 255], true],
    ['numeric-length', 3, [0, 0, 0], true],
    ['string-length', '2', [0, 0], true],
    ['typed-versus-array', bytes([0, 128, 255]), [0, 128, 255], true],
    ['wrapped-numbers', [256, -1, 1.5], [0, 255, 1], true],
  ];
  cases.push(
    plan(
      'comparison-coercions',
      odd.map(([id, a, b, expected]) => ({
        id,
        export: 'compareArrayBuffer',
        args: [a, b],
        expected,
      })),
    ),
  );
  return cases;
}
