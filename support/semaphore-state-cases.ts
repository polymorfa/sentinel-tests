import type { BehaviorCase, JsonValue, Probe } from './types.ts';
const absent: JsonValue = { $type: 'undefined' };
const nan: JsonValue = { $type: 'number', value: 'NaN' };
const available = (id: string, expected: JsonValue): Probe => ({
  id,
  method: 'availablePermits',
  args: [],
  expected,
});
const make = (name: string, args: JsonValue[], probes: Probe[]): BehaviorCase => ({
  schemaVersion: 1,
  id: `semaphore-state-${name}-v1`,
  version: 1,
  module: 'WASemaphore',
  export: 'Semaphore',
  construct: { args },
  stubs: [{ module: 'cr:6640', exports: null }],
  probes,
});
function reservations(name: string, args: JsonValue[], initial: number, counters: number[]) {
  const probes: Probe[] = [
    available('initial', initial),
    {
      id: 'acquire-and-release-once',
      method: 'acquire',
      args: [],
      retain: { id: 'released-marker', stage: 'call' },
      result: { method: 'release' },
      expected: absent,
    },
    available('immediate-release-restores-counter', initial),
  ];
  counters.forEach((expected, index) =>
    probes.push(
      {
        id: `reserve-${index}`,
        method: 'acquire',
        args: [],
        retain: { id: `held-${index}`, stage: 'call' },
        result: { identityWith: 'released-marker' },
        expected: false,
      },
      available(`available-${index}`, expected),
    ),
  );
  return make(name, args, probes);
}

/** Bounded actual reservation subset; later invocation of retained release remains unsupported. */
export function semaphoreStateCases(): BehaviorCase[] {
  const cases = [
    reservations('default-constructor', [], 1, [0]),
    reservations('explicit-undefined-default', [absent], 1, [0]),
  ];
  for (let capacity = 1; capacity <= 16; capacity++) {
    const counters = Array.from({ length: capacity }, (_, index) => capacity - index - 1);
    cases.push(reservations(`positive-capacity-${capacity}`, [capacity], capacity, counters));
  }
  // Independent literal counter tables; no generic coercion/rounding oracle is supplied to the worker.
  const literals: [string, JsonValue, number, number[]][] = [
    ['fraction-half', 0.5, 0.5, [-0.5]],
    ['fraction-one-half', 1.5, 1.5, [0.5, -0.5]],
    ['fraction-two-quarter', 2.25, 2.25, [1.25, 0.25, -0.75]],
    ['string-two', '2', 2, [1, 0]],
    ['string-one-half', '1.5', 1.5, [0.5, -0.5]],
    ['boolean-true', true, 1, [0]],
    ['array-two', [2], 2, [1, 0]],
    ['string-whitespace-three', ' 3 ', 3, [2, 1, 0]],
  ];
  for (const [name, capacity, initial, counters] of literals)
    cases.push(reservations(name, [capacity], initial, counters));
  const blocked: [string, JsonValue, JsonValue][] = [
    ['zero', 0, 0],
    ['negative-one', -1, -1],
    ['negative-half', -0.5, -0.5],
    ['nan', nan, nan],
    ['null', null, 0],
    ['false', false, 0],
    ['nonnumeric-string', 'not-a-number', nan],
  ];
  for (const [name, capacity, counter] of blocked)
    cases.push(
      make(
        `bounded-pending-${name}`,
        [capacity],
        [
          available('initial', counter),
          {
            id: 'start-first',
            method: 'acquire',
            args: [],
            pending: { id: 'first', action: 'start' },
            expected: absent,
          },
          {
            id: 'first-pending',
            args: [],
            pending: { id: 'first', action: 'inspect' },
            expected: { state: 'pending' },
          },
          {
            id: 'start-second',
            method: 'acquire',
            args: [],
            pending: { id: 'second', action: 'start' },
            expected: absent,
          },
          {
            id: 'second-pending',
            args: [],
            pending: { id: 'second', action: 'inspect' },
            expected: { state: 'pending' },
          },
          {
            id: 'first-still-pending',
            args: [],
            pending: { id: 'first', action: 'inspect' },
            expected: { state: 'pending' },
          },
          available('queued-acquisitions-do-not-consume', counter),
        ],
      ),
    );
  return cases;
}
