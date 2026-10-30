import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const numeric = (value: number): JsonValue =>
  Number.isFinite(value)
    ? Object.is(value, -0)
      ? 0
      : value
    : { $type: 'number', value: String(value) };
const bigint = (value: string): JsonValue => ({ $type: 'BigInt', value });
const makeCase = (id: string, probes: Probe[], randomSeed = 1): BehaviorCase => ({
  schemaVersion: 1,
  id: `backoff-utils-${id}-v1`,
  version: 1,
  module: 'WABackoffUtils',
  export: 'expBackoff',
  probes,
  context: { randomSeed },
  stubs: [{ module: 'cr:6640', exports: null }],
});
const probe = (id: string, args: JsonValue[], expected: JsonValue): Probe => ({
  id,
  args,
  expected,
});
const noJitter = (
  id: string,
  attempt: JsonValue,
  maximum: JsonValue,
  minimum: JsonValue,
  expected: JsonValue,
) => probe(id, [attempt, maximum, minimum, 0], expected);

/** Integer powers are built by exact repeated doubling/halving, independently of Math.pow. */
function binaryPower(exponent: number): number {
  let value = 1;
  for (let remaining = Math.abs(exponent); remaining > 0; remaining--)
    value = exponent < 0 ? value / 2 : value * 2;
  return value;
}
/** Mathematical interval oracle; a contradictory finite interval gives its stated lower bound priority. */
function bounded(power: number, upper: number, lower: number): number {
  return lower > upper ? lower : [lower, power, upper].sort((left, right) => left - right)[1]!;
}
function partitions(id: string, probes: Probe[]): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  for (let offset = 0; offset < probes.length; offset += 96)
    cases.push(makeCase(`${id}-${offset}`, probes.slice(offset, offset + 96)));
  return cases;
}

/** Independent BigInt modular arithmetic for the configured realm random input profile, not vendor entropy. */
function randomInputs(seed: number): () => number {
  let state = BigInt(seed);
  return () => {
    state = (state * 1664525n + 1013904223n) % 4294967296n;
    return Number(state) / 4294967296;
  };
}

