import type { BehaviorCase, Probe, JsonValue } from './types.ts';
const canonical = 'WACryptoCurveKeyCanonicalCheck',
  transform = 'WACryptoCurveTransformations',
  ops = 'WACryptoCurveEd25519PointOps';
const bytes = (hex: string): JsonValue => ({
  $type: 'Uint8Array',
  value: Array.from(Buffer.from(hex, 'hex')),
});
const b = (value: bigint): JsonValue => ({ $type: 'BigInt', value: value.toString() });
const le = (n: bigint) => n.toString(16).padStart(64, '0').match(/../g)!.reverse().join('');
const P = 2n ** 255n - 19n;
const x = 15112221349535400772501151409588531511454012693041857206046113283949847762202n;
const y = 46316835694926478169428394003475163141307993866256225615783033603165251855960n;
const identity = { X: b(0n), Y: b(1n), Z: b(1n), T: b(0n) };
const point = { X: b(x), Y: b(y), Z: b(1n), T: b((x * y) % P) };
const call = (
  id: string,
  exp: string,
  args: JsonValue[],
  expected: JsonValue,
  module = canonical,
): Probe => ({ id, module, export: exp, args, expected });
export function curveKeyPolicyCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const make = (name: string, probes: Probe[]) =>
    cases.push({
      schemaVersion: 1,
      id: `curve-key-policy-${name}-v1`,
      version: 1,
      module: canonical,
      export: 'isCanonical',
      probes,
    });
  const known: Probe[] = [];
  for (const [name, hex] of [
    ['base', le(9n)],
    ['alice', '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a'],
    ['bob', 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f'],
  ])
    for (const method of ['isInRange', 'isTorsionFree', 'isCanonical'])
      known.push(call(`${name}-${method}`, method, [bytes(hex!)], true));
  make('published-prime-order', known);
  const boundary: Probe[] = [];
  for (const [name, value, inRange, torsionFree] of [
    ['zero', 0n, true, false],
    ['one', 1n, true, false],
    ['p-minus-one', P - 1n, true, false],
    ['p', P, false, false],
    ['p-plus-nine', P + 9n, false, true],
  ] as const) {
    boundary.push(
      call(`${name}-range`, 'isInRange', [bytes(le(value))], inRange),
      call(`${name}-torsion`, 'isTorsionFree', [bytes(le(value))], torsionFree),
      call(`${name}-canonical`, 'isCanonical', [bytes(le(value))], inRange && torsionFree),
    );
  }
  make('field-low-order-boundaries', boundary);
  make('published-edwards-base-identity', [
    call(
      'montgomery-nine-y',
      'toEdwardsCompressed',
      [bytes(le(9n))],
      bytes('58' + '66'.repeat(31)),
      transform,
    ),
    call(
      'decompress-base',
      'decompressEd25519',
      [bytes('58' + '66'.repeat(31))],
      { x: b(x), y: b(y) },
      transform,
    ),
    call('affine-extended', 'affineToExtended', [b(x), b(y)], point, transform),
    call('base-valid', 'isPointValid', [point], true, ops),
    call('identity-valid', 'isPointValid', [identity], true, ops),
    call('base-not-identity', 'isIdentity', [point], false),
    call('identity-is-identity', 'isIdentity', [identity], true),
    call('identity-scalar-zero', 'scalarMult', [point, b(0n)], identity, ops),
    call('base-self-equal', 'equalPoints', [point, point], true, ops),
  ]);
  // Explicit helper characterization: no protocol-level32-byte rejection is assumed.
  const malformed: Probe[] = [];
  for (const [name, hex, range, torsion] of [
    ['short-nine', '09', true, true],
    ['long-zero-extended-nine', '09' + '00'.repeat(32), true, true],
    ['empty', '', true, false],
  ] as const)
    malformed.push(
      call(`${name}-range`, 'isInRange', [bytes(hex)], range),
      call(`${name}-torsion`, 'isTorsionFree', [bytes(hex)], torsion),
      call(`${name}-canonical`, 'isCanonical', [bytes(hex)], range && torsion),
    );
  make('helper-non32length-characterization', malformed);

  const view = (hex: string): JsonValue => ({
    $type: 'Uint8Array',
    value: [0xef, ...Array.from(Buffer.from(hex, 'hex')), 0xfe],
    byteOffset: 1,
    byteLength: hex.length / 2,
  });
  const encode = (n: bigint) => {
    let hex = n.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    return hex.match(/../g)!.reverse().join('');
  };
  const fromHex = (hex: string) => BigInt('0x' + Buffer.from(hex, 'hex').reverse().toString('hex'));
  const mod = (n: bigint) => ((n % P) + P) % P;
  // Host field arithmetic provides expected data only; no oracle function enters the worker.
  const inverse = (n: bigint) => {
    let result = 1n,
      base = mod(n),
      power = P - 2n;
    while (power) {
      if (power & 1n) result = mod(result * base);
      base = mod(base * base);
      power >>= 1n;
    }
    return result;
  };
  const range: Probe[] = [];
  for (const [name, value] of [
    ['p-1', P - 1n],
    ['p', P],
    ['p+1', P + 1n],
    ['2^255', 2n ** 255n],
    ['2^256', 2n ** 256n],
  ] as const)
    range.push(
      call(`${name}-range`, 'isInRange', [bytes(encode(value))], value < P),
      call(`${name}-offset-range`, 'isInRange', [view(encode(value))], value < P),
    );
  for (const length of [0, 1, 2, 31, 32, 33, 64, 256])
    for (const fill of [0, 255]) {
      const value = fill === 0 ? 0n : 256n ** BigInt(length) - 1n;
      range.push(
        call(
          `length-${length}-fill-${fill}`,
          'isInRange',
          [bytes(fill.toString(16).padStart(2, '0').repeat(length))],
          value < P,
        ),
      );
    }
  make('generated-range-only-lengths', range);
  for (const [name, hex] of [
    ['base', le(9n)],
    ['alice', '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a'],
    ['bob', 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f'],
  ]) {
    const u = fromHex(hex!),
      compressed = le(mod((u - 1n) * inverse(u + 1n))),
      probes: Probe[] = [];
    for (const k of [0n, 1n, 2n, 3n]) {
      const input = view(encode(u + k * P));
      probes.push(
        call(`k-${k}-range`, 'isInRange', [input], k === 0n),
        call(`k-${k}-torsion`, 'isTorsionFree', [input], true),
        call(`k-${k}-canonical`, 'isCanonical', [input], k === 0n),
        call(`k-${k}-reduced-y`, 'toEdwardsCompressed', [input], bytes(compressed), transform),
      );
    }
    make(`published-u-plus-kp-${name}`, probes);
  }
  const scale = (q: Record<string, JsonValue>, n: bigint): JsonValue =>
    Object.fromEntries(
      Object.entries(q).map(([key, value]) => [
        key,
        b(mod(BigInt((value as { value: string }).value) * n)),
      ]),
    );
  const neg = { X: b(P - x), Y: b(y), Z: b(1n), T: b(mod(-x * y)) };
  make('projective-equivalence-and-negative-base', [
    call('scaled-base-valid', 'isPointValid', [scale(point, 2n)], true, ops),
    call('scaled-base-equal', 'equalPoints', [point, scale(point, 2n)], true, ops),
    call('scaled-identity-equal', 'equalPoints', [identity, scale(identity, 3n)], true, ops),
    call('negative-base-valid', 'isPointValid', [neg], true, ops),
    call('negative-not-base', 'equalPoints', [point, neg], false, ops),
    call('negative-not-identity', 'isIdentity', [neg], false),
    call(
      'compress-base',
      'compressEd25519',
      [{ x: b(x), y: b(y) }],
      bytes('58' + '66'.repeat(31)),
      transform,
    ),
    call(
      'compress-negative-base',
      'compressEd25519',
      [{ x: b(P - x), y: b(y) }],
      bytes('58' + '66'.repeat(30) + 'e6'),
      transform,
    ),
    call(
      'decompress-negative-base',
      'decompressEd25519',
      [bytes('58' + '66'.repeat(30) + 'e6')],
      { x: b(P - x), y: b(y) },
      transform,
    ),
    {
      id: 'undefined-u-minus-one',
      module: transform,
      export: 'toEdwardsCompressed',
      args: [bytes(le(P - 1n))],
      throws: { name: 'Error', message: 'u == -1 (mod p): cannot convert' },
    },
    {
      id: 'undefined-y-identity',
      module: transform,
      export: 'fromAffineToMontgomeryUV',
      args: [{ x: b(0n), y: b(1n) }],
      throws: { name: 'Error', message: 'y == 1: map undefined' },
    },
    {
      id: 'invalid-curve-equation',
      module: ops,
      export: 'isPointValid',
      args: [{ X: b(1n), Y: b(1n), Z: b(1n), T: b(1n) }],
      throws: { name: 'Error', message: 'bad point: equation left != right (1)' },
    },
  ]);
  make(
    'independent-modular-integers',
    [-P - 1n, -P, -1n, 0n, 1n, P - 1n, P, P + 1n, 2n ** 256n].map((n, index) =>
      call(`integer-${index}`, 'mod', [b(n)], b(mod(n)), transform),
    ),
  );
  return cases;
}
