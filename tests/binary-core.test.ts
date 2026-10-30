import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSubject, assertCaseObservations } from '../support/subject.ts';
import type { BehaviorCase, CaseComparison, JsonValue, Probe } from '../support/types.ts';

const subject = await loadSubject();
if (!subject?.capabilities?.includes('wa-internal:binary-core'))
  test.skip('Binary core suite requires a subject with wa-internal:binary-core', () => {});
after(async () => {
  await subject?.close?.();
});
const seed = 0xb17c0de;
let state = seed;
const next = () => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
};
const bytes = (value: number[]): JsonValue => ({ $type: 'Uint8Array', value });
const buffer = (value: number[]): JsonValue => ({ $type: 'ArrayBuffer', value });
const probe = (id: string, args: JsonValue[], expected: JsonValue): Probe => ({
  id,
  args,
  expected,
});
const error = (id: string, args: JsonValue[], message?: string): Probe => ({
  id,
  args,
  throws: { name: 'Error', ...(message ? { message } : {}) },
});

// BigInt computes exact 64-bit mathematical values; no vendor arithmetic is reused.
const safe = (value: bigint) => value >= -9007199254740991n && value <= 9007199254740991n;
const words = [0, 1, -1, 0x1fffff, 0x200000, -0x200000, -0x200001, 0x7fffffff, -0x80000000];
const pairs: [number, number][] = words.flatMap((hi) =>
  [0, 1, -1, 0x7fffffff, -0x80000000].map((lo): [number, number] => [hi, lo]),
);
for (let i = 0; i < 512; i++) pairs.push([next() | 0, next() | 0]);
// Ensure generated trials include many representable values as well as overflow.
for (let i = 0; i < 256; i++) pairs.push([(next() % 0x400000) - 0x200000, next() | 0]);
const byteVectors = [[], [0], [255], [0, 1], [255, 254], Array.from({ length: 256 }, (_, i) => i)];
for (const length of [
  3, 4, 5, 7, 8, 9, 15, 16, 17, 31, 32, 33, 63, 64, 65, 127, 128, 129, 255, 257, 511, 513, 1023,
  1025, 2999, 3000, 3001, 4095, 4097,
])
  byteVectors.push(Array.from({ length }, () => next() & 255));
for (let i = 0; i < 128; i++)
  byteVectors.push(Array.from({ length: next() % 97 }, () => next() & 255));
const hex = (value: number[]) => Buffer.from(value).toString('hex');
// Whole-input bit strings provide an independent oracle for the shipped custom alphabet.
const alphabet = '123456789ABCDEFGHJKLMNPQRSTVWXYZ';
function base32(value: number[]) {
  const bits = value.map((byte) => byte.toString(2).padStart(8, '0')).join('');
  return Array.from(
    { length: Math.ceil(bits.length / 5) },
    (_, at) => alphabet[Number.parseInt(bits.slice(at * 5, at * 5 + 5).padEnd(5, '0'), 2)],
  ).join('');
}
async function check(module: string, exported: string, probes: Probe[]) {
  assert.ok(subject);
  for (let offset = 0; offset < probes.length; offset += 32) {
    const testCase: BehaviorCase = {
      schemaVersion: 1,
      id: `binary-core-${module}-${exported}-${offset}`,
      version: 1,
      module,
      export: exported,
      probes: probes.slice(offset, offset + 32),
    };
    const result = await subject.runCase(testCase);
    assertCaseObservations(testCase, result);
    if (subject.compareCase) {
      const comparison: CaseComparison = await subject.compareCase(testCase);
      assert.equal(
        comparison.status,
        'unchanged',
        `${testCase.id}: preserve seed ${seed} and failing input`,
      );
      assertCaseObservations(testCase, comparison.baseline);
      assert.ok(comparison.candidate);
      assertCaseObservations(testCase, comparison.candidate);
    }
  }
}