export function backoffUtilsCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const exponents = [
    -1075, -1074, -1073, -1023, -1022, -1021, -65, -64, -33, -32, -17, -16, -8, -4, -2, -1, 0, 1, 2,
    3, 4, 8, 16, 31, 32, 33, 63, 64, 65, 511, 512, 1022, 1023, 1024, 1025,
  ];
  cases.push(
    makeCase(
      'exact-binary-powers',
      exponents.map((attempt, index) =>
        noJitter(
          `power-${index}`,
          attempt,
          absent,
          absent,
          numeric(attempt === 0 ? 0 : binaryPower(attempt)),
        ),
      ),
    ),
  );
  const grid: Probe[] = [];
  for (let attempt = -16; attempt <= 16; attempt++)
    for (const maximum of [-8, 0, 3, 31, 1025])
      for (const minimum of [-5, 0, 1, 7, 33]) {
        grid.push(
          noJitter(
            `a-${attempt}-max-${maximum}-min-${minimum}`,
            attempt,
            maximum,
            minimum,
            numeric(attempt === 0 ? minimum : bounded(binaryPower(attempt), maximum, minimum)),
          ),
        );
      }
  cases.push(...partitions('finite-bound-grid', grid));
  const fractional: Probe[] = [];
  for (const attempt of [-1023.5, -32.5, -4.5, -0.5, 0.5, 1.5, 4.5, 32.5, 1023.5]) {
    // The exact unbounded fractional rounding is deliberately not used as an oracle.
    if (attempt < 0)
      fractional.push(
        noJitter(`fraction-${attempt}-upper-zero`, attempt, 0, absent, 0),
        noJitter(`fraction-${attempt}-conflict`, attempt, -1, 1, 1),
      );
    else
      fractional.push(
        noJitter(`fraction-${attempt}-upper-one`, attempt, 1, 0, 1),
        noJitter(`fraction-${attempt}-conflict`, attempt, 0, 2, 2),
      );
  }
  cases.push(makeCase('fractional-bounded-ranges', fractional));
  const coercions: Probe[] = [];
  const maxIgnored: JsonValue[] = [
    absent,
    null,
    false,
    true,
    '0',
    '3',
    [],
    [3],
    { maximum: 3 },
    numeric(NaN),
    numeric(Infinity),
    numeric(-Infinity),
  ];
  maxIgnored.forEach((maximum, index) =>
    coercions.push(noJitter(`ignored-nonnumeric-max-${index}`, 3, maximum, absent, 8)),
  );
  const minima: { value: JsonValue; atZero: JsonValue; atThree: JsonValue }[] = [
    { value: absent, atZero: 0, atThree: 8 },
    { value: null, atZero: 0, atThree: 8 },
    { value: false, atZero: 0, atThree: 8 },
    { value: true, atZero: true, atThree: 8 },
    { value: '', atZero: 0, atThree: 8 },
    { value: '0', atZero: '0', atThree: 8 },
    { value: '9', atZero: '9', atThree: 8 },
    { value: [], atZero: [], atThree: 8 },
    { value: [9], atZero: [9], atThree: 8 },
    { value: { marker: 'synthetic-minimum' }, atZero: { marker: 'synthetic-minimum' }, atThree: 8 },
    { value: numeric(NaN), atZero: 0, atThree: 8 },
    { value: numeric(Infinity), atZero: numeric(Infinity), atThree: 8 },
    { value: numeric(-Infinity), atZero: numeric(-Infinity), atThree: 8 },
    { value: 9, atZero: 9, atThree: 9 },
    { value: -5, atZero: -5, atThree: 8 },
    { value: bigint('0'), atZero: 0, atThree: 8 },
    { value: bigint('1'), atZero: bigint('1'), atThree: 8 },
  ];
  minima.forEach(({ value, atZero, atThree }, index) =>
    coercions.push(
      noJitter(`minimum-zero-attempt-${index}`, 0, absent, value, atZero),
      noJitter(`minimum-nonzero-attempt-${index}`, 3, absent, value, atThree),
    ),
  );
  const attempts: { value: JsonValue; expected: JsonValue }[] = [
    { value: false, expected: 1 },
    { value: true, expected: 2 },
    { value: null, expected: 1 },
    { value: absent, expected: numeric(NaN) },
    { value: '', expected: 1 },
    { value: '0', expected: 1 },
    { value: '1', expected: 2 },
    { value: '-1', expected: 0.5 },
    { value: [], expected: 1 },
    { value: [2], expected: 4 },
    { value: ['2'], expected: 4 },
    { value: [1, 2], expected: numeric(NaN) },
    { value: { attempt: 2 }, expected: numeric(NaN) },
    { value: numeric(NaN), expected: numeric(NaN) },
    { value: numeric(Infinity), expected: numeric(Infinity) },
    { value: numeric(-Infinity), expected: 0 },
    { value: Number.MAX_VALUE, expected: numeric(Infinity) },
    { value: -Number.MAX_VALUE, expected: 0 },
  ];
  attempts.forEach(({ value, expected }, index) =>
    coercions.push(noJitter(`strict-zero-vs-coercion-${index}`, value, absent, absent, expected)),
  );
  coercions.push(
    noJitter('string-minimum-coerced-only-by-finite-max', 0, 3, '9', 3),
    noJitter('array-minimum-coerced-only-by-finite-max', 0, 3, [9], 3),
    noJitter('infinite-minimum-clamped-at-attempt-zero', 0, 3, numeric(Infinity), 3),
    noJitter('overflow-attempt-finite-max-then-min', numeric(Infinity), 3, 7, 7),
    noJitter('nan-attempt-never-lower-clamps', numeric(NaN), 3, 7, numeric(NaN)),
    noJitter('bigint-minimum-finite-max', 0, 0, bigint('1'), 0),
    {
      id: 'bigint-attempt-rejected',
      args: [bigint('0'), absent, absent, 0],
      throws: { name: 'TypeError' },
    },
  );
  cases.push(...partitions('coercions-and-nonfinite', coercions));
  for (const seed of [0, 1, 4294967295, 3735928559]) {
    const draw = randomInputs(seed);
    const probes: Probe[] = [];
    const steps: {
      id: string;
      input?: JsonValue;
      amplitude: number;
      consumes: boolean;
      omit?: boolean;
      base?: number;
      args?: JsonValue[];
      throws?: boolean;
    }[] = [
      { id: 'zero-jitter-does-not-draw', input: 0, amplitude: 0, consumes: false },
      { id: 'omitted-default', amplitude: 0.1, consumes: true, omit: true },
      { id: 'explicit-undefined-default', input: absent, amplitude: 0.1, consumes: true },
      { id: 'positive', input: 0.5, amplitude: 0.5, consumes: true },
      { id: 'negative', input: -1, amplitude: -1, consumes: true },
      { id: 'large-negative', input: -4, amplitude: -4, consumes: true },
      { id: 'false-does-not-draw', input: false, amplitude: 0, consumes: false },
      {
        id: 'zero-output-still-draws',
        input: 1,
        amplitude: 1,
        consumes: true,
        base: 0,
        args: [0, absent, 0],
      },
      { id: 'after-zero-output-draw', input: 1, amplitude: 1, consumes: true },
      { id: 'nan-jitter-falsy-does-not-draw', input: numeric(NaN), amplitude: 0, consumes: false },
      { id: 'truthy-string-zero-draws', input: '0', amplitude: 0, consumes: true },
      { id: 'truthy-empty-array-draws', input: [], amplitude: 0, consumes: true },
      { id: 'empty-string-skips', input: '', amplitude: 0, consumes: false },
      { id: 'null-skips', input: null, amplitude: 0, consumes: false },
      { id: 'true-jitter', input: true, amplitude: 1, consumes: true },
      { id: 'numeric-string-jitter', input: '2.5', amplitude: 2.5, consumes: true },
      { id: 'invalid-string-yields-nan', input: 'invalid', amplitude: NaN, consumes: true },
      { id: 'huge-finite', input: Number.MAX_VALUE, amplitude: Number.MAX_VALUE, consumes: true },
      { id: 'positive-infinity', input: numeric(Infinity), amplitude: Infinity, consumes: true },
      { id: 'negative-infinity', input: numeric(-Infinity), amplitude: -Infinity, consumes: true },
      {
        id: 'zero-times-infinity',
        input: numeric(Infinity),
        amplitude: Infinity,
        consumes: true,
        base: 0,
        args: [0, absent, 0],
      },
      {
        id: 'jitter-not-reclamped-to-max',
        input: 1,
        amplitude: 1,
        consumes: true,
        base: 5,
        args: [4, 5, 3],
      },
      {
        id: 'negative-jitter-not-reclamped-to-min',
        input: -1,
        amplitude: -1,
        consumes: true,
        base: 3,
        args: [1, 5, 3],
      },
      {
        id: 'bigint-jitter-throws-after-draw',
        input: bigint('1'),
        amplitude: 0,
        consumes: true,
        throws: true,
      },
      { id: 'following-draw-after-jitter-error', input: 1, amplitude: 1, consumes: true },
      {
        id: 'bigint-attempt-throws-before-draw',
        input: 1,
        amplitude: 0,
        consumes: false,
        throws: true,
        args: [bigint('0'), absent, absent],
      },
      { id: 'following-draw-after-attempt-error', input: 1, amplitude: 1, consumes: true },
    ];
    for (const step of steps) {
      const args = [...(step.args || [1, absent, absent]), ...(step.omit ? [] : [step.input!])];
      const random = step.consumes ? draw() : 0;
      probes.push(
        step.throws
          ? { id: step.id, args, throws: { name: 'TypeError' } }
          : probe(
              step.id,
              args,
              numeric(
                step.consumes ? (step.base ?? 2) * (1 + step.amplitude * random) : (step.base ?? 2),
              ),
            ),
      );
    }
    cases.push(makeCase(`jitter-input-sequence-${seed}`, probes, seed));
  }
  return cases;
}
