import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const byteView = (value: number[]): JsonValue => ({ $type: 'Uint8Array', value });
const schema = (
  internalSpec: Record<string, JsonValue>,
  internalDefaults?: JsonValue,
): JsonValue => ({
  internalSpec,
  ...(internalDefaults ? { internalDefaults } : {}),
});
const makeCase = (id: string, module: string, exported: string, probes: Probe[]): BehaviorCase => ({
  schemaVersion: 1,
  id,
  version: 1,
  module,
  export: exported,
  probes,
});
const babelHelpers = ['extends', 'taggedTemplateLiteralLoose'] as const;
const codecContext = {
  stubs: [{ module: 'cr:6640', exports: null }],
  context: { babelHelpers: [...babelHelpers] },
};

/** Source-defined types and all eight combinations of the three independent flags. */
export function protobufUtilityCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const encodings = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 5, 5, 5, 2];
  for (const [exported, expected] of [
    ['typeToEncType', (type: number, flags: number) => (flags & 128 ? 2 : encodings[type - 1]!)],
    ['isMessageType', (type: number) => type === 14],
    ['isRepeatedField', (_type: number, flags: number) => Boolean(flags & 64)],
    ['isStringType', (type: number) => type === 12],
  ] as const) {
    const probes: Probe[] = [];
    for (const flags of [0, 64, 128, 192, 256, 320, 384, 448])
      for (let type = 1; type <= 18; type++)
        probes.push({
          id: `type-${type}-flags-${flags}`,
          args: [type | flags],
          expected: expected(type, flags),
        });
    for (let offset = 0; offset < probes.length; offset += 72)
      cases.push(
        makeCase(
          `protobuf-utils-${exported.toLowerCase()}-${offset}-v1`,
          'WAProtoUtils',
          exported,
          probes.slice(offset, offset + 72),
        ),
      );
  }
  return cases;
}

export function protobufCompileCases(): BehaviorCase[] {
  const child = schema({ value: [1, 12] });
  const compiled = {
    names: ['count', 'enabled', 'text', 'child', 'enum', 'mapping'],
    fields: [1, 2, 3, 4, 5, 6],
    types: [1, 7, 12, 14, 8, 18],
    defaults: [9, absent, 'default', absent, absent, absent],
    meta: [null, null, null, child, { '0': true, '2': true }, [12, 1]],
    oneofToFields: { choice: ['enabled', 'text'] },
    fieldToOneof: { enabled: ['choice'], text: ['choice'] },
    reservedTags: {},
    reservedFields: {},
  };
  return [
    makeCase('protobuf-compile-spec-v1', 'WAProtoCompile', 'compileSpec', [
      {
        id: 'sorted-fields-defaults-enum-map-oneof',
        args: [
          schema(
            {
              text: [3, 12],
              enabled: [2, 7],
              count: [1, 1],
              child: [4, 14, child],
              enum: [5, 8, { ZERO: 0, TWO: 2 }],
              mapping: [6, 18, [12, 1]],
              __oneofs__: { choice: ['enabled', 'text'] },
            },
            { count: 9, text: 'default' },
          ),
        ],
        expected: compiled,
      },
      {
        id: 'empty-spec',
        args: [schema({})],
        expected: {
          names: [],
          fields: [],
          types: [],
          defaults: [],
          meta: [],
          oneofToFields: {},
          fieldToOneof: {},
          reservedTags: {},
          reservedFields: {},
        },
      },
      {
        id: 'existing-cache-returned',
        args: [{ internalCompiledSpec: { sentinel: 'cached' } }],
        expected: { sentinel: 'cached' },
      },
      {
        id: 'missing-spec',
        args: [{}],
        throws: {
          name: 'Error',
          message: 'Message Class [object Object] does not have internalSpec',
        },
      },
      {
        id: 'missing-field-descriptor',
        args: [schema({ broken: null })],
        throws: { name: 'Error', message: 'fieldData of broken is missing' },
      },
      {
        id: 'map-descriptor-too-short',
        args: [schema({ mapping: [1, 18] })],
        throws: {
          name: 'Error',
          message: 'Map field mapping should have exactly three elements in its internalSpec',
        },
      },
      {
        id: 'map-descriptor-too-long',
        args: [schema({ mapping: [1, 18, [12, 1], 'extra'] })],
        throws: {
          name: 'Error',
          message: 'Map field mapping should have exactly three elements in its internalSpec',
        },
      },
    ]),
  ];
}

