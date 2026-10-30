import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import type { BehaviorCase, JsonValue, Probe } from '../support/types.ts';

const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const supported = subject?.capabilities?.includes('wa-internal:wam-buffer');
if (!supported) test.skip(`WAM suite requires a subject with wa-internal:wam-buffer`, () => {});
const undefinedValue = { $type: 'undefined' };
const nan = { $type: 'number', value: 'NaN' };
const header = [87, 65, 77, 5, 0, 0, 0, 0];
const emptyBuffer = { args: ['regular', 0, 0, []] as JsonValue[] };
const bytes = (value: number[]): JsonValue => ({ $type: 'Uint8Array', value });

async function verify(
  id: string,
  exported: string,
  probes: Probe[],
  construct?: { args: JsonValue[] },
) {
  assert.ok(subject);
  const testCase: BehaviorCase = {
    schemaVersion: 1,
    id,
    version: 1,
    module: 'WAWamBuffer',
    export: exported,
    probes,
    ...(construct ? { construct } : {}),
  };
  assertCaseObservations(testCase, await subject.runCase(testCase));
  if (subject.compareCase) {
    const result = await subject.compareCase(testCase);
    assert.equal(result.status, 'unchanged', `${id}: baseline/candidate comparison`);
    assertCaseObservations(testCase, result.baseline);
    assert.ok(result.candidate);
    assertCaseObservations(testCase, result.candidate);
  }
}

