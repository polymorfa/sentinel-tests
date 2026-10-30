import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const method = (id: string, name: string, args: JsonValue[], expected: JsonValue): Probe => ({
  id,
  method: name,
  args,
  expected,
});
const lruCase = (id: string, max: JsonValue, probes: Probe[]): BehaviorCase => ({
  schemaVersion: 1,
  id: `cache-state-lru-${id}-v1`,
  version: 1,
  module: 'WALRUMap',
  export: 'LRUMap',
  construct: { args: [{ max }] },
  probes,
});
const set = (id: string, key: JsonValue, value: JsonValue) =>
  method(id, 'set', [key, value], absent);
const get = (id: string, key: JsonValue, value: JsonValue) => method(id, 'get', [key], value);
const has = (id: string, key: JsonValue, value: boolean) => method(id, 'has', [key], value);
const size = (id: string, value: number) => method(id, 'size', [], value);

/** Ordered-list reference model, independent of the archived implementation's Map. */
function generatedLRU(max: number, page: number): BehaviorCase {
  let ordered: { key: string; value: JsonValue }[] = [];
  const probes: Probe[] = [];
  const update = (key: string, value: JsonValue) => {
    ordered = ordered.filter((entry) => entry.key !== key);
    ordered.push({ key, value });
    ordered = ordered.slice(Math.max(0, ordered.length - max));
  };
  for (let index = 0; index < max; index++) {
    update(`seed-${index}`, index);
    probes.push(set(`seed-${index}`, `seed-${index}`, index));
  }
  let random = (0x5eedcafe ^ max ^ (page << 8)) >>> 0;
  const next = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0);
  const values: JsonValue[] = [
    0,
    false,
    '',
    null,
    absent,
    ['odd', 1, null],
    { nested: [false, 0] },
  ];
  for (let round = 0; round < 16; round++) {
    const key = `key-${next() % 43}`;
    const action = next() % 5;
    const found = () => ordered.find((entry) => entry.key === key);
    if (action < 3) {
      const value = values[next() % values.length]!;
      update(key, value);
      probes.push(set(`r-${round}-set`, key, value));
    } else if (action === 3) {
      ordered = ordered.filter((entry) => entry.key !== key);
      probes.push(method(`r-${round}-delete`, 'delete', [key], absent));
    } else probes.push(get(`r-${round}-read`, key, found()?.value ?? (found() ? null : absent)));
    probes.push(
      has(`r-${round}-has`, key, Boolean(found())),
      get(`r-${round}-get`, key, found()?.value ?? (found() ? null : absent)),
      size(`r-${round}-size`, ordered.length),
    );
  }
  return lruCase(`generated-capacity-${max}-page-${page}`, max, probes);
}

