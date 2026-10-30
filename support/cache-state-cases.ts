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

const reference = (value: string): JsonValue => ({ $type: 'reference', value });
const retainGet = (id: string, key: JsonValue, handle: string, expected: JsonValue): Probe => ({
  ...get(id, key, expected),
  retain: { id: handle, stage: 'call' },
});
const identicalGet = (id: string, key: JsonValue, handle: string): Probe => ({
  ...get(id, key, true),
  result: { identityWith: handle },
});
const objectKey = (): JsonValue => ({ kind: 'equal-shaped-key' });
function acquireKeys(count: number): Probe[] {
  const probes: Probe[] = [];
  for (let index = 0; index < count; index++)
    probes.push(
      set(`seed-key-${index}`, 'temporary-key', objectKey()),
      retainGet(`retain-key-${index}`, 'temporary-key', `key-${index}`, objectKey()),
      method(`remove-seed-${index}`, 'delete', ['temporary-key'], absent),
    );
  return probes;
}

/** Identity tokens are names in an independent ordered list, never serialized object equality. */
function generatedObjectKeys(max: number, page: number): BehaviorCase {
  const probes = acquireKeys(6);
  let ordered: { key: number; value: number }[] = [];
  let state = (0x17d3c9ab ^ max ^ (page * 65537)) >>> 0;
  const next = () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0);
  const observe = (id: string, key: number) => {
    const entry = ordered.find((entry) => entry.key === key);
    return entry
      ? identicalGet(id, reference(`key-${key}`), `key-${entry.value}`)
      : get(id, reference(`key-${key}`), absent);
  };
  for (let round = 0; round < 12; round++) {
    const key = next() % 6,
      action = (next() >>> 16) % 8;
    if (action < 4) {
      const value = next() % 6;
      ordered = ordered.filter((entry) => entry.key !== key);
      ordered.push({ key, value });
      if (ordered.length > max) ordered.shift();
      probes.push(set(`round-${round}-set`, reference(`key-${key}`), reference(`key-${value}`)));
    } else if (action < 6) {
      ordered = ordered.filter((entry) => entry.key !== key);
      probes.push(method(`round-${round}-delete`, 'delete', [reference(`key-${key}`)], absent));
    } else if (action === 6) probes.push(observe(`round-${round}-read`, key));
    else {
      ordered = [];
      probes.push(method(`round-${round}-clear`, 'clear', [], absent));
    }
    probes.push(
      has(
        `round-${round}-presence`,
        reference(`key-${key}`),
        ordered.some((entry) => entry.key === key),
      ),
      observe(`round-${round}-identity`, key),
      size(`round-${round}-size`, ordered.length),
    );
  }
  for (let key = 0; key < 6; key++)
    probes.push(
      has(
        `final-${key}-presence`,
        reference(`key-${key}`),
        ordered.some((entry) => entry.key === key),
      ),
      observe(`final-${key}-identity`, key),
    );
  return lruCase(`reference-token-capacity-${max}-page-${page}`, max, probes);
}

