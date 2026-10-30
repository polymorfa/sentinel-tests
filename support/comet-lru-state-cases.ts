import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const origin = Date.parse('2000-01-01T00:00:00.000Z');
export const cometClock = (offset: number): string => new Date(origin + offset).toISOString();
const call = (
  id: string,
  method: string,
  args: JsonValue[],
  expected: JsonValue,
  time?: number,
): Probe => ({
  id,
  method,
  args,
  expected,
  ...(time === undefined ? {} : { clock: cometClock(time) }),
});
const set = (id: string, key: JsonValue, value: JsonValue, time?: number): Probe =>
  call(id, 'set', [key, value], absent, time);
const get = (id: string, key: JsonValue, expected: JsonValue, time?: number): Probe =>
  call(id, 'get', [key], expected, time);
const has = (id: string, key: JsonValue, expected: boolean, time?: number): Probe =>
  call(id, 'has', [key], expected, time);
function plan(
  name: string,
  capacity: number,
  ttl: number | undefined,
  probes: Probe[],
): BehaviorCase {
  return {
    schemaVersion: 1,
    id: `comet-lru-state-${name}-v1`,
    version: 1,
    module: 'CometLruCache',
    export: 'create',
    construct: { args: ttl === undefined ? [capacity] : [capacity, ttl] },
    context: { clock: cometClock(0), gates: {} },
    probes,
  };
}
export function cometLruStateCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  cases.push(
    plan('exact-deadline-and-no-hit-refresh', 2, 10, [
      set('stage-a', 'a', 'A'),
      get('before-deadline', 'a', 'A', 9),
      get('exact-deadline', 'a', 'A', 10),
      get('one-ms-after', 'a', null, 11),
      has('removed-on-expired-get', 'a', false),
      call('empty-size', 'size', [], 0),
      call('all-slots-restored', 'capacity', [], 2),
    ]),
  );
  cases.push(
    plan('zero-ttl', 2, 0, [
      set('stage-a', 'a', 7),
      get('same-ms-valid', 'a', 7, 0),
      has('stale-has', 'a', true, 1),
      get('next-ms-expired', 'a', null),
      has('expired-key-deleted', 'a', false),
      set('retry-same-key', 'a', 8),
      get('same-ms-retry-valid', 'a', 8),
    ]),
  );
  cases.push(
    plan('default-ttl', 2, undefined, [
      set('stage-default', 'a', 1),
      get('one-day-later', 'a', 1, 86400000),
      get('selected-far-later', 'a', 1, 3155760000000),
      call('still-size-one', 'size', [], 1),
      call('one-slot-left', 'capacity', [], 1),
    ]),
  );
  cases.push(
    plan('lazy-expiry-and-delete', 3, 10, [
      set('stage-a', 'a', 1),
      set('stage-b', 'b', 2),
      has('expired-has-a-stale', 'a', true, 11),
      call('expired-size-stale', 'size', [], 2),
      call('expired-capacity-stale', 'capacity', [], 1),
      get('prune-a', 'a', null),
      call('one-expired-entry-remains', 'size', [], 1),
      has('b-still-stale', 'b', true),
      call('delete-b', 'delete', ['b'], absent),
      has('b-deleted', 'b', false),
      call('delete-missing', 'delete', ['missing'], absent),
      call('empty-again', 'size', [], 0),
      call('slots-recovered', 'capacity', [], 3),
    ]),
  );
  cases.push(
    plan('replacement-refreshes-timestamp', 2, 10, [
      set('initial-a', 'a', 'old'),
      set('replace-at-nine', 'a', 'new', 9),
      get('past-original-deadline', 'a', 'new', 11),
      get('replacement-exact-deadline', 'a', 'new', 19),
      get('replacement-expired', 'a', null, 20),
    ]),
  );
  cases.push(
    plan('get-promotes-recency', 2, 100, [
      set('stage-a', 'a', 1),
      set('stage-b', 'b', 2),
      get('promote-a', 'a', 1),
      set('stage-c', 'c', 3),
      get('a-survives', 'a', 1),
      get('b-evicted', 'b', null),
      get('c-survives', 'c', 3),
      call('size-bounded', 'size', [], 2),
      call('no-slots-left', 'capacity', [], 0),
    ]),
  );
  cases.push(
    plan('has-does-not-promote', 2, 100, [
      set('stage-a', 'a', 1),
      set('stage-b', 'b', 2),
      has('has-a-without-promotion', 'a', true),
      set('stage-c', 'c', 3),
      get('a-evicted', 'a', null),
      get('b-survives', 'b', 2),
      get('c-survives', 'c', 3),
    ]),
  );
  cases.push(
    plan('overwrite-clear-retry', 2, 100, [
      set('stage-a', 'a', 1),
      set('stage-b', 'b', 2),
      set('overwrite-promotes-a', 'a', 9),
      set('stage-c', 'c', 3),
      get('new-a-survives', 'a', 9),
      get('b-evicted', 'b', null),
      call('clear-real-cache', 'clear', [], absent),
      call('cleared-size', 'size', [], 0),
      call('cleared-slots', 'capacity', [], 2),
      has('cleared-a-missing', 'a', false),
      set('retry-after-clear', 'a', 11),
      get('retry-value', 'a', 11),
      call('one-slot-used', 'capacity', [], 1),
    ]),
  );
  const record: JsonValue = { count: 3, label: 'literal' };
  cases.push(
    plan('actual-returned-record-identity', 3, 10, [
      set('stage-record', 'record', record),
      { ...get('retain-real-record', 'record', record), retain: { id: 'record', stage: 'call' } },
      {
        id: 'same-returned-record',
        method: 'get',
        args: ['record'],
        result: { identityWith: 'record' },
        expected: true,
      },
      set('actual-record-as-map-key', { $type: 'reference', value: 'record' }, 'keyed'),
      get('same-reference-key-hit', { $type: 'reference', value: 'record' }, 'keyed'),
      get('fresh-equal-record-key-miss', record, null),
      set('replace-record-value', 'record', record),
      {
        id: 'replacement-object-distinct',
        method: 'get',
        args: ['record'],
        result: { identityWith: 'record' },
        expected: false,
      },
      get('original-record-key-still-hit', { $type: 'reference', value: 'record' }, 'keyed'),
      get('expired-record-value', 'record', null, 11),
      get('expired-record-key', { $type: 'reference', value: 'record' }, null),
    ]),
  );
  cases.push(
    plan('raw-values-and-presence', 8, 10, [
      set('stage-undefined', 'undefined', absent),
      set('stage-null', 'null', null),
      set('stage-false', 'false', false),
      set('stage-zero', 'zero', 0),
      set('stage-odd-string', 'odd', 'λ\u0000雪'),
      has('undefined-is-present', 'undefined', true),
      get('undefined-hit', 'undefined', absent),
      get('null-hit', 'null', null),
      get('false-hit', 'false', false),
      get('zero-hit', 'zero', 0),
      get('odd-hit', 'odd', 'λ\u0000雪'),
      get('missing-is-null', 'missing', null),
      has('missing-is-absent', 'missing', false),
      call('five-entries', 'size', [], 5),
      get('undefined-expired-is-null', 'undefined', null, 11),
      has('undefined-now-absent', 'undefined', false),
    ]),
  );
  for (const capacity of [1, 2, 3, 5])
    for (const ttl of [0, 10]) {
      const probes: Probe[] = [
        call('initial-size', 'size', [], 0),
        call('initial-slots', 'capacity', [], capacity),
      ];
      for (let index = 0; index < capacity; index++)
        probes.push(
          set(`stage-${index}`, `key-${index}`, index),
          call(`size-${index}`, 'size', [], index + 1),
        );
      probes.push(get('promote-first', 'key-0', 0), set('overflow', 'new', 99));
      const evicted = capacity === 1 ? 0 : 1;
      for (let index = 0; index < capacity; index++)
        probes.push(has(`presence-${index}`, `key-${index}`, index !== evicted));
      probes.push(
        get('new-entry-exact-deadline', 'new', 99, ttl),
        call('full-size-before-prune', 'size', [], capacity),
        has('new-stale-before-prune', 'new', true, ttl + 1),
        get('prune-new-after-deadline', 'new', null),
        call('size-after-one-prune', 'size', [], capacity - 1),
        call('one-slot-recovered', 'capacity', [], 1),
        call('clear-stale-remainder', 'clear', [], absent),
        call('size-after-clear', 'size', [], 0),
        call('slots-after-clear', 'capacity', [], capacity),
        set('retry-after-clear', 'retry', 'fresh'),
        get('retry-at-new-deadline', 'retry', 'fresh', 2 * ttl + 1),
        get('retry-after-new-deadline', 'retry', null, 2 * ttl + 2),
      );
      cases.push(plan(`generated-capacity-${capacity}-ttl-${ttl}`, capacity, ttl, probes));
    }
  return cases;
}