describe(
  'binary representation core: exact integers, bytes, hex and custom base32',
  {
    skip: !subject
      ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed adapter'
      : !subject.capabilities?.includes('wa-internal:binary-core')
        ? `${subject.id} lacks wa-internal:binary-core`
        : false,
  },
  () => {
    for (const signed of [false, true]) {
      test(`${signed ? 'signed' : 'unsigned'} 64-bit conversion rejects values outside the safe integer domain`, async () => {
        await check(
          'WABinary',
          signed ? 'parseInt64OrThrow' : 'parseUint64OrThrow',
          pairs.map(([hi, lo], i) => {
            const value = BigInt(signed ? hi : hi >>> 0) * 4294967296n + BigInt(lo >>> 0);
            return safe(value)
              ? probe(`pair-${i}`, [hi, lo], Number(value))
              : error(`pair-${i}`, [hi, lo]);
          }),
        );
      });
      test(`${signed ? 'signed' : 'unsigned'} safe-integer predicate agrees with exact BigInt`, async () => {
        await check(
          'WABinary',
          'longFitsInDouble',
          pairs.map(([hi, lo], i) =>
            probe(
              `pair-${i}`,
              [signed, hi, lo],
              safe(BigInt(signed ? hi : hi >>> 0) * 4294967296n + BigInt(lo >>> 0)),
            ),
          ),
        );
      });
    }
    for (const exported of ['toHex', 'toLowerCaseHex'])
      test(`${exported}: every byte and seeded odd-length byte arrays`, async () => {
        await check(
          'WAHex',
          exported,
          byteVectors.map((value, i) =>
            probe(
              `bytes-${i}`,
              [bytes(value)],
              exported === 'toHex' ? hex(value).toUpperCase() : hex(value),
            ),
          ),
        );
      });
    test('parseHex: lower, upper and mixed case bytes match the independent Buffer oracle', async () => {
      await check(
        'WAHex',
        'parseHex',
        byteVectors.flatMap((value, i) =>
          [
            hex(value),
            hex(value).toUpperCase(),
            hex(value)
              .split('')
              .map((char, at) => (at % 2 ? char.toUpperCase() : char))
              .join(''),
          ].map((input, form) => probe(`bytes-${i}-case-${form}`, [input], buffer(value))),
        ),
      );
    });
    test('parseHex rejects odd lengths and non-hex characters without trimming', async () => {
      await check(
        'WAHex',
        'parseHex',
        [
          '0',
          'abc',
          '12345',
          'a'.repeat(255),
          'gg',
          '0x00',
          ' 00',
          '00 ',
          '00\n',
          '0\t',
          '-1',
          '+1',
          'é0',
          '０0',
          '\u000000',
        ].map((value, i) => error(`invalid-${i}`, [value])),
      );
    });
    test('hexOrThrow preserves valid spelling and rejects every non-hex ASCII code', async () => {
      await check('WAHex', 'hexOrThrow', [
        probe('empty', [''], ''),
        probe('mixed', ['aB09fF'], 'aB09fF'),
        ...Array.from({ length: 128 }, (_, code) => code)
          .filter((code) => !/[0-9a-f]/i.test(String.fromCharCode(code)))
          .map((code) => error(`ascii-${code}`, [`0${String.fromCharCode(code)}`])),
      ]);
    });
    test('byte buffer conversion preserves exact content for empty and seeded arrays', async () => {
      await check(
        'WAHex',
        'bytesToBuffer',
        byteVectors.map((value, i) => probe(`bytes-${i}`, [bytes(value)], buffer(value))),
      );
    });
    test('debug bytes select quoted printable ASCII or uppercase hexadecimal', async () => {
      const values = [
        ...byteVectors,
        Array.from({ length: 95 }, (_, i) => i + 32),
        [34, 92, 65],
        [31],
        [32],
        [126],
        [127],
      ];
      await check(
        'WAHex',
        'bytesToDebugString',
        values.map((value, i) =>
          probe(
            `bytes-${i}`,
            [bytes(value)],
            value.every((byte) => byte >= 32 && byte <= 126)
              ? JSON.stringify(String.fromCharCode(...value))
              : hex(value).toUpperCase(),
          ),
        ),
      );
    });
    test('hex long creation pads to 64 bits and rejects oversized/invalid input', async () => {
      const values = ['', '0', 'f', 'AB', '123456789abcdef', 'ffffffffffffffff'];
      await check('WAHex', 'createHexLong', [
        ...values.flatMap((value, i) =>
          [false, true].map((negative) =>
            probe(
              `value-${i}-${negative}`,
              [value, negative],
              `${negative ? '-' : ''}0x${value.padStart(16, '0')}`,
            ),
          ),
        ),
        error('too-wide', ['1'.repeat(17)]),
        error('prefix', ['0xff']),
        error('invalid', ['xyz']),
      ]);
    });
    test('32-bit word packing agrees with independent unsigned BigInt hexadecimal', async () => {
      await check(
        'WAHex',
        'createHexLongFrom32Bits',
        pairs.map(([hi, lo], i) =>
          probe(
            `pair-${i}`,
            [hi, lo, i % 2 === 0],
            `${i % 2 === 0 ? '-' : ''}0x${((BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0)).toString(16).padStart(16, '0')}`,
          ),
        ),
      );
      await check(
        'WAHex',
        'createHexLongFrom32Bits',
        [
          [4294967296, 0],
          [-4294967297, 0],
          [0, 4294967296],
          [0, -4294967297],
        ].map((args, i) => error(`overflow-${i}`, args)),
      );
    });
    test('number to hex long preserves signed safe-integer boundaries', async () => {
      const values = [
        0,
        1,
        -1,
        255,
        -255,
        4294967295,
        -4294967296,
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
      ];
      await check(
        'WAHex',
        'hexLongFromNumber',
        values.map((value, i) =>
          probe(
            `number-${i}`,
            [value],
            `${value < 0 ? '-' : ''}0x${BigInt(Math.abs(value)).toString(16).padStart(16, '0')}`,
          ),
        ),
      );
    });
    test('custom base32 covers each alphabet symbol and partial final groups', async () => {
      const vectors = [...Array.from({ length: 256 }, (_, i) => [i]), ...byteVectors];
      await check(
        'WAWebAltDeviceLinkingBase32Encode',
        'bytesToCrockford',
        vectors.map((value, i) => probe(`bytes-${i}`, [bytes(value)], base32(value))),
      );
    });
  },
);

