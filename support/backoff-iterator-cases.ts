import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const operators = 'WAIterableOperators';
const exponential = 'WAExponentialIterator';
const backoff = 'WAExponentialBackoffIterator';
const absent: JsonValue = { $type: 'undefined' };
const number = (value: number): JsonValue =>
  Number.isFinite(value)
    ? value
    : {
        $type: 'number',
        value: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity',
      };
const ref = (value: string): JsonValue => ({ $type: 'reference', value });
const step = (value: JsonValue): JsonValue => ({ done: false, value });
const done: JsonValue = { done: true, value: absent };
const make = (
  id: string,
  module: string,
  exported: string,
  probes: Probe[],
  seed = 1,
): BehaviorCase => ({
  schemaVersion: 1,
  id: `backoff-iterator-${id}-v1`,
  version: 1,
  module,
  export: exported,
  probes,
  context: { babelHelpers: ['extends'], randomSeed: seed, gates: {} },
});
const advance = (id: string, handle: string, expected: JsonValue): Probe => ({
  id,
  module: operators,
  export: 'iteratorFromArray',
  args: [ref(handle)],
  result: { method: 'next' },
  expected,
});
function sequence(
  id: string,
  module: string,
  exported: string,
  args: JsonValue[],
  values: JsonValue[],
  finite = true,
  seed = 1,
): BehaviorCase {
  const probes: Probe[] = [
    {
      id: 'create-and-first-step',
      args,
      retain: { id: 'iterator', stage: 'call' },
      result: { method: 'next' },
      expected: values.length ? step(values[0]!) : done,
    },
  ];
  for (let index = 1; index < values.length; index++)
    probes.push(advance(`step-${index}`, 'iterator', step(values[index]!)));
  if (!finite)
    probes.push({
      id: 'chosen-consumer-closes-unbounded-prefix',
      module: 'isEmptyIterable',
      export: '$module',
      args: [ref('iterator')],
      expected: false,
    });
  probes.push(
    advance('terminal-next', 'iterator', done),
    advance('terminal-next-again', 'iterator', done),
  );
  return make(id, module, exported, probes, seed);
}

// Fixed input profiles, calculated independently with integer modular arithmetic
// for the diagnostic runtime's stated seed. These are not entropy assertions.
const profiles: { seed: number; words: number[] }[] = [
  {
    seed: 0,
    words: [
      1013904223, 1196435762, 3519870697, 2868466484, 1649599747, 2670642822, 1476291629,
      2748932008,
    ],
  },
  {
    seed: 1,
    words: [
      1015568748, 1586005467, 2165703038, 3027450565, 217083232, 1587069247, 3327581586, 2388811721,
    ],
  },
  {
    seed: 4294967295,
    words: [
      1012239698, 806866057, 579071060, 2709482403, 3082116262, 3754216397, 3919968968, 3109052295,
    ],
  },
];
function jitterValue(base: number, quarterUnits: number, word: number): number {
  const modulus = 4294967296n,
    quarters = BigInt(quarterUnits);
  return (
    Number(BigInt(base) * ((4n - quarters) * modulus + 2n * quarters * BigInt(word))) /
    Number(4n * modulus)
  );
}