describe(
  'WAM buffer actual-source behavior',
  {
    skip: !subject
      ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
      : !supported
        ? `${subject.id} lacks wa-internal:wam-buffer`
        : false,
  },
  () => {
    test('global admission rejects numeric NaN, retaining the observed non-number contract', async () => {
      const accepted: JsonValue[] = [
        null,
        undefinedValue,
        false,
        true,
        '',
        'NaN',
        [],
        {},
        -2147483649,
        -1,
        0,
        1,
        2147483648,
        0.5,
        { $type: 'number', value: 'Infinity' },
        { $type: 'number', value: '-Infinity' },
      ];
      await verify('wam-global-admission-v1', 'canWriteGlobal', [
        ...accepted.map((value, index): Probe => ({
          id: `accepted-${index}`,
          args: [value],
          expected: true,
        })),
        { id: 'numeric-nan', args: [nan], expected: false },
      ]);
    });

    test('integer event admission uses coercive NaN checks and skips absent fields', async () => {
      const accepted: JsonValue[] = [
        0,
        1,
        -1,
        0.5,
        '12',
        '',
        false,
        true,
        null,
        undefinedValue,
        [],
        { $type: 'number', value: 'Infinity' },
      ];
      const rejected: JsonValue[] = [nan, 'not-a-number', {}, [1, 2]];
      await verify('wam-event-int-admission-v1', 'canWriteEvent', [
        ...accepted.map((value, index): Probe => ({
          id: `int-accepted-${index}`,
          args: [[7, 0, value]],
          expected: true,
        })),
        ...rejected.map((value, index): Probe => ({
          id: `int-rejected-${index}`,
          args: [[7, 0, value]],
          expected: false,
        })),
        { id: 'empty-event', args: [[]], expected: true },
        {
          id: 'trailing-absent',
          args: [[7, 0, 2, 8, 0, null, 9, 0, undefinedValue]],
          expected: true,
        },
        {
          id: 'earlier-invalid-before-trailing-absent',
          args: [[7, 0, nan, 8, 0, null]],
          expected: false,
        },
        { id: 'later-invalid', args: [[7, 0, 2, 8, 0, nan]], expected: false },
        {
          id: 'bigint-coercion-error',
          args: [[7, 0, { $type: 'BigInt', value: '1' }]],
          throws: { name: 'TypeError' },
        },
      ]);
    });

    test('non-integer field types do not inherit integer validation', async () => {
      const probes: Probe[] = [];
      for (const type of [1, 2, 3, 4, -1]) {
        for (const [index, value] of [nan, {}, 'bad', false].entries()) {
          probes.push({
            id: `type-${type}-value-${index}`,
            args: [[9, type, value]],
            expected: true,
          });
        }
      }
      await verify('wam-event-non-int-admission-v1', 'canWriteEvent', probes);
    });
    test('headers, metadata and finalization preserve real buffer state', async () => {
      for (const [channel, byte] of [
        ['regular', 0],
        ['realtime', 1],
        ['private', 2],
        ['unknown', 2],
      ] as const) {
        await verify(
          `wam-header-${channel}-v1`,
          'WamBuffer',
          [
            {
              id: 'header',
              method: 'peek',
              args: [],
              expected: bytes([87, 65, 77, 5, 7, 52, 18, byte]),
            },
            {
              id: 'key',
              method: 'getKey',
              args: [],
              expected: { streamId: 7, sequenceNumber: 4660, channel },
            },
            { id: 'size', method: 'getSize', args: [], expected: 8 },
            { id: 'empty', method: 'hasEvents', args: [], expected: false },
            { id: 'initial-finalized', method: 'isFinalized', args: [], expected: false },
            { id: 'finalize', method: 'finalize', args: [], expected: undefinedValue },
            { id: 'finalized', method: 'isFinalized', args: [], expected: true },
            { id: 'finalize-again', method: 'finalize', args: [], expected: undefinedValue },
            {
              id: 'unchanged-header',
              method: 'peek',
              args: [],
              expected: bytes([87, 65, 77, 5, 7, 52, 18, byte]),
            },
          ],
          { args: [channel, 7, 4660, []] },
        );
      }
    });

    test('integer widths and signed boundaries match independent literal wire vectors', async () => {
      const vectors: [number, number[]][] = [
        [0, [16, 9]],
        [1, [32, 9]],
        [-1, [48, 9, 255]],
        [-128, [48, 9, 128]],
        [127, [48, 9, 127]],
        [-129, [64, 9, 127, 255]],
        [128, [64, 9, 128, 0]],
        [-32768, [64, 9, 0, 128]],
        [32767, [64, 9, 255, 127]],
        [-32769, [80, 9, 255, 127, 255, 255]],
        [32768, [80, 9, 0, 128, 0, 0]],
        [-2147483648, [80, 9, 0, 0, 0, 128]],
        [2147483647, [80, 9, 255, 255, 255, 127]],
        [-2147483649, [96, 9, 255, 255, 255, 127, 255, 255, 255, 255]],
        [2147483648, [96, 9, 0, 0, 0, 128, 0, 0, 0, 0]],
        [4294967296, [96, 9, 0, 0, 0, 0, 1, 0, 0, 0]],
      ];
      for (const [value, encoded] of vectors) {
        await verify(
          `wam-integer-${value}-v1`,
          'WamBuffer',
          [
            { id: 'write', method: 'writeGlobal', args: [9, value], expected: undefinedValue },
            { id: 'bytes', method: 'peek', args: [], expected: bytes([...header, ...encoded]) },
            { id: 'size', method: 'getSize', args: [], expected: header.length + encoded.length },
            { id: 'globals-are-not-events', method: 'hasEvents', args: [], expected: false },
          ],
          emptyBuffer,
        );
      }
    });

    test('null, boolean and extended field identifiers use distinct records', async () => {
      await verify(
        'wam-global-record-types-v1',
        'WamBuffer',
        [
          { id: 'null', method: 'writeGlobal', args: [255, null], expected: undefinedValue },
          { id: 'false', method: 'writeGlobal', args: [256, false], expected: undefinedValue },
          { id: 'true', method: 'writeGlobal', args: [65535, true], expected: undefinedValue },
          {
            id: 'wire',
            method: 'peek',
            args: [],
            expected: bytes([...header, 0, 255, 24, 0, 1, 40, 255, 255]),
          },
          {
            id: 'object-error',
            method: 'writeGlobal',
            args: [9, {}],
            throws: { name: 'Error', message: 'Incorrect value type object' },
          },
        ],
        emptyBuffer,
      );
    });

    test('UTF-8 string length widths follow encoded bytes at allocation boundaries', async () => {
      for (const length of [0, 1, 3, 255, 256, 257, 65535, 65536, 65537]) {
        const prefix =
          length < 256
            ? [128, 9, length]
            : length < 65536
              ? [144, 9, length & 255, length >>> 8]
              : [160, 9, length & 255, (length >>> 8) & 255, (length >>> 16) & 255, 0];
        await verify(
          `wam-string-${length}-v1`,
          'WamBuffer',
          [
            {
              id: 'write',
              method: 'writeGlobal',
              args: [9, 'x'.repeat(length)],
              expected: undefinedValue,
            },
            ...(length < 65535
              ? [
                  {
                    id: 'wire',
                    method: 'peek',
                    args: [],
                    expected: bytes([...header, ...prefix, ...Array.from({ length }, () => 120)]),
                  } as Probe,
                ]
              : [
                  {
                    id: 'large-record-size',
                    method: 'getSize',
                    args: [],
                    expected: header.length + prefix.length + length,
                  } as Probe,
                ]),
          ],
          emptyBuffer,
        );
      }
      await verify(
        'wam-unicode-string-v1',
        'WamBuffer',
        [
          { id: 'write', method: 'writeGlobal', args: [9, 'é😀'], expected: undefinedValue },
          {
            id: 'wire',
            method: 'peek',
            args: [],
            expected: bytes([...header, 128, 9, 6, 195, 169, 240, 159, 152, 128]),
          },
        ],
        emptyBuffer,
      );
    });

    test('events encode timestamp, final field flags, typed payload and skipped nulls', async () => {
      await verify(
        'wam-event-record-v1',
        'WamBuffer',
        [
          {
            id: 'write',
            method: 'writeEvent',
            args: [1234, 300, [1, 0, -1, 2, 1, true, 3, 2, 'a', 4, 3, 1.5, 5, 0, null], 1],
            expected: undefinedValue,
          },
          {
            id: 'wire',
            method: 'peek',
            args: [],
            expected: bytes([
              ...header,
              32,
              47,
              41,
              44,
              1,
              50,
              1,
              255,
              34,
              2,
              130,
              3,
              1,
              97,
              118,
              4,
              0,
              0,
              0,
              0,
              0,
              0,
              248,
              63,
            ]),
          },
          { id: 'events', method: 'hasEvents', args: [], expected: true },
          { id: 'size', method: 'getSize', args: [], expected: 32 },
        ],
        emptyBuffer,
      );
      await verify(
        'wam-empty-event-v1',
        'WamBuffer',
        [
          {
            id: 'write',
            method: 'writeEvent',
            args: [999, 5, [1, 0, null], 0],
            expected: undefinedValue,
          },
          { id: 'wire', method: 'peek', args: [], expected: bytes([...header, 16, 47, 21, 5]) },
          { id: 'events', method: 'hasEvents', args: [], expected: true },
        ],
        emptyBuffer,
      );
    });
    test('actual writers reject fractional, non-finite and overflowing values', async () => {
      await verify(
        'wam-writer-invalid-values-v1',
        'WamBuffer',
        [
          { id: 'fractional', method: 'writeGlobal', args: [9, 0.5], throws: { name: 'Error' } },
          { id: 'nan', method: 'writeGlobal', args: [9, nan], throws: { name: 'Error' } },
          {
            id: 'infinity',
            method: 'writeGlobal',
            args: [9, { $type: 'number', value: 'Infinity' }],
            throws: { name: 'Error' },
          },
          {
            id: 'signed64-overflow',
            method: 'writeGlobal',
            args: [9, 9223372036854775808],
            throws: { name: 'Error' },
          },
          { id: 'negative-field', method: 'writeGlobal', args: [-1, 0], throws: { name: 'Error' } },
          {
            id: 'overflow-field',
            method: 'writeGlobal',
            args: [65536, 0],
            throws: { name: 'Error' },
          },
        ],
        emptyBuffer,
      );
    });
  },
);