interface WireVector {
  id: string;
  descriptor: JsonValue;
  value: JsonValue;
  wire: number[];
  decoded?: JsonValue;
}
const vectors: WireVector[] = [
  { id: 'int32-150', descriptor: [1, 1], value: 150, wire: [8, 150, 1] },
  {
    id: 'int64-negative',
    descriptor: [1, 2],
    value: -1,
    wire: [8, 255, 255, 255, 255, 255, 255, 255, 255, 255, 1],
  },
  {
    id: 'uint64-max-hex',
    descriptor: [1, 4],
    value: '0xffffffffffffffff',
    wire: [8, 255, 255, 255, 255, 255, 255, 255, 255, 255, 1],
  },
  { id: 'sint64-negative', descriptor: [1, 6], value: -150, wire: [8, 171, 2] },
  { id: 'enum', descriptor: [1, 8, { ZERO: 0, TWO: 2 }], value: 2, wire: [8, 2] },
  {
    id: 'int32-negative',
    descriptor: [1, 1],
    value: -1,
    wire: [8, 255, 255, 255, 255, 255, 255, 255, 255, 255, 1],
  },
  {
    id: 'uint32-maximum',
    descriptor: [1, 3],
    value: 4294967295,
    wire: [8, 255, 255, 255, 255, 15],
  },
  { id: 'sint32-minus-one', descriptor: [1, 5], value: -1, wire: [8, 1] },
  {
    id: 'sint32-minimum',
    descriptor: [1, 5],
    value: -2147483648,
    wire: [8, 255, 255, 255, 255, 15],
  },
  { id: 'bool-true', descriptor: [1, 7], value: true, wire: [8, 1] },
  { id: 'bool-false', descriptor: [1, 7], value: false, wire: [8, 0] },
  { id: 'fixed64', descriptor: [1, 9], value: 4294967296, wire: [9, 0, 0, 0, 0, 1, 0, 0, 0] },
  {
    id: 'sfixed64-negative',
    descriptor: [1, 10],
    value: -1,
    wire: [9, 255, 255, 255, 255, 255, 255, 255, 255],
  },
  { id: 'double', descriptor: [1, 11], value: 1.5, wire: [9, 0, 0, 0, 0, 0, 0, 248, 63] },
  { id: 'string', descriptor: [1, 12], value: 'é😀', wire: [10, 6, 195, 169, 240, 159, 152, 128] },
  { id: 'empty-string', descriptor: [1, 12], value: '', wire: [10, 0] },
  {
    id: 'bytes',
    descriptor: [1, 13],
    value: byteView([0, 127, 128, 255]),
    wire: [10, 4, 0, 127, 128, 255],
    decoded: { $type: 'ArrayBuffer', value: [0, 127, 128, 255] },
  },
  { id: 'fixed32', descriptor: [1, 15], value: 305419896, wire: [13, 120, 86, 52, 18] },
  { id: 'sfixed32', descriptor: [1, 16], value: -1, wire: [13, 255, 255, 255, 255] },
  { id: 'float', descriptor: [1, 17], value: 1.5, wire: [13, 0, 0, 192, 63] },
  { id: 'repeated', descriptor: [1, 65], value: [1, 150], wire: [8, 1, 8, 150, 1] },
  { id: 'packed', descriptor: [1, 193], value: [1, 150], wire: [10, 3, 1, 150, 1] },
  { id: 'empty-packed', descriptor: [1, 193], value: [], wire: [] },
  {
    id: 'nested',
    descriptor: [1, 14, schema({ text: [1, 12] })],
    value: { text: 'a' },
    wire: [10, 3, 10, 1, 97],
    decoded: { text: 'a', $$unknownFieldCount: 0 },
  },
];