export function lruReferenceCases(): BehaviorCase[] {
  const probes = acquireKeys(3);
  probes.push(
    set('seed-alias', 'temporary-key', reference('key-0')),
    retainGet('retain-same-key-alias', 'temporary-key', 'alias', objectKey()),
    method('remove-alias-seed', 'delete', ['temporary-key'], absent),
    set('store-first-key', reference('key-0'), { payload: ['first'] }),
    retainGet('retain-first-value', reference('key-0'), 'value-a', { payload: ['first'] }),
    set('store-equal-shaped-distinct-key', reference('key-1'), { payload: ['second'] }),
    retainGet('retain-second-value', reference('key-1'), 'value-b', { payload: ['second'] }),
    identicalGet('read-first-does-not-promote', reference('key-0'), 'value-a'),
    identicalGet('alias-addresses-first-key', reference('alias'), 'value-a'),
    has('fresh-json-shape-is-not-a-key', objectKey(), false),
    get('fresh-json-shape-has-no-value', objectKey(), absent),
    size('two-distinct-objects', 2),
    set('third-key-evicts-first-despite-reads', reference('key-2'), { payload: ['third'] }),
    has('first-evicted', reference('key-0'), false),
    has('alias-also-evicted', reference('alias'), false),
    identicalGet('second-value-keeps-identity', reference('key-1'), 'value-b'),
    set('replace-second-and-promote', reference('key-1'), { payload: ['replacement'] }),
    {
      ...retainGet('retain-replacement-value', reference('key-1'), 'replacement', false),
      result: { identityWith: 'value-b' },
    },
    set('reuse-first-key-and-old-value', reference('alias'), reference('value-a')),
    has('third-evicted-after-second-write-refresh', reference('key-2'), false),
    identicalGet('old-value-survived-eviction', reference('key-0'), 'value-a'),
    method('delete-via-alias', 'delete', [reference('alias')], absent),
    has('delete-removes-original-key', reference('key-0'), false),
    method('clear-object-keys', 'clear', [], absent),
    size('empty-after-clear', 0),
    has('clear-removes-second', reference('key-1'), false),
    set('reuse-retained-key-and-value-after-clear', reference('key-2'), reference('replacement')),
    identicalGet('retained-values-outlive-clear', reference('key-2'), 'replacement'),
  );
  const cases = [lruCase('reference-alias-replacement-eviction-clear', 2, probes)];
  for (const max of [1, 2, 3, 8])
    for (let page = 0; page < 2; page++) cases.push(generatedObjectKeys(max, page));
  return cases;
}

const retainedRead = (
  id: string,
  text: string,
  handle: string,
  expected: JsonValue,
  ms?: number,
): Probe => ({
  ...read(id, text, 'tone', expected, ms),
  retain: { id: handle, stage: 'call' },
});
const identicalRead = (id: string, text: string, handle: string, ms?: number): Probe => ({
  ...read(id, text, 'tone', true, ms),
  result: { identityWith: handle },
});
function generatedSuggestionIdentities(page: number): BehaviorCase {
  const probes: Probe[] = [];
  let ordered: { key: string; token: number }[] = [];
  const write = (key: string, token: number) => {
    ordered = ordered.filter((entry) => entry.key !== key);
    ordered.push({ key, token });
    if (ordered.length > 20) ordered.shift();
  };
  const observe = (id: string, key: string) => {
    const entry = ordered.find((entry) => entry.key === key);
    if (!entry) return read(id, key, 'tone', null, 23000);
    ordered = ordered.filter((other) => other.key !== key);
    ordered.push(entry);
    return identicalRead(id, key, `array-${entry.token}`, 23000);
  };
  for (let index = 0; index < 22; index++) {
    const key = `page-${page}-key-${index}`;
    write(key, index);
    probes.push(
      put(`seed-${index}`, key, 'tone', ['equal-shaped-array'], 0),
      retainedRead(`retain-${index}`, key, `array-${index}`, ['equal-shaped-array'], 0),
    );
  }
  for (let round = 0; round < 10; round++) {
    const key = `page-${page}-key-${(round * 7 + page) % 26}`;
    if ((round + page) % 3 === 0) probes.push(put(`round-${round}-empty`, key, 'tone', [], 23000));
    else if ((round + page) % 3 === 1) {
      const token = (round * 3 + page) % 22;
      write(key, token);
      probes.push(
        put(`round-${round}-alias-write`, key, 'tone', reference(`array-${token}`), 23000),
      );
    } else probes.push(observe(`round-${round}-read`, key));
    probes.push(
      observe(`round-${round}-identity`, key),
      cacheSize(`round-${round}-size`, ordered.length),
    );
  }
  for (let index = 0; index < 6; index++)
    probes.push(observe(`final-${index}-identity`, `page-${page}-key-${index}`));
  probes.push(
    read('expired-latest-key', ordered.at(-1)!.key, 'tone', null, 325000),
    put(
      'reuse-evicted-array-after-expiry',
      `page-${page}-reused`,
      'tone',
      reference('array-0'),
      325000,
    ),
    identicalRead('reused-array-identity', `page-${page}-reused`, 'array-0', 325000),
  );
  return wwCase(`reference-token-page-${page}`, probes);
}

