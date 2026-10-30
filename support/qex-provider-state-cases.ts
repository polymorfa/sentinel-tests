import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const nan: JsonValue = { $type: 'number', value: 'NaN' };
const reference = (value: string): JsonValue => ({ $type: 'reference', value });
const missing = {
  name: 'Invariant Violation',
  message: 'Minified invariant #11799; %s Params: %s',
};
const read = (id: string, key: string, expected: JsonValue): Probe => ({
  id,
  args: [key],
  expected,
});
const entry = (r: JsonValue, l?: JsonValue): JsonValue => (l === undefined ? { r } : { r, l });
const add = (id: string, entries: JsonValue, metrics?: JsonValue): Probe => ({
  id,
  export: 'add',
  args: metrics === undefined ? [entries] : [entries, metrics],
  expected: absent,
});
const flush = (id: string, tokens: JsonValue[] = []): Probe => ({
  id,
  module: 'BanzaiLazyQueue',
  export: 'flushQueue',
  args: [],
  expected: tokens.map((l) => ['qex', { l }, absent]),
});
function plan(name: string, probes: Probe[]): BehaviorCase {
  return {
    schemaVersion: 1,
    id: `qex-provider-state-${name}-v1`,
    version: 1,
    module: 'qex',
    export: '_',
    context: { gates: {} },
    probes,
  };
}
export function qexProviderStateCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  cases.push(
    plan('missing-add-retry', [
      flush('initial-empty'),
      { id: 'missing-alpha', args: ['alpha'], throws: missing },
      add('stage-alpha', { alpha: entry(7, null) }),
      read('read-alpha', 'alpha', 7),
      add('duplicate-alpha', { alpha: entry(9, 'ignored') }),
      read('alpha-remains-seven', 'alpha', 7),
      flush('null-token-not-logged'),
      { id: 'missing-beta', args: ['beta'], throws: missing },
      add('stage-beta', { beta: entry(11, 'B') }),
      read('retry-beta', 'beta', 11),
      flush('beta-logged', ['B']),
    ]),
  );
  cases.push(
    plan('first-read-order-and-flush', [
      add('stage-three', { alpha: entry(1, 'A'), beta: entry(2, 'B'), gamma: entry(3, 'C') }),
      read('beta-first', 'beta', 2),
      read('alpha-second', 'alpha', 1),
      read('beta-repeat', 'beta', 2),
      read('gamma-third', 'gamma', 3),
      flush('first-queue', ['B', 'A', 'C']),
      flush('second-flush-empty'),
      read('alpha-after-flush', 'alpha', 1),
      read('beta-after-flush', 'beta', 2),
      read('gamma-after-flush', 'gamma', 3),
      flush('logged-map-survives-flush'),
    ]),
  );
  const tokens: JsonValue[] = [
    0,
    false,
    '',
    7,
    'token',
    { hash: 'literal' },
    ['token', 3],
    null,
    absent,
  ];
  const staged: Record<string, JsonValue> = {};
  tokens.forEach((token, index) => {
    staged[`key-${index}`] = entry(index, token);
  });
  cases.push(
    plan('nonnull-log-tokens', [
      add('stage-token-literals', staged),
      ...tokens.map((_, index) => read(`read-${index}`, `key-${index}`, index)),
      flush('nonnull-tokens-in-read-order', tokens.slice(0, 7)),
      ...tokens.map((_, index) => read(`repeat-${index}`, `key-${index}`, index)),
      flush('all-repeats-silent'),
    ]),
  );
  cases.push(
    plan('missing-raw-value-and-primitives', [
      add('stage-partial-entries', {
        haslog: { l: 'missing-r' },
        empty: {},
        number: 5,
        falsevalue: false,
        text: 'entry',
      }),
      ...['haslog', 'empty', 'number', 'falsevalue', 'text'].map((key) =>
        read(`undefined-${key}`, key, absent),
      ),
      flush('missing-r-still-logs', ['missing-r']),
      read('missing-r-repeat', 'haslog', absent),
      flush('repeat-silent'),
    ]),
  );
  cases.push(
    plan('null-entry-cannot-repair', [
      add('stage-null-entry', { broken: null }),
      { id: 'null-entry-error', args: ['broken'], throws: missing },
      add('ignored-repair', { broken: entry(8, 'ignored') }),
      { id: 'still-null-error', args: ['broken'], throws: missing },
      add('different-valid-key', { other: entry(8, 'other') }),
      read('other-succeeds', 'other', 8),
      flush('only-other-logs', ['other']),
    ]),
  );
  cases.push(
    plan('duplicates-preserve-value-and-token', [
      add('stage-values', { logged: entry('old', 'old-hash'), silent: entry('quiet', null) }),
      read('log-original', 'logged', 'old'),
      flush('old-exposure', ['old-hash']),
      add('replace-attempt', {
        logged: entry('new', 'new-hash'),
        silent: entry('loud', 'newly-added-hash'),
      }),
      read('logged-value-old', 'logged', 'old'),
      read('silent-value-old', 'silent', 'quiet'),
      flush('no-new-exposures'),
    ]),
  );
  for (const [name, value] of [
    ['record', { count: 3, name: 'same' }],
    ['array', [1, 'same', null]],
    ['bytes', { $type: 'Uint8Array', value: [0, 127, 128, 255] }],
  ] as [string, JsonValue][]) {
    cases.push(
      plan(`raw-${name}-identity`, [
        add('stage-independent-values', {
          first: entry(value, 'first-token'),
          second: entry(value, 'second-token'),
        }),
        { ...read('retain-first', 'first', value), retain: { id: 'first-value', stage: 'call' } },
        {
          id: 'same-returned-object',
          args: ['first'],
          result: { identityWith: 'first-value' },
          expected: true,
        },
        {
          id: 'distinct-equal-input',
          args: ['second'],
          result: { identityWith: 'first-value' },
          expected: false,
        },
        add('ignored-replacement', { first: entry({ replaced: true }, 'ignored-token') }),
        {
          id: 'identity-survives-duplicate',
          args: ['first'],
          result: { identityWith: 'first-value' },
          expected: true,
        },
        read('literal-original-survives', 'first', value),
        flush('original-tokens-only', ['first-token', 'second-token']),
      ]),
    );
  }
  cases.push(
    plan('real-metrics-mutation', [
      add('stage-stats-and-alpha', {
        stats: entry({ entry: 0, dup_entry: 0 }),
        alpha: entry(1, 'A'),
      }),
      {
        ...read('retain-stats', 'stats', { entry: 0, dup_entry: 0 }),
        retain: { id: 'stats', stage: 'call' },
      },
      add(
        'mixed-add-one',
        { alpha: entry(9, 'ignored-A'), beta: entry(2, 'B') },
        reference('stats'),
      ),
      read('stats-after-one', 'stats', { entry: 2, dup_entry: 1 }),
      read('alpha-old', 'alpha', 1),
      read('beta-new', 'beta', 2),
      flush('first-exposures', ['A', 'B']),
      add(
        'mixed-add-two',
        { beta: entry(3, 'ignored-B'), gamma: entry(4, 'C') },
        reference('stats'),
      ),
      read('stats-after-two', 'stats', { entry: 4, dup_entry: 2 }),
      read('beta-still-old', 'beta', 2),
      read('gamma-new', 'gamma', 4),
      {
        id: 'stats-identity-stable',
        args: ['stats'],
        result: { identityWith: 'stats' },
        expected: true,
      },
      flush('only-new-gamma', ['C']),
    ]),
  );
  for (const [name, metrics] of [
    ['boolean', true],
    ['number', 7],
    ['string', 'odd'],
  ] as [string, JsonValue][])
    cases.push(
      plan(`invalid-${name}-metrics`, [
        {
          id: 'failed-before-first-insertion',
          export: 'add',
          args: [{ alpha: entry(12, 'A'), beta: entry(13, 'B') }, metrics],
          throws: { name: 'TypeError' },
        },
        { id: 'alpha-not-cached', args: ['alpha'], throws: missing },
        { id: 'beta-not-cached', args: ['beta'], throws: missing },
        flush('failure-logs-nothing'),
        add('valid-retry', { alpha: entry(12, 'A'), beta: entry(13, 'B') }),
        read('alpha-recovered', 'alpha', 12),
        read('beta-recovered', 'beta', 13),
        flush('recovered-exposures', ['A', 'B']),
        {
          id: 'duplicate-still-fails-first',
          export: 'add',
          args: [{ alpha: entry(99, 'ignored') }, metrics],
          throws: { name: 'TypeError' },
        },
        read('failed-duplicate-preserves', 'alpha', 12),
        flush('old-key-no-reexposure'),
      ]),
    );
  const falsy: Probe[] = [];
  [null, false, 0, '', nan].forEach((metrics, index) => {
    falsy.push(
      add(`falsy-${index}`, { [`key-${index}`]: entry(index + 10, `L${index}`) }, metrics),
      read(`read-falsy-${index}`, `key-${index}`, index + 10),
    );
  });
  falsy.push(flush('falsy-metrics-did-not-block', ['L0', 'L1', 'L2', 'L3', 'L4']));
  cases.push(plan('falsy-metrics-skipped', falsy));
  cases.push(
    plan('metrics-fields-not-initialized', [
      add('stage-empty-stats', { stats: entry({}) }),
      { ...read('retain-empty-stats', 'stats', {}), retain: { id: 'stats', stage: 'call' } },
      add('new-entry', { fresh: entry(1, 'F') }, reference('stats')),
      read('entry-becomes-nan', 'stats', { entry: nan }),
      add('duplicate-entry', { fresh: entry(2, 'ignored') }, reference('stats')),
      read('both-fields-nan', 'stats', { entry: nan, dup_entry: nan }),
      read('original-value', 'fresh', 1),
      flush('first-original-token', ['F']),
    ]),
  );
  for (let history = 0; history < 2; history++) {
    const probes: Probe[] = [
      add('stage-stats', { stats: entry({ entry: 0, dup_entry: 0 }) }),
      {
        ...read('retain-stats', 'stats', { entry: 0, dup_entry: 0 }),
        retain: { id: 'stats', stage: 'call' },
      },
    ];
    const key = (batch: number, index: number) => `history-${history}-batch-${batch}-key-${index}`;
    const token = (batch: number, index: number) => `exposure-${history}-${batch}-${index}`;
    for (let batch = 0; batch < 6; batch++) {
      const fresh: Record<string, JsonValue> = {},
        duplicates: Record<string, JsonValue> = {};
      for (let index = 0; index < 4; index++) {
        fresh[key(batch, index)] = entry(history * 1000 + batch * 4 + index, token(batch, index));
        duplicates[key(batch, index)] = entry(-999, 'ignored');
      }
      probes.push(add(`batch-${batch}-stage`, fresh, reference('stats')));
      for (const index of [3, 1, 0, 2])
        probes.push(
          read(
            `batch-${batch}-read-${index}`,
            key(batch, index),
            history * 1000 + batch * 4 + index,
          ),
        );
      probes.push(
        add(`batch-${batch}-duplicates`, duplicates, reference('stats')),
        read(`batch-${batch}-oldest`, key(0, 0), history * 1000),
        read(`batch-${batch}-stats`, 'stats', {
          entry: (batch + 1) * 8,
          dup_entry: (batch + 1) * 4,
        }),
        flush(
          `batch-${batch}-first-read-order`,
          [3, 1, 0, 2].map((index) => token(batch, index)),
        ),
      );
    }
    for (let batch = 0; batch < 6; batch++)
      for (let index = 0; index < 4; index++)
        probes.push(
          read(`final-${batch}-${index}`, key(batch, index), history * 1000 + batch * 4 + index),
        );
    probes.push(flush('all-logged-markers-survive'));
    cases.push(plan(`generated-history-${history}`, probes));
  }
  return cases;
}