export function protobufEncodeCases(): BehaviorCase[] {
  const cases = vectors.map(({ id, descriptor, value, wire }) => ({
    ...makeCase(`protobuf-encode-${id}-v1`, 'encodeProtobuf', 'encodeProtobuf', [
      {
        id: 'literal-wire',
        args: [schema({ value: descriptor }), { value }],
        result: { method: 'readByteArrayView' },
        expected: byteView(wire),
      },
    ]),
    ...codecContext,
  }));
  cases.push({
    ...makeCase('protobuf-encode-schema-behavior-v1', 'encodeProtobuf', 'encodeProtobuf', [
      {
        id: 'defaults-encoded',
        args: [schema({ value: [1, 1] }, { value: 150 }), {}],
        result: { method: 'readByteArrayView' },
        expected: byteView([8, 150, 1]),
      },
      {
        id: 'missing-optional',
        args: [schema({ value: [1, 1] }), {}],
        result: { method: 'readByteArrayView' },
        expected: byteView([]),
      },
      {
        id: 'map-string-int',
        args: [schema({ value: [1, 18, [12, 1]] }), { value: [['a', 150]] }],
        result: { method: 'readByteArrayView' },
        expected: byteView([10, 6, 10, 1, 97, 16, 150, 1]),
      },
      {
        id: 'required-missing',
        args: [schema({ value: [1, 257] }), {}],
        throws: { name: 'TypeError', message: 'Message missing required value value' },
      },
      {
        id: 'invalid-int',
        args: [schema({ value: [1, 1] }), { value: 0.5 }],
        throws: { name: 'TypeError', message: 'Invalid value at value: value must be an int' },
      },
      {
        id: 'invalid-bool',
        args: [schema({ value: [1, 7] }), { value: 1 }],
        throws: { name: 'TypeError', message: 'Invalid value at value: value is invalid' },
      },
      {
        id: 'invalid-repeated',
        args: [schema({ value: [1, 65] }), { value: 7 }],
        throws: {
          name: 'TypeError',
          message: 'Invalid value at value: repeated field must be array',
        },
      },
      {
        id: 'invalid-oneof',
        args: [
          schema({ a: [1, 1], b: [2, 1], __oneofs__: { choice: ['a', 'b'] } }),
          { a: 1, b: 2 },
        ],
        throws: {
          name: 'TypeError',
          message: "Invalid value at choice: oneof 'choice' has fields 'a' and 'b' set",
        },
      },
    ]),
    ...codecContext,
  });
  return cases;
}

export function protobufDecodeCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  for (const enabled of [false, true]) {
    const context = { gates: { knobs: { '2451': enabled } }, babelHelpers: [...babelHelpers] };
    cases.push({
      ...makeCase(`protobuf-decode-knob-reread-${enabled}-v1`, 'decodeProtobuf', 'decodeProtobuf', [
        {
          id: 'before',
          args: [schema({ value: [1, 1] }), byteView([8, 1])],
          expected: { value: 1, $$unknownFieldCount: 0 },
        },
        {
          id: 'after',
          args: [schema({ value: [1, 1] }), byteView([8, 2])],
          expected: { value: 2, $$unknownFieldCount: 0 },
        },
      ]),
      ...codecContext,
      context: {
        ...context,
        gateUpdates: [{ beforeProbe: 'after', gates: { knobs: { '2451': !enabled } } }],
      },
    });
    cases.push({
      ...makeCase(
        `protobuf-decode-literals-depth-${enabled}-v1`,
        'decodeProtobuf',
        'decodeProtobuf',
        vectors.map(({ id, descriptor, value, wire, decoded }) => ({
          id,
          args: [schema({ value: descriptor }), byteView(wire)],
          expected: { value: decoded ?? value, $$unknownFieldCount: 0 },
        })),
      ),
      ...codecContext,
      context,
    });
    cases.push({
      ...makeCase(
        `protobuf-decode-errors-depth-${enabled}-v1`,
        'decodeProtobuf',
        'decodeProtobuf',
        [
          {
            id: 'wire-mismatch',
            args: [schema({ value: [1, 1] }), byteView([10, 0])],
            throws: { name: 'Error', message: 'FormatError: value encoded with wire type 2' },
          },
          {
            id: 'truncated-varint',
            args: [schema({ value: [1, 1] }), byteView([8, 128])],
            throws: { name: 'Error' },
          },
          {
            id: 'truncated-fixed32',
            args: [schema({ value: [1, 15] }), byteView([13, 1, 2, 3])],
            throws: { name: 'Error' },
          },
          {
            id: 'truncated-string',
            args: [schema({ value: [1, 12] }), byteView([10, 4, 97])],
            throws: { name: 'Error' },
          },
          {
            id: 'required-missing',
            args: [schema({ value: [1, 257] }), byteView([])],
            throws: { name: 'TypeError', message: 'Message missing required value value' },
          },
          {
            id: 'unknown-varint-skipped',
            args: [schema({ value: [1, 1] }), byteView([16, 150, 1, 8, 7])],
            expected: { value: 7, $$unknownFieldCount: 1 },
          },
          {
            id: 'last-singular-wins',
            args: [schema({ value: [1, 1] }), byteView([8, 1, 8, 2])],
            expected: { value: 2, $$unknownFieldCount: 0 },
          },
        ],
      ),
      ...codecContext,
      context,
    });
  }
  return cases;
}