export function backoffIteratorCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  for (const [index, factor] of [
    0,
    1,
    2,
    -1,
    -2,
    0.5,
    -0.5,
    1.5,
    3,
    Number.MAX_VALUE,
    -Number.MAX_VALUE,
    Infinity,
    NaN,
  ].entries())
    cases.push(
      sequence(
        `infinite-power-prefix-${index}`,
        exponential,
        '$module',
        [number(factor)],
        Array.from({ length: 8 }, (_, index) => number(factor ** index)),
        false,
      ),
    );
  cases.push(
    sequence(
      'default-factor-jitter-and-cap',
      backoff,
      'exponentialBackoffIterator',
      [{ minTimeout: 1, retries: 8 }],
      [1, 2, 4, 8, 16, 32, 64, 128],
    ),
  );
  const retryInputs = [-5, -0.5, 0, 0.25, 0.999, 1, 1.25, 1.999, 2, 2.999, 3, 64];
  for (const [index, retries] of retryInputs.entries()) {
    const count = Math.max(0, Math.floor(retries));
    cases.push(
      sequence(
        `finite-retry-count-${index}`,
        backoff,
        'exponentialBackoffIterator',
        [{ minTimeout: 1, maxTimeout: 1024, retries }],
        Array.from({ length: count }, (_, step) => Math.min(2 ** step, 1024)),
      ),
    );
  }
  for (const [index, retries] of [NaN, Infinity, 2147483647, Number.MAX_SAFE_INTEGER].entries())
    cases.push(
      sequence(
        `bounded-unbounded-or-large-retry-${index}`,
        backoff,
        'exponentialBackoffIterator',
        [{ minTimeout: 1, maxTimeout: 8, retries: number(retries) }],
        [1, 2, 4, 8, 8, 8, 8, 8],
        false,
      ),
    );
  cases.push(
    sequence(
      'missing-retry-does-not-bound-generator',
      backoff,
      'exponentialBackoffIterator',
      [{ minTimeout: 1, maxTimeout: 8 }],
      [1, 2, 4, 8, 8, 8, 8, 8],
      false,
    ),
  );
  const literalOptions: { options: JsonValue; values: number[] }[] = [
    { options: { factor: 0, minTimeout: 10, retries: 4 }, values: [10, 0, 0, 0] },
    { options: { factor: 1, minTimeout: 10, retries: 4 }, values: [10, 10, 10, 10] },
    { options: { factor: -2, minTimeout: 1, retries: 5 }, values: [1, -2, 4, -8, 16] },
    { options: { factor: 0.5, minTimeout: 16, retries: 5 }, values: [16, 8, 4, 2, 1] },
    { options: { factor: -0.5, minTimeout: 16, retries: 5 }, values: [16, -8, 4, -2, 1] },
    { options: { factor: 1.5, minTimeout: 16, retries: 5 }, values: [16, 24, 36, 54, 81] },
    { options: { minTimeout: 10, maxTimeout: 25, retries: 5 }, values: [10, 20, 25, 25, 25] },
    { options: { minTimeout: 16, maxTimeout: 0, retries: 4 }, values: [0, 0, 0, 0] },
    { options: { minTimeout: 1, maxTimeout: -5, retries: 4 }, values: [-5, -5, -5, -5] },
    { options: { minTimeout: -10, maxTimeout: 5, retries: 4 }, values: [-10, -20, -40, -80] },
    { options: { minTimeout: 0, retries: 4 }, values: [0, 0, 0, 0] },
  ];
  for (const [index, vector] of literalOptions.entries())
    cases.push(
      sequence(
        `literal-factor-min-cap-${index}`,
        backoff,
        'exponentialBackoffIterator',
        [vector.options],
        vector.values,
      ),
    );
  const special: { id: string; options: JsonValue; values: number[]; finite?: boolean }[] = [
    {
      id: 'overflow',
      options: { factor: number(Number.MAX_VALUE), minTimeout: 2, retries: 4 },
      values: [2, Infinity, Infinity, Infinity],
    },
    {
      id: 'zero-times-overflow',
      options: { factor: number(Infinity), minTimeout: 0, retries: 4 },
      values: [0, NaN, NaN, NaN],
    },
    {
      id: 'nan-factor',
      options: { factor: number(NaN), minTimeout: 16, retries: 4 },
      values: [16, NaN, NaN, NaN],
    },
    {
      id: 'nan-minimum',
      options: { minTimeout: number(NaN), retries: 3 },
      values: [NaN, NaN, NaN],
    },
    {
      id: 'nan-cap',
      options: { minTimeout: 16, maxTimeout: number(NaN), retries: 3 },
      values: [NaN, NaN, NaN],
    },
    {
      id: 'explicit-undefined-factor-overwrites-default',
      options: { factor: absent, minTimeout: 16, retries: 3 },
      values: [16, NaN, NaN],
    },
    {
      id: 'explicit-undefined-jitter-overwrites-default',
      options: { jitter: absent, minTimeout: 16, retries: 3 },
      values: [NaN, NaN, NaN],
    },
    {
      id: 'explicit-undefined-cap-overwrites-default',
      options: { maxTimeout: absent, minTimeout: 16, retries: 3 },
      values: [NaN, NaN, NaN],
    },
    { id: 'missing-minimum', options: { retries: 3 }, values: [NaN, NaN, NaN] },
    {
      id: 'empty-options-bounded-prefix',
      options: {},
      values: [NaN, NaN, NaN, NaN],
      finite: false,
    },
    {
      id: 'null-options-bounded-prefix',
      options: null,
      values: [NaN, NaN, NaN, NaN],
      finite: false,
    },
  ];
  for (const vector of special)
    cases.push(
      sequence(
        vector.id,
        backoff,
        'exponentialBackoffIterator',
        [vector.options],
        vector.values.map(number),
        vector.finite !== false,
      ),
    );
  for (const profile of profiles)
    for (const quarters of [-4, 0, 2, 4, 8])
      for (const cap of [20, 1048576]) {
        const values = profile.words.map((word, index) =>
          Math.min(jitterValue(16 * 2 ** index, quarters, word), cap),
        );
        cases.push(
          sequence(
            `jitter-seed-${profile.seed}-quarters-${quarters}-cap-${cap}`,
            backoff,
            'exponentialBackoffIterator',
            [{ factor: 2, minTimeout: 16, maxTimeout: cap, jitter: quarters / 4, retries: 8 }],
            values,
            true,
            profile.seed,
          ),
        );
      }
  cases.push(
    make('completed-generator-does-not-draw-extra-jitter', backoff, 'exponentialBackoffIterator', [
      {
        id: 'first-zero-jitter-draw',
        args: [{ minTimeout: 16, factor: 1, retries: 2 }],
        retain: { id: 'original', stage: 'call' },
        result: { method: 'next' },
        expected: step(16),
      },
      advance('second-zero-jitter-draw', 'original', step(16)),
      advance('complete-before-next-draw', 'original', done),
      advance('done-again-no-draw', 'original', done),
      {
        id: 'new-generator-uses-third-profile-word',
        args: [{ minTimeout: 16, factor: 1, jitter: 1, retries: 1 }],
        result: { method: 'next' },
        expected: step(jitterValue(16, 4, profiles[1]!.words[2]!)),
      },
    ]),
  );
  return cases;
}

