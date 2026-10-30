import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const nan: JsonValue = { $type: 'number', value: 'NaN' };
const date = (value: string): JsonValue => ({ $type: 'Date', value });
const probe = (id: string, exported: string, args: JsonValue[], expected: JsonValue): Probe => ({
  id,
  export: exported,
  args,
  expected,
});
const make = (id: string, probes: Probe[], timezone = 'UTC'): BehaviorCase => ({
  schemaVersion: 1,
  id: `time-utils-${id}-v1`,
  version: 1,
  module: 'WATimeUtils',
  export: 'castToUnixTime',
  context: { clock: '2000-01-01T00:00:00.123Z', timezone, randomSeed: 1, gates: {} },
  probes,
  stubs: [{ module: 'cr:6640', exports: null }],
});
const rows = (
  name: string,
  values: { args: JsonValue[]; expected: JsonValue; result?: Probe['result'] }[],
  suffix = '',
): BehaviorCase[] => {
  const cases: BehaviorCase[] = [];
  for (let offset = 0; offset < values.length; offset += 96)
    cases.push(
      make(
        `${name.toLowerCase()}${suffix ? `-${suffix}` : ''}-${offset / 96}`,
        values.slice(offset, offset + 96).map((row, index) => ({
          ...probe(`input-${offset + index}`, name, row.args, row.expected),
          ...(row.result ? { result: row.result } : {}),
        })),
      ),
    );
  return cases;
};

/** ECMAScript ToInt32 via integer modular arithmetic, not the archived bitwise implementation. */
function unix32(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const modulus = 4294967296n,
    sign = 2147483648n;
  let residue = BigInt(Math.trunc(value)) % modulus;
  if (residue < 0n) residue += modulus;
  if (residue >= sign) residue -= modulus;
  return residue === -sign ? -2147483647 : Number(residue);
}
const integers = [
  ...new Set([
    ...[
      -9007199254740991, -281474976710656, -4294967296, -2147483648, -1, 0, 1, 2147483647,
      2147483648, 4294967296, 281474976710656, 9007199254740991,
    ].flatMap((anchor) => [-17, -2, -1, 0, 1, 2, 17].map((offset) => anchor + offset)),
    ...Array.from({ length: 257 }, (_, index) => (index - 128) * 16777217),
  ]),
];
const numbers = [
  ...integers,
  ...[-2147483648, -1, 0, 1, 2147483647].flatMap((anchor) =>
    [-0.999, -0.5, 0.5, 0.999].map((fraction) => anchor + fraction),
  ),
];

/** Literal dates/weeks are independent Python datetime/isocalendar facts, not WA outputs. */
const dates = [
  { seconds: -2147483647, iso: '1901-12-13T20:45:53.000Z', http: 'Fri, 13 Dec 1901 20:45:53 GMT' },
  { seconds: -1, iso: '1969-12-31T23:59:59.000Z', http: 'Wed, 31 Dec 1969 23:59:59 GMT' },
  { seconds: 0, iso: '1970-01-01T00:00:00.000Z', http: 'Thu, 01 Jan 1970 00:00:00 GMT' },
  { seconds: 946684800, iso: '2000-01-01T00:00:00.000Z', http: 'Sat, 01 Jan 2000 00:00:00 GMT' },
  { seconds: 2147483647, iso: '2038-01-19T03:14:07.000Z', http: 'Tue, 19 Jan 2038 03:14:07 GMT' },
];
const weeks: [string, number][] = [
  ['2014-12-28', 52],
  ['2014-12-29', 1],
  ['2015-01-01', 1],
  ['2015-12-31', 53],
  ['2016-01-01', 53],
  ['2016-01-03', 53],
  ['2016-01-04', 1],
  ['2019-12-30', 1],
  ['2020-01-01', 1],
  ['2020-12-31', 53],
  ['2021-01-01', 53],
  ['2021-01-03', 53],
  ['2021-01-04', 1],
  ['2024-02-29', 9],
  ['2026-10-30', 44],
  ['2026-12-31', 53],
];

