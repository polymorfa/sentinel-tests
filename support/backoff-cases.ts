import type { BehaviorCase, JsonValue, Probe } from './types.ts';

export const epoch = Date.parse('2026-10-30T00:00:00.000Z');
export const at = (milliseconds: number) => new Date(epoch + milliseconds).toISOString();
export const undefinedValue: JsonValue = { $type: 'undefined' };
export const entry = (milliseconds: number, intervals: number[], attempts: number): JsonValue => ({
  lastAttempt: epoch + milliseconds,
  intervals,
  attempts,
});
export function call(
  id: string,
  method: string,
  key: JsonValue,
  time: number,
  expected: JsonValue,
): Probe & { clock: string } {
  return { id, method, args: [key], clock: at(time), expected };
}
function scenario(
  id: string,
  intervals: number[],
  probes: Probe[],
  options?: JsonValue,
): BehaviorCase {
  return {
    schemaVersion: 1,
    id: `backoff-${id}`,
    version: 1,
    module: 'WAWebBackoff',
    export: 'BackoffCache',
    construct: { args: options === undefined ? [intervals] : [intervals, options] },
    context: { clock: at(0) },
    probes,
  };
}
export const backoffCases: BehaviorCase[] = [];
for (const interval of [0, 1, 3, 7, 31, 127, 255, 1001, 4097, 65537, 86400001]) {
  backoffCases.push(
    scenario(
      `boundary-${interval}`,
      [interval, interval + 2],
      [
        call('absent-get', 'get', 'alpha', 0, undefinedValue),
        call('absent-should-backoff', 'shouldBackoff', 'alpha', 0, false),
        call('first-test', 'test', 'alpha', 0, false),
        call('first-entry', 'get', 'alpha', 0, entry(0, [interval, interval + 2], 1)),
        ...(interval > 0
          ? [
              call('before-boundary', 'test', 'alpha', interval - 1, true),
              call(
                'before-retains-entry',
                'get',
                'alpha',
                interval - 1,
                entry(0, [interval, interval + 2], 1),
              ),
            ]
          : []),
        call('at-boundary', 'shouldBackoff', 'alpha', interval, false),
        call('should-does-not-shift', 'getCurrentInterval', 'alpha', interval, interval),
        call('boundary-test-shifts', 'test', 'alpha', interval, false),
        call('shifted-entry', 'get', 'alpha', interval, entry(interval, [interval + 2], 2)),
        call('second-before-boundary', 'test', 'alpha', interval * 2 + 1, true),
        call('second-at-boundary', 'test', 'alpha', interval * 2 + 2, false),
        call('exhausted-entry', 'get', 'alpha', interval * 2 + 2, entry(interval * 2 + 2, [], 3)),
        call('exhausted-interval', 'getCurrentInterval', 'alpha', interval * 2 + 2, undefinedValue),
        call('exhausted-does-not-backoff', 'test', 'alpha', interval * 2 + 2, false),
        call(
          'exhausted-attempt-count',
          'get',
          'alpha',
          interval * 2 + 2,
          entry(interval * 2 + 2, [], 4),
        ),
      ],
    ),
  );
}
for (const resetInterval of [0, 1, 3, 31, 1001, 65537]) {
  const time = 100;
  backoffCases.push(
    scenario(
      `expiry-${resetInterval}`,
      [1000000, 2000000],
      [
        call('add', 'add', 'a', time, undefinedValue),
        ...(resetInterval > 0
          ? [call('before-expiry', 'shouldBackoff', 'a', time + resetInterval - 1, true)]
          : []),
        call(
          'get-alone-does-not-expire',
          'get',
          'a',
          time + resetInterval,
          entry(time, [1000000, 2000000], 1),
        ),
        call('expiry-boundary', 'shouldBackoff', 'a', time + resetInterval, false),
        call('expiry-removes-entry', 'get', 'a', time + resetInterval, undefinedValue),
        call('next-test-reinitializes', 'test', 'a', time + resetInterval, false),
        call(
          'reinitialized-state',
          'get',
          'a',
          time + resetInterval,
          entry(time + resetInterval, [1000000, 2000000], 1),
        ),
      ],
      { resetInterval },
    ),
  );
}
backoffCases.push(
  scenario(
    'backward-clock',
    [7, 31],
    [
      call('add-at-later-clock', 'add', 'a', 100, undefinedValue),
      call('backward-still-blocks', 'test', 'a', -100, true),
      call('backward-retains-attempt', 'get', 'a', -100, entry(100, [7, 31], 1)),
      call('catch-up-before-boundary', 'test', 'a', 106, true),
      call('catch-up-at-boundary', 'test', 'a', 107, false),
      call('advanced-entry', 'get', 'a', 107, entry(107, [31], 2)),
    ],
    { resetInterval: 50 },
  ),
);
backoffCases.push(
  scenario(
    'duplicate-removal-reset-isolation',
    [3, 7],
    [
      call('add-a', 'add', 'a', 0, undefinedValue),
      call('add-b', 'add', 'b', 1, undefinedValue),
      {
        id: 'duplicate',
        method: 'add',
        args: ['a'],
        clock: at(2),
        throws: { name: 'Error', message: 'This entry already exists in the backoff cache' },
      } as Probe,
      call('duplicate-preserves-a', 'get', 'a', 2, entry(0, [3, 7], 1)),
      call('shift-a', 'markAttemptAndShiftInterval', 'a', 2, undefinedValue),
      call('b-is-independent', 'get', 'b', 2, entry(1, [3, 7], 1)),
      call('reset-a', 'reset', 'a', 4, undefinedValue),
      call('reset-a-restores-intervals', 'get', 'a', 4, entry(4, [3, 7], 1)),
      call('reset-new-key', 'reset', 'new', 5, undefinedValue),
      call('new-key-initialized', 'get', 'new', 5, entry(5, [3, 7], 1)),
      call('remove-a', 'remove', 'a', 6, undefinedValue),
      call('a-absent', 'get', 'a', 6, undefinedValue),
      call('remove-absent', 'remove', 'a', 7, undefinedValue),
      call('mark-absent', 'markAttemptAndShiftInterval', 'a', 7, undefinedValue),
      call('absent-stays-absent', 'get', 'a', 7, undefinedValue),
      call('b-survives', 'get', 'b', 7, entry(1, [3, 7], 1)),
    ],
  ),
);
for (const intervals of [[], [-7], [0], [-7, 0, 3]])
  backoffCases.push(
    scenario(`nonpositive-${intervals.join('_') || 'empty'}`, intervals, [
      call('first', 'test', 'a', 0, false),
      call('immediate', 'test', 'a', 0, false),
      call('after-immediate', 'get', 'a', 0, entry(0, intervals.slice(1), 2)),
      call('second-immediate', 'test', 'a', 0, false),
      call('after-second', 'get', 'a', 0, entry(0, intervals.slice(2), 3)),
    ]),
  );
