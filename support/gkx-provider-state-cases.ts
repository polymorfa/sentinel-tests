import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const nan: JsonValue = { $type: 'number', value: 'NaN' };
const reference = (value: string): JsonValue => ({ $type: 'reference', value });
const missing = {
  name: 'Invariant Violation',
  message: 'Minified invariant #11797; %s Params: %s',
};
const entry = (result: JsonValue, hash: JsonValue = null): JsonValue => ({ result, hash });
const read = (id: string, key: string, expected: JsonValue): Probe => ({
  id,
  args: [key],
  expected: structuredClone(expected),
});
const method = (
  id: string,
  exported: string,
  args: JsonValue[],
  expected: JsonValue = absent,
): Probe => ({
  id,
  export: exported,
  args: structuredClone(args),
  expected: structuredClone(expected),
});
const add = (id: string, entries: JsonValue, metrics?: JsonValue): Probe =>
  method(id, 'add', metrics === undefined ? [entries] : [entries, metrics]);
const logged = (id: string, keys: string[], hash: JsonValue = null): Probe =>
  method(
    id,
    'getLogged',
    [],
    keys.map((identifier) => ({ identifier, hash })),
  );
function plan(name: string, probes: Probe[]): BehaviorCase {
  return {
    schemaVersion: 1,
    id: `gkx-provider-state-${name}-v1`,
    version: 1,
    module: 'gkx',
    export: '$module',
    context: { gates: {} },
    probes,
  };
}

