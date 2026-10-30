import { Buffer } from 'node:buffer';
import type { JsonValue, Probe } from './types.ts';

export const paddingLengths = [1, 2, 3, 15, 16, 17, 31, 32, 33, 255, 256, 257];
export const offsets = [0, 1, 7];
const bytes = (value: number[]): JsonValue => ({ $type: 'Uint8Array', value });
const big = (value: bigint): JsonValue => ({ $type: 'BigInt', value: value.toString() });
const view = (value: number[], byteOffset: number): JsonValue => ({
  $type: 'Uint8Array',
  value: [...Array<number>(byteOffset).fill(0xee), ...value, 0xdd],
  byteOffset,
  byteLength: value.length,
});

export function paddingProbes(): Probe[] {
  const probes: Probe[] = offsets.map((offset) => ({
    id: `empty-offset-${offset}`,
    args: [view([], offset)],
    throws: { name: 'Error', message: 'unpadPkcs7 given empty bytes' },
  }));
  for (const length of paddingLengths)
    for (let pad = 0; pad <= 255; pad++)
      for (const offset of offsets) {
        const args = [view([...Array<number>(length - 1).fill(0xa5), pad], offset)];
        const id = `length-${length}-pad-${pad}-offset-${offset}`;
        if (pad > length)
          probes.push({
            id,
            args,
            throws: {
              name: 'Error',
              message: `unpadPkcs7 given ${length} bytes, but pad is ${pad}`,
            },
          });
        else
          probes.push({
            id,
            args,
            expected: bytes(
              pad === 0
                ? [...Array<number>(length - 1).fill(0xa5), 0]
                : Array<number>(length - pad).fill(0xa5),
            ),
          });
      }
  return probes;
}

/** Host Buffer/BigInt conversion is an independent radix oracle, not archived code. */
export function littleEndianProbes(): Probe[] {
  const values: number[][] = [[], [0], [1], [255], [0, 1], [1, 0], [0xff, 0xff]];
  for (let byte = 0; byte <= 255; byte++) values.push([byte], [byte, 255 - byte]);
  for (const length of [3, 7, 15, 31, 32, 33, 63, 64, 65])
    values.push(Array.from({ length }, (_, index) => (index * 37 + 11) % 256));
  return values.flatMap((value, index) =>
    offsets.map((offset) => ({
      id: `little-endian-${index}-offset-${offset}`,
      args: [view(value, offset)],
      expected: big(
        value.length ? BigInt(`0x${Buffer.from(value).reverse().toString('hex')}`) : 0n,
      ),
    })),
  );
}

export function fixedWidthProbes(): Probe[] {
  const values: bigint[] = [
    0n,
    1n,
    -1n,
    255n,
    256n,
    -256n,
    (1n << 255n) - 1n,
    1n << 255n,
    (1n << 256n) - 1n,
    1n << 256n,
    (1n << 256n) + 1n,
    -(1n << 256n) - 1n,
  ];
  for (let bit = 0n; bit <= 264n; bit++) values.push(1n << bit, -(1n << bit));
  return values.map((value, index) => ({
    id: `fixed-width-${index}`,
    args: [big(value)],
    expected: bytes(
      Array.from(
        Buffer.from(BigInt.asUintN(256, value).toString(16).padStart(64, '0'), 'hex'),
      ).reverse(),
    ),
  }));
}

export function hexProbes(): Probe[] {
  const probes: Probe[] = [];
  for (let byte = 0; byte <= 255; byte++) {
    const hex = byte.toString(16).padStart(2, '0');
    for (const [index, text] of [hex, hex.toUpperCase()].entries())
      probes.push({ id: `hex-byte-${byte}-case-${index}`, args: [text], expected: bytes([byte]) });
  }
  const rows: [string, number[]][] = [
    ['', []],
    ['000102feff', [0, 1, 2, 254, 255]],
    ['GG', [0]],
    ['fZ', [15]],
    ['Zf', [0]],
    ['-1', [255]],
    ['+f', [15]],
    [' 1', [1]],
    ['1 ', [1]],
    ['0x', [0]],
    ['0x10', [0, 16]],
    ['12zz34', [18, 0, 52]],
    ['\n1', [1]],
  ];
  for (const [index, [text, expected]] of rows.entries())
    probes.push({ id: `hex-malformed-${index}`, args: [text], expected: bytes(expected) });
  for (const [index, text] of ['0', 'abc', '12345', '😀x'].entries())
    probes.push({
      id: `hex-odd-${index}`,
      args: [text],
      throws: { name: 'Error', message: 'hexToU8: odd string length' },
    });
  return probes;
}