// These scenarios retain one real Binary instance across ordered method probes.
describe(
  'Binary instance packing, cursor bounds and offset views',
  { skip: !subject?.capabilities?.includes('wa-internal:binary-core') },
  () => {
    const undefinedValue: JsonValue = { $type: 'undefined' };
    async function scenario(id: string, args: JsonValue[], probes: Probe[]) {
      assert.ok(subject);
      const testCase: BehaviorCase = {
        schemaVersion: 1,
        id: `binary-state-${id}`,
        version: 1,
        module: 'WABinary',
        export: 'Binary',
        construct: { args },
        probes,
      };
      assertCaseObservations(testCase, await subject.runCase(testCase));
      if (subject.compareCase) {
        const comparison: CaseComparison = await subject.compareCase(testCase);
        assert.equal(comparison.status, 'unchanged', id);
        assertCaseObservations(testCase, comparison.baseline);
        assert.ok(comparison.candidate);
        assertCaseObservations(testCase, comparison.candidate);
      }
    }
    for (const little of [false, true]) {
      test(`integer/float packing matches DataView, endian=${little}`, async () => {
        const fields: { suffix: string; width: number; values: number[] }[] = [
          { suffix: 'Uint8', width: 1, values: [0, 1, 127, 255] },
          { suffix: 'Int8', width: 1, values: [-128, -1, 0, 127] },
          { suffix: 'Uint16', width: 2, values: [0, 1, 255, 256, 65535] },
          { suffix: 'Int16', width: 2, values: [-32768, -1, 0, 32767] },
          { suffix: 'Uint32', width: 4, values: [0, 1, 65536, 2147483648, 4294967295] },
          { suffix: 'Int32', width: 4, values: [-2147483648, -1, 0, 2147483647] },
          { suffix: 'Float32', width: 4, values: [-123.5, 0, 1 / 3, 16777217] },
          {
            suffix: 'Float64',
            width: 8,
            values: [-Number.MAX_VALUE, Number.MIN_VALUE, 1 / 3, Number.MAX_VALUE],
          },
        ];
        const expected: number[] = [];
        const probes: Probe[] = [];
        for (const field of fields)
          for (const [at, value] of field.values.entries()) {
            const view = new DataView(new ArrayBuffer(field.width));
            const setters: Record<string, (value: number) => void> = {
              Uint8: (n) => view.setUint8(0, n),
              Int8: (n) => view.setInt8(0, n),
              Uint16: (n) => view.setUint16(0, n, little),
              Int16: (n) => view.setInt16(0, n, little),
              Uint32: (n) => view.setUint32(0, n, little),
              Int32: (n) => view.setInt32(0, n, little),
              Float32: (n) => view.setFloat32(0, n, little),
              Float64: (n) => view.setFloat64(0, n, little),
            };
            setters[field.suffix]!(value);
            expected.push(...new Uint8Array(view.buffer));
            probes.push({
              ...probe(`write-${field.suffix}-${at}`, [value], undefinedValue),
              method: `write${field.suffix}`,
            });
          }
        probes.push(
          { ...probe('size-written', [], expected.length), method: 'size' },
          { ...probe('read-bytes', [], bytes(expected)), method: 'readByteArrayView' },
          { ...probe('size-empty', [], 0), method: 'size' },
          {
            ...error('depleted', [], 'ReadError: tried to read from depleted binary'),
            method: 'readUint8',
          },
        );
        await scenario(`packed-${little}`, [bytes([]), little], probes);
      });
      test(`reads match DataView across odd cursor offsets, endian=${little}`, async () => {
        const input = Array.from({ length: 257 }, (_, i) => (i * 73 + 19) % 256);
        const view = new DataView(Uint8Array.from(input).buffer);
        const probes: Probe[] = [];
        let offset = 0;
        for (let i = 0; i < 20; i++) {
          probes.push({ ...probe(`byte-${i}`, [], view.getUint8(offset++)), method: 'readUint8' });
          probes.push({
            ...probe(`uint16-${i}`, [], view.getUint16(offset, little)),
            method: 'readUint16',
          });
          offset += 2;
          probes.push({
            ...probe(`int32-${i}`, [], view.getInt32(offset, little)),
            method: 'readInt32',
          });
          offset += 4;
        }
        probes.push(
          { ...probe('remaining', [], input.length - offset), method: 'size' },
          {
            ...error('negative-read', [-1], 'ReadError: given negative number of bytes to read'),
            method: 'readBuffer',
          },
          {
            ...error('oversized-read', [258], 'ReadError: tried to read beyond end of binary'),
            method: 'readBuffer',
          },
          { ...probe('size-after-errors', [], input.length - offset), method: 'size' },
        );
        await scenario(`cursor-${little}`, [bytes(input), little], probes);
      });
    }
    test('integer writes reject boundaries, fractions and malformed values without appending bytes', async () => {
      const probes: Probe[] = [];
      const ranges: [string, number, number][] = [
        ['Uint8', 0, 256],
        ['Int8', -128, 128],
        ['Uint16', 0, 65536],
        ['Int16', -32768, 32768],
        ['Uint32', 0, 4294967296],
        ['Int32', -2147483648, 2147483648],
      ];
      for (const [suffix, min, max] of ranges)
        for (const [i, value] of [
          min - 1,
          max,
          0.5,
          '1',
          null,
          { $type: 'number', value: 'NaN' },
          { $type: 'number', value: 'Infinity' },
        ].entries())
          probes.push({
            ...error(`${suffix}-${i}`, [value as JsonValue]),
            method: `write${suffix}`,
          });
      probes.push({ ...probe('unchanged-size', [], 0), method: 'size' });
      await scenario('invalid-writes', [], probes);
    });
    test('buffer growth and appending after partial consumption preserve unread bytes', async () => {
      for (const length of [63, 64, 65, 127, 128, 129, 4095, 4096, 4097]) {
        const input = Array.from({ length }, (_, i) => (i * 29) % 256);
        const appended = [17, 34, 51, 68, 85];
        await scenario(
          `growth-${length}`,
          [],
          [
            { ...probe('write-input', [bytes(input)], undefinedValue), method: 'writeByteArray' },
            {
              ...probe('consume-prefix', [length - 1], bytes(input.slice(0, -1))),
              method: 'readByteArrayView',
            },
            { ...probe('append', [bytes(appended)], undefinedValue), method: 'writeByteArray' },
            {
              ...probe('remaining', [], bytes([input[length - 1]!, ...appended])),
              method: 'readByteArrayView',
            },
            { ...probe('size-empty', [], 0), method: 'size' },
          ],
        );
      }
    });
    test('signed varint packing matches an independent BigInt base-128 oracle', async () => {
      const values = [
        0,
        1,
        127,
        128,
        255,
        16383,
        16384,
        2097151,
        2097152,
        268435455,
        268435456,
        Number.MAX_SAFE_INTEGER,
        -1,
        -128,
        -129,
        Number.MIN_SAFE_INTEGER,
      ];
      const expected: number[] = [];
      const probes: Probe[] = [];
      for (const [i, value] of values.entries()) {
        let remaining = BigInt.asUintN(64, BigInt(value));
        do {
          const digit = Number(remaining % 128n);
          remaining /= 128n;
          expected.push(digit + (remaining ? 128 : 0));
        } while (remaining);
        probes.push({ ...probe(`write-${i}`, [value], undefinedValue), method: 'writeVarInt' });
      }
      probes.push({ ...probe('packed-bytes', [], bytes(expected)), method: 'readByteArrayView' });
      await scenario('varints', [], probes);
    });
    test('offset typed-array views exclude backing-buffer sentinels', async () => {
      const value: JsonValue = {
        $type: 'Uint8Array',
        value: [222, 173, 0, 1, 254, 255, 190, 239],
        byteOffset: 2,
        byteLength: 4,
      };
      await check('WAHex', 'bytesToBuffer', [
        probe('logical-view', [value], buffer([0, 1, 254, 255])),
      ]);
      await check('WAHex', 'toHex', [probe('logical-view', [value], '0001FEFF')]);
      await check('WAWebAltDeviceLinkingBase32Encode', 'bytesToCrockford', [
        probe('logical-view', [value], base32([0, 1, 254, 255])),
      ]);
      await scenario(
        'offset-constructor',
        [value],
        [
          { ...probe('logical-size', [], 4), method: 'size' },
          { ...probe('logical-bytes', [], bytes([0, 1, 254, 255])), method: 'readByteArrayView' },
        ],
      );
    });
  },
);