export function timeUtilsCases(): BehaviorCase[] {
  const cases = [
    ...rows(
      'castToUnixTime',
      numbers.map((value) => ({ args: [value], expected: unix32(value) })),
    ),
    ...rows(
      'castMilliSecondsToUnixTime',
      numbers.map((value) => ({
        args: [value * 1000 + 1],
        expected: unix32((value * 1000 + 1) / 1000),
      })),
    ),
    ...rows(
      'castLongIntToUnixTime',
      numbers.map((value) => ({ args: [value], expected: unix32(value) })),
    ),
    ...rows(
      'castLongIntToMillisTime',
      [-9007199254740991, -2147483648, -1001, -0.5, 0, 0.5, 2147483648, 9007199254740991].map(
        (value) => ({ args: [value], expected: value }),
      ),
    ),
    ...rows(
      'castUnixTimeToMillisTime',
      integers.map((value) => ({ args: [value], expected: Number(BigInt(value) * 1000n) })),
    ),
  ];
  for (const exported of ['castToUnixTime', 'castMilliSecondsToUnixTime', 'castLongIntToUnixTime'])
    cases.push(
      ...rows(
        exported,
        ['NaN', 'Infinity', '-Infinity'].map((value) => ({
          args: [{ $type: 'number', value }],
          expected: 0,
        })),
        'nonfinite',
      ),
    );
  const hexLongs = [
    '0x0000000000000000',
    '0x0000000000000001',
    '0x000000007fffffff',
    '0x0000000080000000',
    '0xffffffffffffffff',
  ];
  for (const exported of ['castLongIntToUnixTime', 'castLongIntToMillisTime'])
    cases.push(
      ...rows(
        exported,
        hexLongs.flatMap((value) => [
          { args: [value], expected: 2147483647 },
          { args: [`-${value}`], expected: -2147483647 },
        ]),
        'hex-long',
      ),
    );
  cases.push(
    ...rows('castMillisTimeToUnixTime', [
      { args: [null], expected: null },
      { args: [absent], expected: absent },
      { args: [-1001], expected: -1001 },
      { args: [-2147483648], expected: -2147483647 },
      { args: [-2147483648000], expected: 0 },
      { args: [0], expected: 0 },
      { args: [2147483647], expected: 2147483647 },
      { args: [2147483648], expected: 2147483 },
      { args: [2147483648000], expected: -2147483647 },
      { args: [946684800123], expected: 946684800 },
    ]),
  );
  for (const exported of ['castToMillisTime', 'fromMillisTime'])
    cases.push(
      ...rows(
        exported,
        [-2147483648000, -1, 0, 0.125, 946684800123, 281474976710656].map((value) => ({
          args: [value],
          expected: value,
        })),
      ),
    );
  const explicitDeadlines: { args: JsonValue[]; expected: JsonValue }[] = [];
  for (const now of [-2147483648, -1.25, -1, 0, 1.25, 2147483646, 2147483647])
    for (const duration of [-1000, -0.5, 0, 0.25, 0.75, 1, 1.25, 60, 86400, 2147483648])
      explicitDeadlines.push({
        args: [duration, now],
        expected: unix32(Math.ceil(now + Math.max(duration, 0))),
      });
  cases.push(...rows('futureUnixTime', explicitDeadlines));
  cases.push(
    ...rows(
      'pastUnixTime',
      explicitDeadlines.map(({ args }) => ({
        args,
        expected: unix32(Math.ceil(Number(args[1]) - Math.max(Number(args[0]), 0))),
      })),
    ),
  );
  cases.push(
    ...rows('timeoutForAt', [
      { args: [0, 1.25, 0], expected: 1250 },
      { args: [0, 2147483, 0], expected: 2147483000 },
      { args: [0, 2147484, 0], expected: 2147483647 },
      { args: [10, 4, 6], expected: 0 },
      { args: [10, 4, 5], expected: 0 },
      { args: [-1, 0, 0], expected: 1000 },
      { args: [946684800, 946684799, 1.125], expected: 125 },
    ]),
  );
  cases.push(
    ...rows('happenedWithinAt', [
      { args: [1, 1, 0], expected: true },
      { args: [1, 2, 1], expected: true },
      { args: [2, 1, 1], expected: true },
      { args: [1, 2, 0.999], expected: false },
      { args: [-1, 1, 2], expected: true },
      { args: [1, 1, -1], expected: false },
    ]),
  );
  cases.push(
    ...rows(
      'oldest',
      [
        [-1, 0, -1],
        [0, -1, -1],
        [0, 0, 0],
        [2147483648, -2147483648, -2147483648],
      ].map(([a, b, expected]) => ({ args: [a!, b!], expected: expected! })),
    ),
  );
  const dayRows: { args: JsonValue[]; expected: JsonValue }[] = [];
  for (const base of [-86400000, -1, 0, 1, 1793403000000])
    for (const delta of [0, 1, 999, 86399999, 86400000, 86400001, 604800000]) {
      const expected = Number((BigInt(delta) + 86399999n) / 86400000n);
      dayRows.push(
        { args: [base, base + delta], expected },
        { args: [base + delta, base], expected },
      );
    }
  dayRows.push(
    { args: [1793505600000, 1793595600000], expected: 2 },
    { args: [1772946000000, 1773028800000], expected: 1 },
  );
  cases.push(...rows('daysDiff', dayRows));
  cases.push(
    ...rows(
      'weekOfYear',
      weeks.map(([day, expected]) => ({ args: [date(`${day}T00:00:00.000Z`)], expected })),
      'midnight-iso',
    ),
  );
  // The original UTC Thursday adjustment retains time-of-day. Jan7 at
  // midnight gives ceil(7/7)=1; one millisecond later gives ceil((7+epsilon)/7)=2.
  cases.push(
    ...rows(
      'weekOfYear',
      [
        ['2016-01-04T00:00:00.000Z', 1],
        ['2016-01-04T00:00:00.001Z', 2],
        ['2016-01-04T12:00:00.000Z', 2],
        ['2021-01-04T00:00:00.000Z', 1],
        ['2021-01-04T00:00:00.001Z', 2],
        ['2021-01-04T12:00:00.000Z', 2],
        ['2016-01-03T12:00:00.000Z', 53],
        ['2014-12-29T12:00:00.000Z', 1],
      ].map(([value, expected]) => ({ args: [date(String(value))], expected: Number(expected) })),
      'subday-characterization',
    ),
  );
  cases.push(
    ...rows(
      'toDate',
      dates.map(({ seconds, iso }) => ({ args: [seconds], expected: date(iso) })),
    ),
  );
  cases.push(
    ...rows(
      'toHttpHeaderDate',
      dates.map(({ seconds, http }) => ({ args: [seconds], expected: http })),
    ),
  );
  cases.push(
    ...rows(
      'toDate',
      [-8640000000001, -8640000000000, 8640000000000, 8640000000001].map((value) => ({
        args: [value],
        result: { method: 'getTime' },
        expected: Math.abs(value) > 8640000000000 ? nan : value * 1000,
      })),
      'timeclip',
    ),
  );
  cases.push(
    ...rows('convertHexToDate', [
      { args: ['0'], expected: date('1970-01-01T00:00:00.000Z') },
      { args: ['7fffffff'], expected: date('2038-01-19T03:14:07.000Z') },
      { args: ['80000000'], expected: date('1901-12-13T20:45:53.000Z') },
      { args: ['ffffffff'], expected: date('1969-12-31T23:59:59.000Z') },
      { args: ['100000000'], expected: date('1970-01-01T00:00:00.000Z') },
      { args: ['0x7fffffff'], expected: date('2038-01-19T03:14:07.000Z') },
      { args: ['7fffffffjunk'], expected: date('2038-01-19T03:14:07.000Z') },
      { args: [' -1 '], expected: date('1969-12-31T23:59:59.000Z') },
      { args: [''], expected: null },
      { args: ['not-hex'], expected: null },
    ]),
  );
  cases.push(
    ...rows('convertISO8601DateFormatToUnixTime', [
      ...dates.map(({ iso, seconds }) => ({ args: [iso], expected: seconds })),
      { args: ['2038-01-19T03:14:08.000Z'], expected: -2147483647 },
      { args: ['2000-01-01T05:30:00+05:30'], expected: 946684800 },
      { args: ['1999-12-31T19:00:00-05:00'], expected: 946684800 },
      { args: ['2000-01-01'], expected: 946684800 },
      { args: [null], expected: 0 },
      { args: [-1001], expected: -1 },
      { args: [''], expected: null },
      { args: ['not-a-date'], expected: null },
      { args: ['2026-13-01'], expected: null },
    ]),
  );
  cases.push(
    make('clock-skew-retention-and-updates', [
      probe('initial-skew', 'getClockSkew', [], 0),
      probe('initial-seconds', 'unixTime', [], 946684800),
      probe('initial-millis', 'unixTimeMs', [], 946684800123),
      probe('set-fractional', 'setClockSkew', [60.5], absent),
      probe('retained-skew', 'getClockSkew', [], 60.5),
      probe('fractional-seconds', 'unixTime', [], 946684739),
      probe('fractional-millis', 'unixTimeMs', [], 946684739623),
      probe('millis-alias', 'millisTime', [], 946684739623),
      probe('uncorrected-seconds', 'unixTimeWithoutClockSkewCorrection', [], 946684800),
      probe('uncorrected-millis', 'performanceAbsoluteNow', [], 946684800123),
      { ...probe('advance-clock', 'unixTime', [], 946684741), clock: '2000-01-01T00:00:01.999Z' },
      probe('set-negative', 'setClockSkew', [-120], absent),
      probe('negative-skew-millis', 'millisTime', [], 946684921999),
      probe('negative-skew-seconds', 'unixTime', [], 946684921),
      probe('restore', 'setClockSkew', [0], absent),
      probe('restored-seconds', 'unixTime', [], 946684801),
      { ...probe('rollback-pre-epoch', 'unixTime', [], 0), clock: '1969-12-31T23:59:59.500Z' },
      probe('negative-millis', 'millisTime', [], -500),
    ]),
  );
  cases.push(
    make('clock-2038-rollover', [
      {
        ...probe('last-positive-second', 'unixTime', [], 2147483647),
        clock: '2038-01-19T03:14:07.999Z',
      },
      {
        ...probe('next-second-wraps', 'unixTime', [], -2147483647),
        clock: '2038-01-19T03:14:08.000Z',
      },
      probe('uncorrected-also-wraps', 'unixTimeWithoutClockSkewCorrection', [], -2147483647),
      probe('millis-not-wrapped', 'unixTimeMs', [], 2147483648000),
    ]),
  );
  cases.push(
    make('timestamp-fallback-clock-and-skew', [
      probe('threshold-minus-one', 'miAdjustTimestamp', [281474976710655], 281474976710655),
      probe('threshold-fallback', 'miAdjustTimestamp', [281474976710656], 946684860123),
      probe('set-skew', 'setClockSkew', [60.5], absent),
      probe('skewed-fallback', 'miAdjustTimestamp', [281474976710657], 946684799623),
      {
        ...probe('clock-update-fallback', 'miAdjustTimestamp', [281474976710656], 946684800623),
        clock: '2000-01-01T00:00:01.123Z',
      },
      probe('small-value-unchanged', 'miAdjustTimestamp', [-1], -1),
    ]),
  );
  cases.push(
    make('clock-relative-deadlines', [
      probe('one-second-until', 'secondsUntil', [946684801], 1),
      probe('future-before', 'isInFuture', [946684801], true),
      probe('millis-until', 'cappedMillisecondsUntil', [946684801], 1000),
      probe('timeout-before', 'timeoutFor', [946684800, 1], 1000),
      probe('within-inclusive', 'happenedWithin', [946684801, 1], true),
      probe('within-outside', 'happenedWithin', [946684802, 1], false),
      probe('future-default-now', 'futureUnixTime', [0.25], 946684801),
      probe('past-default-now', 'pastUnixTime', [0.25], 946684800),
      {
        ...probe('subsecond-still-one', 'secondsUntil', [946684801], 1),
        clock: '2000-01-01T00:00:00.999Z',
      },
      {
        ...probe('deadline-arrives', 'secondsUntil', [946684801], 0),
        clock: '2000-01-01T00:00:01.000Z',
      },
      probe('not-future', 'isInFuture', [946684801], false),
      probe('zero-millis-until', 'cappedMillisecondsUntil', [946684801], 0),
      probe('expired-timeout', 'timeoutFor', [946684800, 1], 0),
      probe('cap-huge-future', 'cappedMillisecondsUntil', [946684801 + 2147484], 2147483647),
    ]),
  );
  const a = 1793403000,
    b = 1793403900;
  cases.push(
    make('same-day-skew-cache-stays-stale', [
      probe('initial-same-friday', 'sameDay', [a, b], true),
      probe('shift-both-to-saturday', 'setClockSkew', [3600], absent),
      probe('cached-friday-disagrees', 'sameDay', [a, b], false),
      probe('same-cached-entry-stays-stale', 'sameDay', [a, b], false),
      probe('reverse-primes-first-timestamp', 'sameDay', [b, a], false),
      probe('recomputed-saturday-agrees', 'sameDay', [a, b], true),
    ]),
  );
  cases.push(
    make('same-day-fresh-shifted-context', [
      probe('shift-before-first-read', 'setClockSkew', [3600], absent),
      probe('both-saturday', 'sameDay', [a, b], true),
    ]),
  );
  cases.push(
    make('same-day-zero-initial-cache', [
      probe('sentinel-first-argument-mismatch', 'sameDay', [3600, 0], false),
      probe('reverse-updates-cache', 'sameDay', [0, 3600], false),
      probe('next-call-has-real-weekday', 'sameDay', [0, 3600], true),
    ]),
  );
  for (const [id, args, expected, timezone] of [
    ['utc-same-day', [a, b], true, 'UTC'],
    ['utc-cross-midnight', [1793403900, 1793404800], false, 'UTC'],
    ['new-york-fall-back-cutoff', [1793505600, 1793595540], false, 'America/New_York'],
    ['new-york-spring-forward-day', [1772946000, 1773028740], true, 'America/New_York'],
  ] as const)
    cases.push(make(id, [probe('compare', 'sameDay', [...args], expected)], timezone));
  for (const [id, timezone, clock, midnight] of [
    ['utc', 'UTC', '2026-11-01T18:00:00.000Z', 1793491200],
    ['kolkata', 'Asia/Kolkata', '2026-11-01T18:00:00.000Z', 1793471400],
    ['new-york-fall-back', 'America/New_York', '2026-11-01T18:00:00.000Z', 1793505600],
    ['new-york-spring-forward', 'America/New_York', '2026-03-08T18:00:00.000Z', 1772946000],
  ] as const)
    cases.push(
      make(
        `midnight-${id}`,
        [
          { ...probe('local-midnight', 'midnight', [], midnight), clock },
          probe('set-skew', 'setClockSkew', [3600], absent),
          probe('midnight-skew-subtracted', 'midnight', [], midnight - 3600),
        ],
        timezone,
      ),
    );
  return cases;
}