/** Actual original provider methods, with synthetic records and no gkx fixture key. */
export function gkxProviderStateCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [
    plan('fresh-missing-add-retry', [
      method('no-introspection-table', 'getGKs', [], null),
      logged('initial-unlogged', []),
      { id: 'unknown-first', args: ['alpha'], throws: missing },
      logged('missing-not-logged', []),
      add('initialize-alpha', { alpha: entry(true) }),
      read('read-alpha', 'alpha', true),
      logged('first-read-logged', ['alpha']),
      read('repeat-alpha', 'alpha', true),
      logged('no-duplicate-log', ['alpha']),
    ]),
    plan('first-write-noop-resets', [
      add('first-false', { alpha: entry(false) }),
      add('ignored-true', { alpha: entry(true) }),
      read('first-write-wins', 'alpha', false),
      logged('logged-alpha', ['alpha']),
      method('clear-is-noop', 'clear', []),
      method('set-pass-is-noop', 'setPass', ['alpha']),
      read('still-false-after-pass', 'alpha', false),
      method('set-fail-is-noop', 'setFail', ['alpha']),
      method('clear-with-input-still-noop', 'clear', ['alpha']),
      read('still-false', 'alpha', false),
      logged('logged-state-retained', ['alpha']),
      method('still-no-table', 'getGKs', [], null),
    ]),
  ];
  const values: JsonValue[] = [
    false,
    true,
    0,
    -7,
    1.5,
    '',
    'false',
    'λ\u0000雪',
    null,
    absent,
    nan,
    { $type: 'number', value: 'Infinity' },
    { $type: 'number', value: '-Infinity' },
    { $type: 'BigInt', value: '9007199254740993' },
    [],
    [false, 0, null],
    {},
    { nested: [1, 'a'] },
  ];
  cases.push(
    plan('raw-results-without-boolean-coercion', [
      add(
        'stage-values',
        Object.fromEntries(values.map((value, index) => [`v-${index}`, entry(value)])),
      ),
      ...values.map((value, index) => read(`raw-${index}`, `v-${index}`, value)),
      logged(
        'all-raw-reads-logged',
        values.map((_, index) => `v-${index}`),
      ),
    ]),
  );
  for (const [name, value] of [
    ['record', { count: 3, name: 'same' }],
    ['array', [1, 'same', null]],
    ['bytes', { $type: 'Uint8Array', value: [0, 127, 128, 255] }],
  ] as [string, JsonValue][])
    cases.push(
      plan(`result-${name}-identity`, [
        add('stage-equal-values', { first: entry(value), second: entry(value) }),
        { ...read('retain-first', 'first', value), retain: { id: 'first-value', stage: 'call' } },
        {
          ...read('retain-second', 'second', value),
          retain: { id: 'second-value', stage: 'call' },
        },
        {
          id: 'same-object-reread',
          args: ['first'],
          result: { identityWith: 'first-value' },
          expected: true,
        },
        {
          id: 'equal-but-distinct-second',
          args: ['second'],
          result: { identityWith: 'first-value' },
          expected: false,
        },
        add('ignore-replacement', { first: entry({ replaced: true }) }),
        {
          id: 'first-object-survives',
          args: ['first'],
          result: { identityWith: 'first-value' },
          expected: true,
        },
        read('literal-original-remains', 'first', value),
        logged('only-two-keys', ['first', 'second']),
      ]),
    );
  cases.push(
    plan('nonnull-entries-without-result', [
      add('stage-nonnull', {
        empty: {},
        number: 7,
        zero: 0,
        falsevalue: false,
        text: 'abc',
        array: [],
      }),
      ...['empty', 'number', 'zero', 'falsevalue', 'text', 'array'].map((key) =>
        read(`undefined-${key}`, key, absent),
      ),
      logged(
        'undefined-hashes',
        ['empty', 'number', 'zero', 'falsevalue', 'text', 'array'],
        absent,
      ),
    ]),
  );
  for (const [name, value] of [
    ['null', null],
    ['undefined', absent],
  ] as [string, JsonValue][])
    cases.push(
      plan(`${name}-entry-cannot-repair`, [
        add('insert-nullish', { broken: value }),
        { id: 'nullish-read-error', args: ['broken'], throws: missing },
        logged('failed-read-unlogged', []),
        add('ignored-repair', { broken: entry(true) }),
        { id: 'still-broken', args: ['broken'], throws: missing },
        method('clear-does-not-delete', 'clear', []),
        { id: 'still-broken-after-clear', args: ['broken'], throws: missing },
        add('another-key', { other: entry(8) }),
        read('other-succeeds', 'other', 8),
        logged('only-other-logged', ['other']),
      ]),
    );
  cases.push(
    plan('prelogged-hashes-without-exposure', [
      method('prelog-both', 'addLoggedInternal', [
        { alpha: entry(true, 'hash-a'), beta: entry(0, 'hash-b') },
      ]),
      method(
        'already-logged',
        'getLogged',
        [],
        [
          { identifier: 'alpha', hash: 'hash-a' },
          { identifier: 'beta', hash: 'hash-b' },
        ],
      ),
      read('prelogged-alpha', 'alpha', true),
      read('prelogged-beta', 'beta', 0),
      method('prelogged-duplicate', 'addLoggedInternal', [
        { alpha: entry(false, 'replacement-hash') },
      ]),
      read('duplicate-not-updated', 'alpha', true),
      method(
        'original-hashes',
        'getLogged',
        [],
        [
          { identifier: 'alpha', hash: 'hash-a' },
          { identifier: 'beta', hash: 'hash-b' },
        ],
      ),
    ]),
  );
  cases.push(
    plan('numeric-and-read-order', [
      add('stage-out-of-order', { '10': entry(10), '2': entry(2), b: entry('b'), a: entry('a') }),
      logged('add-does-not-log', []),
      read('read-b-first', 'b', 'b'),
      read('read-ten', '10', 10),
      read('read-two', '2', 2),
      read('read-a-last', 'a', 'a'),
      logged('object-key-order', ['2', '10', 'b', 'a']),
    ]),
  );
  cases.push(
    plan('real-returned-metrics-mutation', [
      add('stage-carrier-and-alpha', { stats: entry({ entry: 0, dup_entry: 0 }), alpha: entry(1) }),
      {
        ...read('retain-provider-returned-stats', 'stats', { entry: 0, dup_entry: 0 }),
        retain: { id: 'stats', stage: 'call' },
      },
      add('mixed-batch-one', { alpha: entry(9), beta: entry(2) }, reference('stats')),
      read('stats-after-one', 'stats', { entry: 2, dup_entry: 1 }),
      read('alpha-not-replaced', 'alpha', 1),
      read('beta-added', 'beta', 2),
      add('mixed-batch-two', { beta: entry(9), gamma: entry(3) }, reference('stats')),
      read('stats-after-two', 'stats', { entry: 4, dup_entry: 2 }),
      { id: 'same-real-stats', args: ['stats'], result: { identityWith: 'stats' }, expected: true },
      read('gamma-added', 'gamma', 3),
      logged('actual-read-log', ['stats', 'alpha', 'beta', 'gamma']),
    ]),
  );
  cases.push(
    plan('metrics-missing-counters-become-nan', [
      add('stage-empty-stats', { stats: entry({}) }),
      { ...read('retain-empty-stats', 'stats', {}), retain: { id: 'stats', stage: 'call' } },
      add('new-entry-count', { a: entry(false) }, reference('stats')),
      read('entry-nan', 'stats', { entry: nan }),
      add('duplicate-count', { a: entry(true) }, reference('stats')),
      read('both-nan', 'stats', { entry: nan, dup_entry: nan }),
      read('first-false-stays', 'a', false),
    ]),
  );
  const retry: Probe[] = [];
  [1, true, 'not-object'].forEach((metrics, index) => {
    const key = `retry-${index}`;
    retry.push(
      {
        id: `bad-metrics-${index}`,
        export: 'add',
        args: [{ [key]: entry(index) }, metrics],
        throws: { name: 'TypeError' },
      },
      { id: `not-installed-${index}`, args: [key], throws: missing },
      add(`retry-without-metrics-${index}`, { [key]: entry(index) }),
      read(`successful-retry-${index}`, key, index),
    );
  });
  cases.push(plan('failed-metrics-before-insert-retry', retry));
  cases.push(
    plan('prelogged-null-entry-log-error', [
      method('prelog-null', 'addLoggedInternal', [{ broken: null }]),
      {
        id: 'getlogged-null-hash-error',
        export: 'getLogged',
        args: [],
        throws: { name: 'TypeError' },
      },
      { id: 'null-reader-invariant', args: ['broken'], throws: missing },
      method('repair-ignored-add-good', 'addLoggedInternal', [
        { broken: entry(false), good: entry(true) },
      ]),
      read('good-key-still-readable', 'good', true),
      { id: 'log-still-broken', export: 'getLogged', args: [], throws: { name: 'TypeError' } },
      method('clear-not-repair', 'clear', []),
      {
        id: 'log-still-broken-after-clear',
        export: 'getLogged',
        args: [],
        throws: { name: 'TypeError' },
      },
    ]),
  );
  for (const seed of [3, 19]) {
    const expected = new Map<string, JsonValue>();
    const seen = new Set<string>();
    let entries = 0,
      duplicates = 0;
    const probes: Probe[] = [
      add('stage-stats-carrier', { stats: entry({ entry: 0, dup_entry: 0 }) }),
      {
        ...read('retain-source-stats', 'stats', { entry: 0, dup_entry: 0 }),
        retain: { id: 'stats', stage: 'call' },
      },
    ];
    seen.add('stats');
    for (let batch = 0; batch < 6; batch++) {
      const pairs: [string, JsonValue][] = Array.from({ length: 4 }, (_, item) => {
        const n = batch * 4 + item;
        return [`k-${seed}-${n}`, [false, 0, '', null, true, seed + n][(n + seed) % 6]!];
      });
      if (batch > 0) pairs.push([`k-${seed}-${batch - 1}`, 'ignored']);
      const input: Record<string, JsonValue> = {};
      for (const [key, value] of pairs) {
        input[key] = entry(value);
        entries++;
        if (expected.has(key)) duplicates++;
        else expected.set(key, value);
      }
      probes.push(add(`batch-${batch}`, input, reference('stats')));
      for (const [key] of pairs) {
        probes.push(read(`read-${batch}-${key}`, key, expected.get(key)!));
        seen.add(key);
      }
      probes.push(
        read(`counters-${batch}`, 'stats', { entry: entries, dup_entry: duplicates }),
        logged(`logged-${batch}`, [...seen]),
      );
      if (batch % 2 === 1) probes.push(method(`noop-clear-${batch}`, 'clear', []));
    }
    probes.push({
      id: 'metrics-identity-survives-history',
      args: ['stats'],
      result: { identityWith: 'stats' },
      expected: true,
    });
    cases.push(plan(`generated-first-write-history-${seed}`, probes));
  }
  return cases;
}