for (const key of ['__proto__', 'constructor', '', 0, 1, null, false])
  backoffCases.push(
    scenario(
      `map-key-${JSON.stringify(key)}`,
      [3],
      [
        call('first', 'test', key, 0, false),
        call('retained-key', 'get', key, 1, entry(0, [3], 1)),
        call('same-key-blocks', 'test', key, 1, true),
        call('remove', 'remove', key, 1, undefinedValue),
        call('removed', 'get', key, 1, undefinedValue),
      ],
    ),
  );
backoffCases.push(
  scenario(
    'numeric-string-keys-distinct',
    [7],
    [
      call('number-first', 'test', 1, 0, false),
      call('string-first', 'test', '1', 1, false),
      call('remove-number', 'remove', 1, 2, undefinedValue),
      call('number-removed', 'get', 1, 2, undefinedValue),
      call('string-survives', 'get', '1', 2, entry(1, [7], 1)),
    ],
  ),
);
backoffCases.push(
  scenario(
    'expiry-since-most-recent-admitted-attempt',
    [3, 7, 31],
    [
      call('initial', 'test', 'a', 0, false),
      call('blocked', 'test', 'a', 2, true),
      call('admitted', 'test', 'a', 3, false),
      call('new-attempt-state', 'get', 'a', 3, entry(3, [7, 31], 2)),
      call('original-expiry-does-not-remove', 'shouldBackoff', 'a', 5, true),
      call('before-new-expiry', 'test', 'a', 7, true),
      call('new-expiry', 'shouldBackoff', 'a', 8, false),
      call('expired', 'get', 'a', 8, undefinedValue),
    ],
    { resetInterval: 5 },
  ),
);
backoffCases.push(
  scenario(
    'add-does-not-implicitly-expire',
    [3],
    [
      call('add', 'add', 'a', 0, undefinedValue),
      {
        id: 'expired-duplicate-still-rejected',
        method: 'add',
        args: ['a'],
        clock: at(100),
        throws: { name: 'Error', message: 'This entry already exists in the backoff cache' },
      },
      call('duplicate-kept-original', 'get', 'a', 100, entry(0, [3], 1)),
      call('explicit-expiry-check', 'shouldBackoff', 'a', 100, false),
      call('add-after-expiry', 'add', 'a', 100, undefinedValue),
      call('fresh', 'get', 'a', 100, entry(100, [3], 1)),
    ],
    { resetInterval: 5 },
  ),
);
for (const options of [null, {}, { resetInterval: null }] as JsonValue[])
  backoffCases.push(
    scenario(
      `no-expiry-${JSON.stringify(options)}`,
      [3, 7],
      [
        call('add', 'add', 'a', 0, undefinedValue),
        call('late-no-interval-delay', 'shouldBackoff', 'a', 1000000, false),
        call('late-entry-retained', 'get', 'a', 1000000, entry(0, [3, 7], 1)),
        call('late-test-shifts', 'test', 'a', 1000000, false),
        call('late-attempt-state', 'get', 'a', 1000000, entry(1000000, [7], 2)),
      ],
      options,
    ),
  );
backoffCases.push(
  scenario(
    'negative-reset-interval-backward-boundary',
    [3],
    [
      call('add', 'add', 'a', 100, undefinedValue),
      call('rewind-below-negative-expiry', 'shouldBackoff', 'a', 98, true),
      call('negative-expiry-exact-boundary', 'shouldBackoff', 'a', 99, false),
      call('negative-expiry-removed', 'get', 'a', 99, undefinedValue),
    ],
    { resetInterval: -1 },
  ),
);