/** Independent length-delimited field builder; no archived encoder supplies this oracle. */
function unsignedVarint(value: number): number[] {
  const bytes: number[] = [];
  do {
    const next = value % 128;
    value = Math.floor(value / 128);
    bytes.push(next | (value ? 128 : 0));
  } while (value);
  return bytes;
}

function nestedMessage(depth: number, repeated: boolean) {
  let descriptor = schema({ value: [1, 1] });
  let wire = [8, 7];
  let decoded: JsonValue = { value: 7, $$unknownFieldCount: 0 };
  for (let level = 0; level < depth; level++) {
    descriptor = schema({ value: [1, repeated ? 78 : 14, descriptor] });
    wire = [10, ...unsignedVarint(wire.length), ...wire];
    decoded = { value: repeated ? [decoded] : decoded, $$unknownFieldCount: 0 };
  }
  return { descriptor, wire, decoded };
}

/** Both selected revisions reject entry at depth100 only while knob2451 is enabled. */
export function protobufRecursionCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const depths = [0, 1, 2, 8, 31, 63, 98, 99, 100, 101, 120];
  for (const repeated of [false, true]) {
    const mode = repeated ? 'repeated' : 'singular';
    const probe = (id: string, depth: number, enabled: boolean): Probe => {
      const { descriptor, wire, decoded } = nestedMessage(depth, repeated);
      return {
        id,
        args: [descriptor, byteView(wire)],
        ...(enabled && depth >= 100
          ? {
              throws: {
                name: 'Error',
                message: 'FormatError: protobuf nesting depth exceeded limit of 100',
              },
            }
          : { expected: decoded }),
      };
    };
    for (const enabled of [false, true]) {
      cases.push({
        ...makeCase(
          `protobuf-decode-recursion-${mode}-${enabled}-v1`,
          'decodeProtobuf',
          'decodeProtobuf',
          depths.map((depth) => probe(`depth-${depth}`, depth, enabled)),
        ),
        ...codecContext,
        context: {
          babelHelpers: [...babelHelpers],
          gates: { knobs: { '2451': enabled } },
        },
      });
      cases.push({
        ...makeCase(
          `protobuf-decode-recursion-transition-${mode}-${enabled}-v1`,
          'decodeProtobuf',
          'decodeProtobuf',
          [
            probe('initial', 100, enabled),
            probe('changed', 100, !enabled),
            probe('restored', 100, enabled),
          ],
        ),
        ...codecContext,
        context: {
          babelHelpers: [...babelHelpers],
          gates: { knobs: { '2451': enabled } },
          gateUpdates: [
            { beforeProbe: 'changed', gates: { knobs: { '2451': !enabled } } },
            { beforeProbe: 'restored', gates: { knobs: { '2451': enabled } } },
          ],
        },
      });
    }
  }
  return cases;
}
