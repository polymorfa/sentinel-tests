import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const nan: JsonValue = { $type: 'number', value: 'NaN' };
const reference = (value: string): JsonValue => ({ $type: 'reference', value });
const missing = {
  name: 'Invariant Violation',
  message: 'Minified invariant #47458; %s Params: %s',
};
const unavailable = { name: 'Invariant Violation', message: 'Minified invariant #47459; %s' };
const read = (id: string, key: string, expected: JsonValue): Probe => ({
  id,
  args: [key],
  expected,
});
const add = (id: string, entries: JsonValue, metrics?: JsonValue): Probe => ({
  id,
  export: 'add',
  args: metrics === undefined ? [entries] : [entries, metrics],
  expected: absent,
});
const entry = (value: JsonValue): JsonValue => ({ r: value });
function plan(name: string, probes: Probe[]): BehaviorCase {
  return {
    schemaVersion: 1,
    id: `knob-provider-state-${name}-v1`,
    version: 1,
    module: 'justknobx',
    export: '_',
    context: { gates: {} },
    probes,
  };
}
export function knobProviderStateCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  cases.push(
    plan('missing-add-retry', [
      { id: 'missing-first', args: ['alpha'], throws: missing },
      add('add-alpha', { alpha: entry(7) }),
      read('read-alpha', 'alpha', 7),
      add('duplicate-alpha', { alpha: entry(9) }),
      read('first-write-wins', 'alpha', 7),
      { id: 'missing-after-success', args: ['beta'], throws: missing },
      add('add-beta', { beta: entry(11) }),
      read('retry-beta', 'beta', 11),
      read('alpha-still-seven', 'alpha', 7),
    ]),
  );
  const values: JsonValue[] = [
    null,
    false,
    true,
    0,
    -7,
    1.5,
    '',
    '0',
    'false',
    'λ\u0000雪',
    absent,
    nan,
    { $type: 'number', value: 'Infinity' },
    { $type: 'number', value: '-Infinity' },
    { $type: 'BigInt', value: '9007199254740993' },
    [],
    [null, false, 7],
    {},
    { nested: { value: 'literal' } },
  ];
  const raw: Record<string, JsonValue> = {};
  values.forEach((value, index) => {
    raw[`value-${index}`] = entry(value);
  });
  cases.push(
    plan('raw-values', [
      add('stage-raw-values', raw),
      ...values.map((value, index) => read(`raw-${index}`, `value-${index}`, value)),
    ]),
  );
  for (const [name, value] of [
    ['record', { count: 3, name: 'same' }],
    ['array', [1, 'same', null]],
    ['bytes', { $type: 'Uint8Array', value: [0, 127, 128, 255] }],
  ] as [string, JsonValue][]) {
    cases.push(
      plan(`raw-${name}-identity`, [
        add('stage-independent-values', { first: entry(value), second: entry(value) }),
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
        add('ignored-replacement', { first: entry({ replaced: true }) }),
        {
          id: 'identity-survives-duplicate',
          args: ['first'],
          result: { identityWith: 'first-value' },
          expected: true,
        },
        read('literal-original-survives', 'first', value),
      ]),
    );
  }
  cases.push(
    plan('null-entry-cannot-repair', [
      add('insert-null-entry', { broken: null }),
      { id: 'null-entry-error', args: ['broken'], throws: missing },
      add('ignored-repair', { broken: entry(8) }),
      { id: 'still-null-error', args: ['broken'], throws: missing },
      add('different-valid-key', { other: entry(8) }),
      read('other-succeeds', 'other', 8),
    ]),
  );
  cases.push(
    plan('nonnull-entry-without-r', [
      add('stage-nonnull-entries', {
        empty: {},
        number: 5,
        falsevalue: false,
        text: 'abc',
        array: [],
      }),
      ...['empty', 'number', 'falsevalue', 'text', 'array'].map((key) =>
        read(`undefined-${key}`, key, absent),
      ),
    ]),
  );
  cases.push(
    plan('real-metrics-mutation', [
      add('stage-stats-and-alpha', { stats: entry({ entry: 0, dup_entry: 0 }), alpha: entry(1) }),
      {
        ...read('retain-stats', 'stats', { entry: 0, dup_entry: 0 }),
        retain: { id: 'stats', stage: 'call' },
      },
      add('mixed-add-one', { alpha: entry(9), beta: entry(2) }, reference('stats')),
      read('stats-after-one', 'stats', { entry: 2, dup_entry: 1 }),
      read('alpha-not-replaced', 'alpha', 1),
      read('beta-inserted', 'beta', 2),
      add('mixed-add-two', { beta: entry(3), gamma: entry(4) }, reference('stats')),
      read('stats-after-two', 'stats', { entry: 4, dup_entry: 2 }),
      read('beta-not-replaced', 'beta', 2),
      read('gamma-inserted', 'gamma', 4),
      {
        id: 'stats-identity-stable',
        args: ['stats'],
        result: { identityWith: 'stats' },
        expected: true,
      },
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
          id: 'failed-before-cache',
          export: 'add',
          args: [{ fresh: entry(12) }, metrics],
          throws: { name: 'TypeError' },
        },
        { id: 'not-cached-after-failure', args: ['fresh'], throws: missing },
        add('valid-retry', { fresh: entry(12) }),
        read('read-recovered', 'fresh', 12),
        {
          id: 'duplicate-still-fails-first',
          export: 'add',
          args: [{ fresh: entry(13) }, metrics],
          throws: { name: 'TypeError' },
        },
        read('failed-duplicate-preserves', 'fresh', 12),
      ]),
    );
  const falsy: Probe[] = [];
  [null, false, 0, '', nan].forEach((metrics, index) => {
    falsy.push(
      add(`falsy-${index}`, { [`key-${index}`]: entry(index + 10) }, metrics),
      read(`read-falsy-${index}`, `key-${index}`, index + 10),
    );
  });
  cases.push(plan('falsy-metrics-skipped', falsy));
  cases.push(
    plan('metrics-fields-not-initialized', [
      add('stage-empty-stats', { stats: entry({}) }),
      { ...read('retain-empty-stats', 'stats', {}), retain: { id: 'stats', stage: 'call' } },
      add('new-entry', { fresh: entry(1) }, reference('stats')),
      read('entry-becomes-nan', 'stats', { entry: nan }),
      add('duplicate-entry', { fresh: entry(2) }, reference('stats')),
      read('both-fields-nan', 'stats', { entry: nan, dup_entry: nan }),
      read('original-value', 'fresh', 1),
    ]),
  );
  const typed: Probe[] = [add('stage-existing', { existing: entry(23) })];
  for (const method of ['getBool', 'getInt'])
    for (const key of ['missing', 'existing'])
      for (const [index, fallback] of [absent, false, true, 7, 'literal'].entries())
        typed.push({
          id: `${method}-${key}-${index}`,
          export: method,
          args: [key, fallback],
          throws: unavailable,
        });
  typed.push(read('ordinary-read-after-typed-errors', 'existing', 23));
  cases.push(plan('typed-accessors-unavailable', typed));
  for (let history = 0; history < 2; history++) {
    const probes: Probe[] = [
      add('stage-stats', { stats: entry({ entry: 0, dup_entry: 0 }) }),
      {
        ...read('retain-stats', 'stats', { entry: 0, dup_entry: 0 }),
        retain: { id: 'stats', stage: 'call' },
      },
    ];
    for (let batch = 0; batch < 6; batch++) {
      const staged: Record<string, JsonValue> = {},
        duplicates: Record<string, JsonValue> = {};
      for (let index = 0; index < 4; index++) {
        const key = `history-${history}-batch-${batch}-key-${index}`;
        const value = history * 1000 + batch * 4 + index;
        staged[key] = entry(value);
        duplicates[key] = entry(-999);
      }
      probes.push(add(`batch-${batch}-stage`, staged, reference('stats')));
      for (let index = 0; index < 4; index++)
        probes.push(
          read(
            `batch-${batch}-read-${index}`,
            `history-${history}-batch-${batch}-key-${index}`,
            history * 1000 + batch * 4 + index,
          ),
        );
      probes.push(
        add(`batch-${batch}-duplicates`, duplicates, reference('stats')),
        read(`batch-${batch}-oldest`, `history-${history}-batch-0-key-0`, history * 1000),
        read(`batch-${batch}-stats`, 'stats', {
          entry: (batch + 1) * 8,
          dup_entry: (batch + 1) * 4,
        }),
      );
    }
    cases.push(plan(`generated-history-${history}`, probes));
  }
  const largeKey = 'literal-key-雪'.repeat(100),
    largeValue = 'λ\u0000value'.repeat(512);
  cases.push(
    plan('large-odd-key-value', [
      add('stage-large', { [largeKey]: entry(largeValue) }),
      read('read-large', largeKey, largeValue),
      add('duplicate-large', { [largeKey]: entry('ignored') }),
      read('large-first-value-survives', largeKey, largeValue),
    ]),
  );
  return cases;
}
