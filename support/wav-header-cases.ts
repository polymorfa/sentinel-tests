import { Buffer } from 'node:buffer';
import type { BehaviorCase, JsonValue, Probe } from './types.ts';
export const wavBuffer = (value: number[]): JsonValue => ({ $type: 'ArrayBuffer', value });
export function wavHeaderFixture(channels: number, rate: number, length = 44): number[] {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(0, 28);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  return Array.from(
    Buffer.concat([header, Buffer.alloc(Math.max(0, length - 44), 165)]).subarray(0, length),
  );
}
const observed = (numChannels: number, sampleRate: number): JsonValue => ({
  numChannels,
  sampleRate,
});
const call = (id: string, api: string, arg: JsonValue, expected: JsonValue): Probe => ({
  id,
  export: api,
  args: [arg],
  expected,
});
export function wavHeaderCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const add = (family: string, probes: Probe[]) => {
    let page: Probe[] = [],
      index = 0;
    const flush = () => {
      if (!page.length) return;
      cases.push({
        schemaVersion: 1,
        id: `wav-header-${family}-${index++}-v1`,
        version: 1,
        module: 'WAParseWav',
        export: 'validateWav',
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
  const channels = [0, 1, 2, 3, 7, 8, 15, 16, 127, 128, 255, 256, 32767, 32768, 65534, 65535];
  const rates = [
    0, 1, 2, 8000, 11025, 16000, 22050, 44100, 48000, 96000, 192000, 65535, 65536, 2147483647,
    2147483648, 4294967295,
  ];
  const fields: Probe[] = [];
  for (const channel of channels)
    for (const rate of rates) {
      const data = wavHeaderFixture(channel, rate),
        label = `channels-${channel}-rate-${rate}`;
      fields.push(
        call(`${label}-validate`, 'validateWav', wavBuffer(data), wavBuffer(data)),
        call(`${label}-parse`, 'parseWav', wavBuffer(data), observed(channel, rate)),
      );
    }
  add('fields', fields);
  const baseline = wavHeaderFixture(513, 48000),
    retry = (probes: Probe[], id: string, api: string) =>
      probes.push(
        call(
          `${id}-retry`,
          api,
          wavBuffer(baseline),
          api === 'validateWav' ? wavBuffer(baseline) : observed(513, 48000),
        ),
      );
  const lengths: Probe[] = [];
  for (let length = 0; length < 44; length++) {
    const data = wavHeaderFixture(513, 48000, length);
    if (length > 0) data[0] = 0;
    lengths.push(call(`length-${length}-validate`, 'validateWav', wavBuffer(data), null));
    if (length < 28) {
      const id = `length-${length}-parse`;
      lengths.push({
        id,
        export: 'parseWav',
        args: [wavBuffer(data)],
        throws: { name: 'RangeError' },
      });
      retry(lengths, id, 'parseWav');
    } else
      lengths.push(
        call(`length-${length}-parse`, 'parseWav', wavBuffer(data), observed(513, 48000)),
      );
  }
  add('short-lengths', lengths);
  const larger: Probe[] = [];
  for (const length of [44, 45, 63, 64, 65, 127, 128, 129, 1024, 4097]) {
    const data = wavHeaderFixture(65535, 4294967295, length);
    larger.push(
      call(`length-${length}-validate`, 'validateWav', wavBuffer(data), wavBuffer(data)),
      call(`length-${length}-parse`, 'parseWav', wavBuffer(data), observed(65535, 4294967295)),
    );
  }
  add('larger-lengths', larger);
  const magic: Probe[] = [];
  for (const position of [0, 1, 2, 3, 8, 9, 10, 11])
    for (let bit = 0; bit < 8; bit++) {
      const data = [...baseline];
      data[position] = data[position]! ^ (1 << bit);
      const id = `position-${position}-bit-${bit}`;
      magic.push(
        call(`${id}-validate`, 'validateWav', wavBuffer(data), null),
        call(`${id}-parse`, 'parseWav', wavBuffer(data), observed(513, 48000)),
      );
    }
  add('magic-bit-flips', magic);
  const permissive: Probe[] = [];
  for (let position = 0; position < 44; position++)
    if (![0, 1, 2, 3, 8, 9, 10, 11].includes(position))
      for (let bit = 0; bit < 8; bit++) {
        const data = [...baseline];
        data[position] = data[position]! ^ (1 << bit);
        const channel =
          position === 22 || position === 23
            ? Number(513n ^ (1n << BigInt((position - 22) * 8 + bit)))
            : 513;
        const rate =
          position >= 24 && position <= 27
            ? Number(48000n ^ (1n << BigInt((position - 24) * 8 + bit)))
            : 48000;
        const id = `position-${position}-bit-${bit}`;
        permissive.push(
          call(`${id}-validate`, 'validateWav', wavBuffer(data), wavBuffer(data)),
          call(`${id}-parse`, 'parseWav', wavBuffer(data), observed(channel, rate)),
        );
      }
  add('other-header-bit-flips', permissive);
  const wrong: JsonValue[] = [
    { $type: 'Uint8Array', value: baseline },
    [],
    null,
    { $type: 'undefined' },
    0,
    false,
    'RIFF',
    {},
    { $type: 'BigInt', value: '1' },
    { $type: 'Uint8Array', value: [238, ...baseline, 221], byteOffset: 1, byteLength: 44 },
  ];
  const brands: Probe[] = [];
  for (const api of ['validateWav', 'parseWav'])
    for (let i = 0; i < wrong.length; i++) {
      const id = `${api}-brand-${i}`;
      brands.push({ id, export: api, args: [wrong[i]!], throws: { name: 'TypeError' } });
      retry(brands, id, api);
    }
  add('wrong-brands', brands);
  add('returned-buffer-identity', [
    {
      ...call('validate-retain', 'validateWav', wavBuffer(baseline), wavBuffer(baseline)),
      retain: { id: 'validated', stage: 'call' },
    },
    {
      ...call(
        'validate-identical',
        'validateWav',
        { $type: 'reference', value: 'validated' },
        true,
      ),
      result: { identityWith: 'validated' },
    },
    call(
      'parse-validated',
      'parseWav',
      { $type: 'reference', value: 'validated' },
      observed(513, 48000),
    ),
  ]);
  return cases;
}
