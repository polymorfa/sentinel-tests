import type { BehaviorCase, JsonValue, Probe } from './types.ts';
const absent: JsonValue = { $type: 'undefined' };
const nan: JsonValue = { $type: 'number', value: 'NaN' };
const ref = (value: string): JsonValue => ({ $type: 'reference', value });
const set = (id: string, key: JsonValue, value: JsonValue): Probe => ({
  id,
  method: 'set',
  args: [key, value],
  expected: absent,
});
const get = (id: string, key: JsonValue, expected: JsonValue): Probe => ({
  id,
  method: 'get',
  args: [key],
  expected,
});
const same = (id: string, key: JsonValue, retained: string, expected = true): Probe => ({
  ...get(id, key, expected),
  result: { identityWith: retained },
});
const make = (name: string, args: JsonValue[], probes: Probe[]): BehaviorCase => ({
  schemaVersion: 1,
  id: `fifo-cache-state-${name}-v1`,
  version: 1,
  module: 'LRUCache',
  export: '$module',
  construct: { args },
  probes,
});

/** Original LRUCache has insertion-occurrence FIFO eviction, not read promotion. */
export function fifoCacheStateCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  for (const capacity of [1, 2, 3, 5]) {
    const probes: Probe[] = [get('initial-miss', 'missing', null)];
    for (let n = 0; n < capacity; n++) probes.push(set(`fill-${n}`, `key-${n}`, n));
    probes.push(
      get('oldest-read', 'key-0', 0),
      get('repeated-oldest-read', 'key-0', 0),
      get('miss-does-not-promote', 'missing', null),
      set('overflow', 'new', 99),
      get('oldest-evicted', 'key-0', null),
    );
    for (let n = 1; n < capacity; n++) probes.push(get(`survivor-${n}`, `key-${n}`, n));
    probes.push(get('new-value', 'new', 99));
    cases.push(make(`read-does-not-refresh-capacity-${capacity}`, [capacity], probes));
  }
  cases.push(
    make(
      'duplicate-insertion-evicts-overwritten-key',
      [2],
      [
        set('a-first', 'a', 1),
        set('b-first', 'b', 2),
        get('a-before-overwrite', 'a', 1),
        set('a-overwrite', 'a', 3),
        get('a-deleted-by-old-occurrence', 'a', null),
        get('b-still-present', 'b', 2),
        set('c-next', 'c', 4),
        get('b-next-evicted', 'b', null),
        get('c-present', 'c', 4),
        set('a-retry', 'a', 5),
        get('a-retry-deleted-by-stale-occurrence', 'a', null),
        get('c-survives', 'c', 4),
        set('d-next', 'd', 6),
        get('c-evicted', 'c', null),
        get('d-present', 'd', 6),
      ],
    ),
  );
  const keys: JsonValue[] = [
    0,
    1,
    '1',
    false,
    true,
    null,
    absent,
    nan,
    'NaN',
    '',
    'odd\0key',
    '🌍',
  ];
  const primitive: Probe[] = [];
  keys.forEach((key, n) => primitive.push(set(`store-${n}`, key, n + 10)));
  keys.forEach((key, n) => primitive.push(get(`distinct-${n}`, key, n + 10)));
  primitive.push(
    get('fresh-nan-is-same-key', { $type: 'number', value: 'NaN' }, 17),
    get('unseen-key', 'unseen', null),
  );
  cases.push(make('primitive-key-distinctness', [32], primitive));
  cases.push(
    make(
      'nullish-and-literal-values',
      [8],
      [
        get('missing', 'missing', null),
        set('store-null', 'null', null),
        set('store-undefined', 'undefined', absent),
        set('store-false', 'false', false),
        set('store-zero', 'zero', 0),
        set('store-empty', 'empty', ''),
        set('store-nan', 'nan', nan),
        get('null-value', 'null', null),
        get('undefined-normalized-to-null', 'undefined', null),
        get('false-value', 'false', false),
        get('zero-value', 'zero', 0),
        get('empty-value', 'empty', ''),
        get('nan-value', 'nan', nan),
        get('still-missing', 'missing', null),
      ],
    ),
  );
  cases.push(
    make(
      'real-returned-object-keys-and-lifetime',
      [3],
      [
        set('seed-key-record', 'seed', { token: 'key' }),
        {
          ...get('obtain-real-key', 'seed', { token: 'key' }),
          retain: { id: 'key', stage: 'call' },
        },
        set('use-real-key', ref('key'), { value: 'stored' }),
        {
          ...get('obtain-real-value', ref('key'), { value: 'stored' }),
          retain: { id: 'value', stage: 'call' },
        },
        get('equal-new-key-misses', { token: 'key' }, null),
        same('repeated-seed-is-same', 'seed', 'key'),
        set('store-key-alias', 'alias', ref('key')),
        same('alias-returns-real-key', 'alias', 'key'),
        set('evict-seed', 'extra', 0),
        get('seed-gone', 'seed', null),
        same('key-value-survives-seed-eviction', ref('key'), 'value'),
        set('evict-object-key', 'tail', 1),
        get('object-key-gone', ref('key'), null),
        same('alias-still-holds-key', 'alias', 'key'),
        set('retry-original-key', ref('key'), ref('value')),
        same('retry-keeps-original-value', ref('key'), 'value'),
        get('alias-evicted', 'alias', null),
      ],
    ),
  );
  const profiles: { name: string; args: JsonValue[]; retained: number[] }[] = [
    { name: 'omitted', args: [], retained: [0, 1, 2] },
    { name: 'undefined', args: [absent], retained: [0, 1, 2] },
    { name: 'zero', args: [0], retained: [] },
    { name: 'negative', args: [-2], retained: [] },
    { name: 'nan', args: [nan], retained: [0, 1, 2] },
    { name: 'fractional', args: [1.5], retained: [2] },
    { name: 'numeric-string', args: ['2'], retained: [1, 2] },
  ];
  for (const profile of profiles) {
    const probes = [set('first', 'key-0', 0), set('second', 'key-1', 1), set('third', 'key-2', 2)];
    for (let n = 0; n < 3; n++)
      probes.push(get(`observed-${n}`, `key-${n}`, profile.retained.includes(n) ? n : null));
    cases.push(make(`capacity-characterization-${profile.name}`, profile.args, probes));
  }
  cases.push(
    make(
      'zero-capacity-nullish-dequeue-guard',
      [0],
      [
        set('null-key', null, 1),
        get('null-key-not-deleted', null, 1),
        set('undefined-key', absent, 2),
        get('undefined-key-not-deleted', absent, 2),
        set('ordinary-key', 'ordinary', 3),
        get('ordinary-key-deleted', 'ordinary', null),
        get('null-key-remains', null, 1),
        get('undefined-key-remains', absent, 2),
      ],
    ),
  );
  for (const capacity of [2, 3, 5]) {
    // External model: insertion occurrences are a FIFO log, values use Map identity.
    const values = new Map<string, number>(),
      occurrences: string[] = [];
    const probes: Probe[] = [];
    for (let step = 0; step < 20; step++) {
      const key = `key-${(step * 3 + Math.floor(step / 4)) % 7}`;
      values.set(key, step + 100);
      occurrences.push(key);
      if (occurrences.length > capacity) values.delete(occurrences.shift()!);
      probes.push(set(`step-${step}-set`, key, step + 100));
      for (const [label, selected] of [
        ['key', key],
        ['neighbor', `key-${(step + 1) % 7}`],
        ['oldest', 'key-0'],
      ] as const)
        probes.push(get(`step-${step}-${label}`, selected, values.get(selected) ?? null));
    }
    cases.push(make(`generated-insertion-history-${capacity}`, [capacity], probes));
  }
  return cases;
}