export function iteratorConsumerCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  for (const [index, vector] of [
    { args: [0, 4], values: [0, 1, 2, 3] },
    { args: [4, 0, -1], values: [4, 3, 2, 1] },
    { args: [0, 1, 0.25], values: [0, 0.25, 0.5, 0.75] },
    { args: [1, 0, -0.25], values: [1, 0.75, 0.5, 0.25] },
    { args: [0, 0], values: [] },
    { args: [3, 1, 1], values: [] },
    { args: [1, 3, -1], values: [] },
  ].entries())
    cases.push(sequence(`range-${index}`, operators, 'rangeIterator', vector.args, vector.values));
  cases.push(
    make('range-zero-step-rejects-on-first-next', operators, 'rangeIterator', [
      {
        id: 'reject',
        args: [0, 3, 0],
        result: { method: 'next' },
        throws: { name: 'Error', message: "Step can't be zero." },
      },
    ]),
  );
  for (const [index, count] of [0, 0.5, 1, 1.5, 2, 4].entries()) {
    const values = Array.from({ length: Math.ceil(count) }, (_, index) => 2 ** (index + 1));
    const probes: Probe[] = [
      {
        id: 'original-first',
        args: [2],
        retain: { id: 'original', stage: 'call' },
        result: { method: 'next' },
        expected: step(1),
      },
      {
        id: 'take-first',
        module: operators,
        export: 'takeIterator',
        args: [ref('original'), count],
        retain: { id: 'taken', stage: 'call' },
        result: { method: 'next' },
        expected: values.length ? step(values[0]!) : done,
      },
    ];
    for (let value = 1; value < values.length; value++)
      probes.push(advance(`take-step-${value}`, 'taken', step(values[value]!)));
    probes.push(
      advance('take-terminal', 'taken', done),
      advance('underlying-was-closed', 'original', done),
      advance('take-terminal-again', 'taken', done),
    );
    cases.push(make(`take-count-${index}`, exponential, '$module', probes));
  }
  cases.push(
    make('take-negative-count-rejects', operators, 'takeIterator', [
      {
        id: 'reject',
        args: [[1, 2], -1],
        result: { method: 'next' },
        throws: { name: 'Error', message: 'Count must be a positive integer' },
      },
    ]),
  );
  for (const consumer of ['first', 'isEmptyIterable'])
    cases.push(
      make(`actual-${consumer}-closes-original-generator`, exponential, '$module', [
        {
          id: 'original-first',
          args: [2],
          retain: { id: 'original', stage: 'call' },
          result: { method: 'next' },
          expected: step(1),
        },
        {
          id: 'chosen-consumer',
          module: consumer === 'first' ? operators : 'isEmptyIterable',
          export: consumer === 'first' ? 'first' : '$module',
          args: [ref('original')],
          expected: consumer === 'first' ? 2 : false,
        },
        advance('original-closed', 'original', done),
        advance('closed-again', 'original', done),
      ]),
    );
  cases.push(
    make('take-zero-pulls-then-closes-original-backoff', backoff, 'exponentialBackoffIterator', [
      {
        id: 'first-profile-word',
        args: [{ minTimeout: 16, factor: 1, jitter: 1, retries: 10 }],
        retain: { id: 'original', stage: 'call' },
        result: { method: 'next' },
        expected: step(jitterValue(16, 4, profiles[1]!.words[0]!)),
      },
      {
        id: 'zero-take-closes-after-second-word-pull',
        module: operators,
        export: 'takeIterator',
        args: [ref('original'), 0],
        result: { method: 'next' },
        expected: done,
      },
      advance('original-now-closed', 'original', done),
      {
        id: 'new-generator-uses-third-profile-word',
        args: [{ minTimeout: 16, factor: 1, jitter: 1, retries: 1 }],
        result: { method: 'next' },
        expected: step(jitterValue(16, 4, profiles[1]!.words[2]!)),
      },
    ]),
  );
  const emptyInputs: { id: string; input: JsonValue; empty: boolean; first: JsonValue }[] = [
    { id: 'empty-array', input: [], empty: true, first: absent },
    { id: 'undefined-element', input: [absent], empty: false, first: absent },
    { id: 'null-element', input: [null], empty: false, first: null },
    { id: 'false-element', input: [false], empty: false, first: false },
    { id: 'zero-element', input: [0], empty: false, first: 0 },
    { id: 'empty-string', input: '', empty: true, first: absent },
    { id: 'unicode-string', input: '😀x', empty: false, first: '😀' },
    {
      id: 'empty-byte-view',
      input: { $type: 'Uint8Array', value: [] },
      empty: true,
      first: absent,
    },
    {
      id: 'odd-byte-view',
      input: { $type: 'Uint8Array', value: [0, 127, 255] },
      empty: false,
      first: 0,
    },
  ];
  for (const vector of emptyInputs)
    cases.push(
      make(`literal-iterable-${vector.id}`, 'isEmptyIterable', '$module', [
        { id: 'empty-status', args: [vector.input], expected: vector.empty },
        {
          id: 'actual-first',
          module: operators,
          export: 'first',
          args: [vector.input],
          expected: vector.first,
        },
      ]),
    );
  return cases;
}