export function lruStateCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [
    lruCase('read-does-not-refresh-set-does', 2, [
      size('initial-size', 0),
      set('set-a', 'a', 1),
      set('set-b', 'b', 2),
      get('get-a-does-not-promote', 'a', 1),
      set('set-c-evicts-a', 'c', 3),
      has('a-evicted-after-read', 'a', false),
      get('a-missing', 'a', absent),
      get('b-retained', 'b', 2),
      set('replace-b-promotes', 'b', 20),
      set('set-d-evicts-c', 'd', 4),
      has('c-evicted', 'c', false),
      get('b-new-value-retained', 'b', 20),
      size('at-capacity', 2),
      method('delete-b', 'delete', ['b'], absent),
      has('deleted-b', 'b', false),
      size('after-delete', 1),
      method('delete-missing', 'delete', ['missing'], absent),
      size('missing-delete-noop', 1),
      method('clear', 'clear', [], absent),
      size('after-clear', 0),
      get('clear-removes-d', 'd', absent),
      set('reuse-after-clear', 'new', false),
      get('new-after-clear', 'new', false),
      size('reused-size', 1),
    ]),
  ];
  for (const key of [null, absent]) {
    const label = key === null ? 'null' : 'undefined';
    cases.push(
      lruCase(`nullish-oldest-${label}`, 1, [
        set('insert-nullish', key, 'oldest'),
        set('insert-b', 'b', 2),
        size('nullish-oldest-skips-eviction', 2),
        set('insert-c', 'c', 3),
        size('nullish-oldest-still-blocks', 3),
        get('nullish-retained', key, 'oldest'),
        get('b-retained-over-capacity', 'b', 2),
        get('c-retained-over-capacity', 'c', 3),
        method('remove-nullish', 'delete', [key], absent),
        size('two-records-remain', 2),
        set('insert-d-evicts-one-only', 'd', 4),
        size('over-capacity-not-drained', 2),
        has('b-oldest-evicted', 'b', false),
        get('c-remains-after-single-eviction', 'c', 3),
        get('d-remains-after-single-eviction', 'd', 4),
        set('replace-c-promotes-and-evicts-d', 'c', 30),
        size('eventual-capacity', 1),
        get('c-new-value', 'c', 30),
        has('d-evicted-by-c-update', 'd', false),
        has('nullish-not-recreated', key, false),
        method('clear', 'clear', [], absent),
        size('clear-recovers', 0),
      ]),
    );
  }
  cases.push(
    lruCase('primitive-key-identity', 16, [
      set('number-zero', 0, 'number'),
      set('string-zero', '0', 'string'),
      set('false', false, 'boolean'),
      set('nan', { $type: 'number', value: 'NaN' }, 'nan'),
      get('number-zero-read', 0, 'number'),
      get('string-zero-read', '0', 'string'),
      get('false-read', false, 'boolean'),
      get('nan-same-value-zero', { $type: 'number', value: 'NaN' }, 'nan'),
      set('repeated-number-replaces-zero', 0, 'replaced'),
      get('zero-observes-repeated-number-write', 0, 'replaced'),
      size('four-distinct-primitive-keys', 4),
      set('present-undefined', 'undefined-value', absent),
      has('undefined-value-present', 'undefined-value', true),
      get('undefined-value-result', 'undefined-value', absent),
      has('missing-distinct-from-undefined', 'missing', false),
    ]),
  );
  for (const max of [0, 1, 2, 3, 8, 31])
    for (let page = 0; page < 4; page++) cases.push(generatedLRU(max, page));
  return cases;
}

const epoch = Date.parse('2000-01-01T00:00:00.000Z');
const clock = (ms: number) => new Date(epoch + ms).toISOString();
const call = (
  id: string,
  exported: string,
  args: JsonValue[],
  expected: JsonValue,
  ms?: number,
): Probe => ({
  id,
  export: exported,
  args,
  expected,
  ...(ms === undefined ? {} : { clock: clock(ms) }),
});
const suggestion = (id: string): JsonValue => [`synthetic-${id}`];
const put = (id: string, text: string, tone: string, value: JsonValue, ms?: number) =>
  call(id, 'cacheSuggestions', [text, tone, value], absent, ms);
const read = (id: string, text: string, tone: string, value: JsonValue, ms?: number) =>
  call(id, 'getCachedSuggestions', [text, tone], value, ms);
const cacheSize = (id: string, expected: number) => call(id, 'getCacheSize', [], expected);
const wwCase = (id: string, probes: Probe[]): BehaviorCase => ({
  schemaVersion: 1,
  id: `cache-state-wwai-${id}-v1`,
  version: 1,
  module: 'WAWebWWAICacheStore',
  export: 'getCacheSize',
  probes,
  context: { clock: clock(0) },
  stubs: [{ module: 'cr:6640', exports: null }],
});

