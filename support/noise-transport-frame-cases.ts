import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const moduleName = 'WAWebHatchNoiseTransportFrameCodec';
const bytes = (value: number[]): JsonValue => ({ $type: 'Uint8Array', value });
const hex = (value: bigint): string => `0x${value.toString(16).padStart(16, '0')}`;
export const frameBytes = bytes;
export function unsignedVarint(value: bigint): number[] {
  if (value < 0n || value >= 1n << 64n) throw new Error('Authoring uint64 out of range');
  const digits: number[] = [];
  do {
    const digit = Number(value % 128n);
    value /= 128n;
    digits.push(digit + (value ? 128 : 0));
  } while (value);
  return digits;
}
export type FrameLiteral = {
  chunkId: string;
  chunkIndex: number;
  totalChunks: number;
  payload: number[];
};
/** Independent protobuf wire oracle: unsigned BigInt radix-128 and explicit field order. */
export function transportFrameWire(frame: FrameLiteral): number[] {
  const fields: number[][] = [];
  if (BigInt(frame.chunkId)) fields.push([8, ...unsignedVarint(BigInt(frame.chunkId))]);
  if (frame.chunkIndex) fields.push([16, ...unsignedVarint(BigInt(frame.chunkIndex))]);
  if (frame.totalChunks) fields.push([24, ...unsignedVarint(BigInt(frame.totalChunks))]);
  if (frame.payload.length)
    fields.push([34, ...unsignedVarint(BigInt(frame.payload.length)), ...frame.payload]);
  return fields.flat();
}
export function transportFrameRecord(frame: FrameLiteral): JsonValue {
  return {
    chunkId: frame.chunkId,
    chunkIndex: frame.chunkIndex,
    payload: bytes(frame.payload),
    totalChunks: frame.totalChunks,
  };
}
const zero = (): FrameLiteral => ({ chunkId: hex(0n), chunkIndex: 0, totalChunks: 0, payload: [] });
const call = (id: string, api: string, arg: JsonValue, expected: JsonValue): Probe => ({
  id,
  export: api,
  args: [arg],
  expected,
});
const input = (frame: FrameLiteral, payload: JsonValue = bytes(frame.payload)): JsonValue => ({
  ...frame,
  payload,
});
export function noiseTransportFrameCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const add = (family: string, probes: Probe[]) => {
    let page: Probe[] = [],
      index = 0;
    const flush = () => {
      if (!page.length) return;
      cases.push({
        schemaVersion: 1,
        id: `noise-transport-frame-${family}-${index++}-v1`,
        version: 1,
        module: moduleName,
        export: 'decodeTransportFrame',
        probes: page,
      });
      page = [];
    };
    for (let i = 0; i < probes.length; i++) {
      const group = [probes[i]!];
      if (probes[i + 1]?.id === `${probes[i]!.id}-retry`) group.push(probes[++i]!);
      if (
        page.length + group.length > 64 ||
        Buffer.byteLength(JSON.stringify([...page, ...group])) > 220_000
      )
        flush();
      page.push(...group);
    }
    flush();
  };
  const baseline: FrameLiteral = {
    chunkId: hex(128n),
    chunkIndex: 127,
    totalChunks: 128,
    payload: [0, 255, 128, 1],
  };
  const retry = (list: Probe[], id: string) =>
    list.push(
      call(
        `${id}-retry`,
        'decodeTransportFrame',
        bytes(transportFrameWire(baseline)),
        transportFrameRecord(baseline),
      ),
    );
  const fail = (list: Probe[], id: string, wire: number[], message?: string) => {
    list.push({
      id,
      export: 'decodeTransportFrame',
      args: [bytes(wire)],
      throws: { name: 'Error', ...(message ? { message } : {}) },
    });
    retry(list, id);
  };
  const numeric: Probe[] = [];
  const ids = [
    0n,
    1n,
    127n,
    128n,
    255n,
    16383n,
    16384n,
    0xffffffffn,
    0x100000000n,
    0x7fffffffffffffffn,
    0x8000000000000000n,
    0xffffffffffffffffn,
  ];
  const ints = [
    0, 1, 2, 127, 128, 129, 255, 256, 16383, 16384, 65535, 65536, 0x7fffffff, 0xffffffff,
  ];
  let ordinal = 0;
  for (const id of ids)
    for (const index of ints)
      for (const total of [0, 128, 0xffffffff]) {
        const frame: FrameLiteral = {
          chunkId: hex(id),
          chunkIndex: index,
          totalChunks: total,
          payload: [],
        };
        const wire = transportFrameWire(frame);
        const label = `numeric-${ordinal++}`;
        numeric.push(
          call(`${label}-encode`, 'encodeTransportFrame', input(frame), bytes(wire)),
          call(`${label}-decode`, 'decodeTransportFrame', bytes(wire), transportFrameRecord(frame)),
        );
      }
  add('numeric', numeric);
  const payloads: Probe[] = [];
  for (const length of [0, 1, 2, 7, 126, 127, 128, 129, 254, 255, 256, 257, 1023, 4097])
    for (const offset of [0, 1, 7]) {
      const data = Array.from({ length }, (_, i) => (i * 73 + length * 11) & 255);
      const frame = { ...baseline, payload: data };
      const view: JsonValue =
        offset === 0
          ? bytes(data)
          : {
              $type: 'Uint8Array',
              value: [...Array<number>(offset).fill(238), ...data, 221, 220],
              byteOffset: offset,
              byteLength: length,
            };
      const wire = transportFrameWire(frame),
        label = `payload-${length}-offset-${offset}`;
      payloads.push(
        call(`${label}-encode`, 'encodeTransportFrame', input(frame, view), bytes(wire)),
        call(`${label}-decode`, 'decodeTransportFrame', bytes(wire), transportFrameRecord(frame)),
      );
    }
  add('payload-views', payloads);
  const mismatches: Probe[] = [];
  for (const field of [1, 2, 3, 4])
    for (let wire = 0; wire < 8; wire++)
      if (wire !== (field === 4 ? 2 : 0))
        fail(
          mismatches,
          `field-${field}-wire-${wire}`,
          [field * 8 + wire],
          `WAWebHatchNoiseTransportFrameCodec: invalid wire for field ${field}`,
        );
  for (let wire = 0; wire < 8; wire++)
    fail(
      mismatches,
      `field-zero-wire-${wire}`,
      [wire],
      'WAWebHatchNoiseTransportFrameCodec: invalid field zero',
    );
  add('wire-mismatch', mismatches);
  const unknown: Probe[] = [];
  for (const field of [5, 15, 16, 2047])
    for (let wire = 0; wire < 8; wire++) {
      const tag = unsignedVarint(BigInt(field * 8 + wire)),
        label = `unknown-${field}-wire-${wire}`;
      if ([0, 1, 2, 5].includes(wire)) {
        const body =
          wire === 0
            ? unsignedVarint(0xffffffffffffffffn)
            : wire === 1
              ? [1, 2, 3, 4, 5, 6, 7, 8]
              : wire === 2
                ? [3, 9, 8, 7]
                : [1, 2, 3, 4];
        unknown.push(
          call(
            label,
            'decodeTransportFrame',
            bytes([...tag, ...body, ...transportFrameWire(baseline)]),
            transportFrameRecord(baseline),
          ),
        );
      } else
        fail(
          unknown,
          label,
          tag,
          `WAWebHatchNoiseTransportFrameCodec: ${wire === 3 || wire === 4 ? 'groups are unsupported' : 'unsupported wire type'}`,
        );
    }
  add('unknown-fields', unknown);
  const overflow: Probe[] = [];
  for (const value of [
    0x100000000n,
    0x100000001n,
    0x1ffffffffn,
    0x8000000000000000n,
    0xffffffffffffffffn,
  ])
    for (const tag of [null, 16, 24, 34])
      fail(
        overflow,
        `overflow-${value}-${tag}`,
        tag === null ? unsignedVarint(value) : [tag, ...unsignedVarint(value)],
        'WAWebHatchNoiseTransportFrameCodec: uint32 overflow',
      );
  for (const tag of [null, 8, 16, 24, 34, 40])
    for (const last of [2, 127, 128, 255])
      fail(
        overflow,
        `varint64-${tag}-${last}`,
        [...(tag === null ? [] : [tag]), ...Array<number>(9).fill(128), last],
        'ParseError: varint exceeds 64 bits',
      );
  add('overflow', overflow);
  const prefixes: Probe[] = [];
  for (const length of [1, 7, 128]) {
    const fields = [
      [8, ...unsignedVarint(0x100000000n)],
      [16, ...unsignedVarint(128n)],
      [24, ...unsignedVarint(16384n)],
      [34, ...unsignedVarint(BigInt(length)), ...Array.from({ length }, (_, i) => i & 255)],
    ];
    const full = fields.flat(),
      boundaries = [0];
    for (const field of fields) boundaries.push(boundaries.at(-1)! + field.length);
    for (let size = 0; size <= full.length; size++) {
      const complete = boundaries.indexOf(size),
        label = `payload-${length}-prefix-${size}`;
      if (complete >= 0) {
        const frame = zero();
        if (complete >= 1) frame.chunkId = hex(0x100000000n);
        if (complete >= 2) frame.chunkIndex = 128;
        if (complete >= 3) frame.totalChunks = 16384;
        if (complete === 4) frame.payload = Array.from({ length }, (_, i) => i & 255);
        prefixes.push(
          call(
            label,
            'decodeTransportFrame',
            bytes(full.slice(0, size)),
            transportFrameRecord(frame),
          ),
        );
      } else fail(prefixes, label, full.slice(0, size));
    }
  }
  add('prefix-truncation', prefixes);
  const invalid: Probe[] = [];
  const invalidNumbers: JsonValue[] = [
    -1,
    1.5,
    4294967296,
    { $type: 'number', value: 'NaN' },
    { $type: 'number', value: 'Infinity' },
    null,
    '1',
    { $type: 'undefined' },
  ];
  for (const field of ['chunkIndex', 'totalChunks'])
    for (let i = 0; i < invalidNumbers.length; i++) {
      invalid.push({
        id: `${field}-${i}`,
        export: 'encodeTransportFrame',
        args: [{ ...(input(baseline) as object), [field]: invalidNumbers[i]! } as JsonValue],
        throws: { name: 'Error', message: `WAWebHatchNoiseTransportFrameCodec: invalid ${field}` },
      });
      retry(invalid, `${field}-${i}`);
    }
  invalid.push({
    id: 'negative-chunk-id',
    export: 'encodeTransportFrame',
    args: [{ ...(input(baseline) as object), chunkId: '-0x0000000000000001' } as JsonValue],
    throws: { name: 'Error', message: 'WAWebHatchNoiseTransportFrameCodec: invalid chunkId' },
  });
  retry(invalid, 'negative-chunk-id');
  for (const [label, chunkIndex, totalChunks, errorField] of [
    ['index-first', -1, -1, 'chunkIndex'],
    ['total-second', 0, -1, 'totalChunks'],
    ['id-third', 0, 0, 'chunkId'],
  ] as const) {
    const id = `guard-order-${label}`;
    invalid.push({
      id,
      export: 'encodeTransportFrame',
      args: [{ chunkId: '-0x0000000000000001', chunkIndex, totalChunks, payload: null }],
      throws: {
        name: 'Error',
        message: `WAWebHatchNoiseTransportFrameCodec: invalid ${errorField}`,
      },
    });
    invalid.push(
      call(
        `${id}-retry`,
        'encodeTransportFrame',
        input(baseline),
        bytes(transportFrameWire(baseline)),
      ),
    );
  }
  for (const probe of invalid)
    if (probe.id.endsWith('-retry')) {
      probe.export = 'encodeTransportFrame';
      probe.args = [input(baseline)];
      probe.expected = bytes(transportFrameWire(baseline));
    }
  add('encode-errors', invalid);
  const encoded = transportFrameWire(baseline);
  add('returned-composition', [
    {
      ...call('encode-retained', 'encodeTransportFrame', input(baseline), bytes(encoded)),
      retain: { id: 'encoded', stage: 'call' },
    },
    {
      ...call(
        'decode-retained',
        'decodeTransportFrame',
        { $type: 'reference', value: 'encoded' },
        transportFrameRecord(baseline),
      ),
      retain: { id: 'decoded', stage: 'call' },
    },
    {
      ...call(
        'decode-distinct',
        'decodeTransportFrame',
        { $type: 'reference', value: 'encoded' },
        false,
      ),
      result: { identityWith: 'decoded' },
    },
    {
      ...call('encode-distinct', 'encodeTransportFrame', input(baseline), false),
      result: { identityWith: 'encoded' },
    },
  ]);
  // Draft source-assignment characterization: duplicates overwrite, including an empty payload.
  const duplicates: Probe[] = [];
  const fieldParts = [
    [8, ...unsignedVarint(128n)],
    [16, 127],
    [24, ...unsignedVarint(128n)],
    [34, 4, 0, 255, 128, 1],
  ];
  for (const field of [1, 2, 3, 4])
    for (const last of [0, 1, 129])
      for (const before of [false, true]) {
        const replacement =
          field === 4
            ? [34, ...unsignedVarint(BigInt(last)), ...Array<number>(last).fill(7)]
            : [field * 8, ...unsignedVarint(BigInt(last))];
        const frame = { ...baseline };
        if (!before) {
          if (field === 1) frame.chunkId = hex(BigInt(last));
          if (field === 2) frame.chunkIndex = last;
          if (field === 3) frame.totalChunks = last;
          if (field === 4) frame.payload = Array<number>(last).fill(7);
        }
        duplicates.push(
          call(
            `duplicate-${field}-${last}-${before ? 'before' : 'after'}`,
            'decodeTransportFrame',
            bytes(
              before
                ? [...replacement, ...transportFrameWire(baseline)]
                : [...transportFrameWire(baseline), ...replacement],
            ),
            transportFrameRecord(frame),
          ),
        );
      }
  for (const a of [0, 1, 2, 3])
    for (const b of [0, 1, 2, 3])
      for (const c of [0, 1, 2, 3])
        for (const d of [0, 1, 2, 3])
          if (new Set([a, b, c, d]).size === 4)
            duplicates.push(
              call(
                `order-${a}${b}${c}${d}`,
                'decodeTransportFrame',
                bytes([a, b, c, d].flatMap((i) => fieldParts[i]!)),
                transportFrameRecord(baseline),
              ),
            );
  for (let n = 0; n < 16; n++) {
    const replacement = [16, ...unsignedVarint(BigInt(n))];
    duplicates.push(
      call(
        `mixed-unknown-${n}`,
        'decodeTransportFrame',
        bytes([42, 2, 255, n, ...transportFrameWire(baseline), ...replacement, 48, 0, 34, 0]),
        transportFrameRecord({ ...baseline, chunkIndex: n, payload: [] }),
      ),
    );
  }
  add('duplicate-assignment-drafts', duplicates);
  return cases;
}