export function wwAiReferenceCases(): BehaviorCase[] {
  const cases = [
    wwCase('reference-repeated-empty-and-replacement', [
      put('insert-original', 'text', 'tone', ['equal-shaped-array'], 0),
      retainedRead('retain-original-array', 'text', 'original', ['equal-shaped-array'], 0),
      identicalRead('repeat-returns-original-array', 'text', 'original', 1000),
      put('empty-update-does-not-replace', 'text', 'tone', [], 2000),
      identicalRead('empty-keeps-original-identity', 'text', 'original', 2000),
      put('equal-content-replacement-is-distinct', 'text', 'tone', ['equal-shaped-array'], 3000),
      {
        ...retainedRead('retain-distinct-replacement', 'text', 'replacement', false, 3000),
        result: { identityWith: 'original' },
      },
      identicalRead('replacement-keeps-new-identity', 'text', 'replacement', 3000),
      put('alias-original-under-another-key', 'alias', 'tone', reference('original'), 3000),
      identicalRead('old-array-still-addressable', 'alias', 'original', 3000),
    ]),
    wwCase('reference-array-mutation-and-empty-suggestions', [
      put('insert', 'text', 'tone', ['mutable'], 0),
      retainedRead('retain', 'text', 'array', ['mutable'], 0),
      { ...read('mutate-returned-array', 'text', 'tone', 'mutable', 0), result: { method: 'pop' } },
      read('cache-observes-empty-array', 'text', 'tone', [], 1000),
      identicalRead('empty-array-same-reference', 'text', 'array', 1000),
      put('empty-update-is-noop-even-on-empty-entry', 'text', 'tone', [], 1000),
      cacheSize('empty-array-entry-retained', 1),
      {
        ...read('restore-through-returned-array', 'text', 'tone', 1, 1000),
        result: { method: 'push', args: ['restored'] },
      },
      read('mutation-visible-through-cache', 'text', 'tone', ['restored'], 1000),
      identicalRead('mutation-preserves-array-identity', 'text', 'array', 1000),
      read('expiry-removes-entry', 'text', 'tone', null, 301000),
      put('reuse-array-after-expiry', 'reused', 'tone', reference('array'), 302000),
      identicalRead('old-array-survives-expiry', 'reused', 'array', 302000),
    ]),
    wwCase('reference-ttl-keeps-identity-without-refresh', [
      put('insert', 'text', 'tone', ['ttl'], 0),
      retainedRead('retain', 'text', 'array', ['ttl'], 0),
      identicalRead('before-ttl', 'text', 'array', 299999),
      identicalRead('at-ttl', 'text', 'array', 300000),
      identicalRead('subsecond-after-ttl', 'text', 'array', 300999),
      read('next-second-expires', 'text', 'tone', null, 301000),
      cacheSize('expired-entry-removed', 0),
      put('same-array-new-entry', 'text', 'tone', reference('array'), 302000),
      identicalRead('new-entry-old-array', 'text', 'array', 302000),
      identicalRead('new-entry-age300000', 'text', 'array', 602999),
      read('new-entry-age301000-expires', 'text', 'tone', null, 603000),
    ]),
  ];
  const promotion: Probe[] = [];
  for (let index = 0; index < 20; index++) {
    promotion.push(put(`fill-${index}`, `key-${index}`, 'tone', ['equal-shaped-array'], 0));
    if (index < 2)
      promotion.push(
        retainedRead(
          `retain-${index}`,
          `key-${index}`,
          `array-${index}`,
          ['equal-shaped-array'],
          0,
        ),
      );
  }
  promotion.push(
    identicalRead('promote-zero-without-copy', 'key-0', 'array-0', 1000),
    put('overflow', 'key-20', 'tone', ['equal-shaped-array'], 1000),
    read('one-evicted', 'key-1', 'tone', null, 1000),
    identicalRead('zero-still-original-array', 'key-0', 'array-0', 1000),
    cacheSize('still-capacity20', 20),
    put('reuse-evicted-array', 'key-21', 'tone', reference('array-1'), 1000),
    identicalRead('reused-array-keeps-identity', 'key-21', 'array-1', 1000),
    read('two-now-evicted', 'key-2', 'tone', null, 1000),
  );
  cases.push(wwCase('reference-promotion-and-evicted-array-lifetime', promotion));
  for (let page = 0; page < 2; page++) cases.push(generatedSuggestionIdentities(page));
  return cases;
}