export function wwAiCacheCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [
    wwCase('expiry-quantized-boundaries', [
      cacheSize('fresh-module-empty', 0),
      put('insert', 'text', 'tone', suggestion('old'), 0),
      read('just-before-ttl', 'text', 'tone', suggestion('old'), 299999),
      read('exact-ttl-retained', 'text', 'tone', suggestion('old'), 300000),
      read('fractional-second-after-ttl-retained', 'text', 'tone', suggestion('old'), 300999),
      read('next-second-expired-without-timestamp-refresh', 'text', 'tone', null, 301000),
      cacheSize('expired-read-deletes-entry', 0),
      put('reuse-expired-key', 'text', 'tone', suggestion('new'), 302000),
      read('replacement-live', 'text', 'tone', suggestion('new'), 302000),
      read('clock-rollback-remains-live', 'text', 'tone', suggestion('new'), -1000),
    ]),
    wwCase('empty-updates-and-key-collisions', [
      put('empty-does-not-create', 'text', 'tone', []),
      cacheSize('empty-size', 0),
      put('first', 'text', 'tone', suggestion('first')),
      put('empty-does-not-replace', 'text', 'tone', []),
      read('old-value-retained', 'text', 'tone', suggestion('first')),
      put('same-text-other-tone', 'text', 'other', suggestion('other')),
      cacheSize('tone-separates', 2),
      put('colon-form-one', 'b:c', 'a', suggestion('colon-one')),
      put('colon-form-two-collides', 'c', 'a:b', suggestion('colon-two')),
      read('collision-last-write', 'b:c', 'a', suggestion('colon-two')),
      cacheSize('collision-shares-entry', 3),
      put('unicode-odd-key', 'odd\u0000\n😀', '', [false, 0, null, '']),
      read('unicode-odd-value', 'odd\u0000\n😀', '', [false, 0, null, '']),
    ]),
  ];
  cases.push(
    wwCase('real-clock-skew-state', [
      { ...call('initial-skew', 'getClockSkew', [], 0), module: 'WATimeUtils' },
      put('positive-skew-seed', 'positive', 'tone', suggestion('positive'), 0),
      { ...call('set-positive-skew', 'setClockSkew', [301], absent), module: 'WATimeUtils' },
      { ...call('positive-skew-observed', 'getClockSkew', [], 301), module: 'WATimeUtils' },
      read('positive-skew-delays-expiration', 'positive', 'tone', suggestion('positive'), 601000),
      { ...call('restore-zero-before-read', 'setClockSkew', [0], absent), module: 'WATimeUtils' },
      read('restored-clock-expires-same-entry', 'positive', 'tone', null, 601000),
      put('negative-skew-seed', 'negative', 'tone', suggestion('negative'), 0),
      { ...call('set-negative-skew', 'setClockSkew', [-301], absent), module: 'WATimeUtils' },
      read('negative-skew-advances-expiration', 'negative', 'tone', null, 0),
      { ...call('restore-zero-finally', 'setClockSkew', [0], absent), module: 'WATimeUtils' },
      { ...call('final-skew-restored', 'getClockSkew', [], 0), module: 'WATimeUtils' },
      cacheSize('expired-entries-deleted', 0),
    ]),
  );
  const eviction: Probe[] = [];
  for (let index = 0; index < 20; index++)
    eviction.push(put(`fill-${index}`, `key-${index}`, 'tone', suggestion(String(index)), 0));
  eviction.push(
    cacheSize('full-size', 20),
    read('refresh-oldest-order', 'key-0', 'tone', suggestion('0'), 1000),
    put('twenty-first', 'key-20', 'tone', suggestion('20'), 1000),
    cacheSize('size-bounded', 20),
    read('refreshed-zero-retained', 'key-0', 'tone', suggestion('0'), 1000),
    read('one-evicted', 'key-1', 'tone', null, 1000),
    put('replace-two', 'key-2', 'tone', suggestion('replacement'), 1000),
    put('twenty-second', 'key-21', 'tone', suggestion('21'), 1000),
    read('two-replacement-retained', 'key-2', 'tone', suggestion('replacement'), 1000),
    read('three-now-evicted', 'key-3', 'tone', null, 1000),
    cacheSize('replacement-did-not-add-entry', 20),
  );
  cases.push(wwCase('capacity-and-read-refresh', eviction));
  for (let page = 0; page < 4; page++) {
    const probes: Probe[] = [];
    const ordered: string[] = [];
    for (let index = 0; index < 24; index++) {
      const key = `page-${page}-key-${index}`;
      ordered.push(key);
      if (ordered.length > 20) ordered.shift();
      probes.push(
        put(`load-${index}`, key, 'tone', suggestion(key), index * 1000),
        cacheSize(`size-${index}`, Math.min(index + 1, 20)),
      );
    }
    for (let index = 0; index < 24; index++) {
      const key = `page-${page}-key-${index}`;
      probes.push(
        read(
          `observe-${index}`,
          key,
          'tone',
          ordered.includes(key) ? suggestion(key) : null,
          24000,
        ),
      );
    }
    cases.push(wwCase(`generated-capacity-page-${page}`, probes));
  }
  return cases;
}
