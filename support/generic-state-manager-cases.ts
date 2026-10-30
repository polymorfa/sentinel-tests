import type { BehaviorCase, JsonValue, Probe } from './types.ts';
const absent: JsonValue = { $type: 'undefined' };
const nan: JsonValue = { $type: 'number', value: 'NaN' };
const ref = (value: string): JsonValue => ({ $type: 'reference', value });
const get = (id: string, expected: JsonValue): Probe => ({ id, method: 'get', args: [], expected });
const set = (id: string, value: JsonValue): Probe => ({
  id,
  method: 'set',
  args: [value],
  expected: value,
});
const start = (id: string, handle: string, value: JsonValue): Probe => ({
  id,
  method: 'waitForValue',
  args: [value],
  pending: { id: handle, action: 'start' },
  expected: absent,
});
const inspect = (id: string, handle: string, fulfilled: boolean): Probe => ({
  id,
  args: [],
  pending: { id: handle, action: 'inspect' },
  expected: fulfilled ? { state: 'fulfilled', value: absent } : { state: 'pending' },
});
const wait = (id: string, handle: string): Probe => ({
  id,
  args: [],
  pending: { id: handle, action: 'await' },
  expected: absent,
});
const make = (name: string, initial: JsonValue, probes: Probe[]): BehaviorCase => ({
  schemaVersion: 1,
  id: `generic-state-manager-${name}-v1`,
  version: 1,
  module: 'WAGenericStateManager',
  export: 'WAGenericStateManager',
  construct: { args: [initial] },
  stubs: [{ module: 'cr:6640', exports: null }],
  probes,
});

/** Actual state manager and internal waitForValue subscriptions; no supplied callbacks. */
export function genericStateManagerCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const values: JsonValue[] = [
    null,
    absent,
    false,
    true,
    0,
    1,
    -1,
    '',
    'false',
    nan,
    { $type: 'number', value: 'Infinity' },
    { $type: 'BigInt', value: '0' },
    { $type: 'BigInt', value: '1' },
    [1, null, 'x'],
    { state: 3 },
  ];
  const replacements: Probe[] = [get('initial', 'initial')];
  values.forEach((value, index) =>
    replacements.push(
      set(`replace-${index}`, value),
      get(`read-${index}`, value),
      set(`repeat-${index}`, value),
      get(`repeat-read-${index}`, value),
    ),
  );
  cases.push(make('primitive-and-record-replacements', 'initial', replacements));
  for (const [index, current] of [
    null,
    absent,
    false,
    0,
    'same',
    { $type: 'BigInt', value: '1' },
  ].entries())
    cases.push(
      make(`already-current-${index}`, current, [
        start('start', 'current', current),
        inspect('immediate', 'current', true),
        wait('await', 'current'),
        set('later', 'changed'),
        inspect('earlier-fulfillment-retained', 'current', true),
        get('state-changed', 'changed'),
      ]),
    );
  cases.push(
    make('multiple-same-and-different-targets', 0, [
      start('first-a', 'a1', 1),
      start('second-a', 'a2', 1),
      start('b', 'b', 2),
      inspect('a1-pending', 'a1', false),
      inspect('a2-pending', 'a2', false),
      inspect('b-pending', 'b', false),
      set('publish-a', 1),
      get('state-a', 1),
      inspect('a1-resolved', 'a1', true),
      inspect('a2-resolved', 'a2', true),
      inspect('b-still-pending', 'b', false),
      set('repeat-a', 1),
      inspect('b-not-a', 'b', false),
      start('already-a', 'a3', 1),
      inspect('a3-immediate', 'a3', true),
      set('publish-b', 2),
      get('state-b', 2),
      inspect('b-resolved', 'b', true),
      wait('await-a1', 'a1'),
      wait('await-a2', 'a2'),
      wait('await-a3', 'a3'),
      wait('await-b', 'b'),
      set('later-state', 7),
      inspect('a-stays-resolved', 'a1', true),
      inspect('b-stays-resolved', 'b', true),
    ]),
  );
  cases.push(
    make('skipped-target-and-intermediate-updates', 'zero', [
      start('old-target', 'old', 'one'),
      set('jump-past', 'two'),
      inspect('not-skipped', 'old', false),
      set('another-update', 'three'),
      inspect('still-waiting', 'old', false),
      start('late-current', 'late', 'three'),
      inspect('current-now', 'late', true),
      set('return-to-target', 'one'),
      inspect('old-resolves-on-return', 'old', true),
      wait('await-old', 'old'),
      set('leave-again', 'four'),
      inspect('late-remains-resolved', 'late', true),
      get('final', 'four'),
    ]),
  );
  cases.push(
    make('strict-equality-nullish-and-type-boundaries', false, [
      start('zero', 'zero', 0),
      start('string-zero', 'string', '0'),
      start('null', 'null', null),
      start('undefined', 'undefined', absent),
      set('repeat-false', false),
      inspect('false-is-not-zero', 'zero', false),
      set('numeric-zero', 0),
      inspect('zero-matches', 'zero', true),
      inspect('string-does-not-match-number', 'string', false),
      set('null-value', null),
      inspect('null-matches', 'null', true),
      inspect('undefined-is-not-null', 'undefined', false),
      set('undefined-value', absent),
      inspect('undefined-matches', 'undefined', true),
      set('string-value', '0'),
      inspect('string-matches', 'string', true),
      wait('await-zero', 'zero'),
      wait('await-string', 'string'),
      wait('await-null', 'null'),
      wait('await-undefined', 'undefined'),
    ]),
  );
  cases.push(
    make('nan-wait-stays-unsettled', nan, [
      start('nan-target', 'nan', nan),
      inspect('nan-not-equal-to-current-nan', 'nan', false),
      set('repeat-nan', nan),
      inspect('published-nan-does-not-match', 'nan', false),
      set('finite-state', 3),
      inspect('finite-does-not-match', 'nan', false),
      start('finite-target', 'finite', 4),
      set('match-finite', 4),
      wait('finite-resolves', 'finite'),
      set('nan-again', nan),
      inspect('nan-remains-pending', 'nan', false),
      get('state-is-nan', nan),
    ]),
  );
  cases.push(
    make('fresh-equal-looking-records-are-distinct-targets', { value: 1 }, [
      start('target', 'object', { value: 1 }),
      inspect('initial-data-is-not-shared-target', 'object', false),
      set('equal-looking-update', { value: 1 }),
      inspect('new-data-is-not-shared-target', 'object', false),
      set('another-update', { value: 2 }),
      inspect('bounded-unresolved', 'object', false),
      get('actual-current-record', { value: 2 }),
    ]),
  );
  for (const page of [0, 1, 2]) {
    const seen = new Set<number>();
    const probes: Probe[] = [];
    for (let target = 0; target < 5; target++)
      probes.push(start(`start-${target}`, `target-${target}`, target));
    for (let step = 0; step < 18; step++) {
      const value = (step * 3 + page) % 5;
      seen.add(value);
      probes.push(set(`set-${step}`, value), get(`get-${step}`, value));
      probes.push(inspect(`current-wait-${step}`, `target-${value}`, true));
      const neighbor = (value + 2) % 5;
      probes.push(inspect(`neighbor-wait-${step}`, `target-${neighbor}`, seen.has(neighbor)));
    }
    for (let target = 0; target < 5; target++)
      probes.push(wait(`await-${target}`, `target-${target}`));
    cases.push(make(`generated-wait-history-${page}`, -1, probes));
  }
  const initial: JsonValue = { id: 'initial', nested: { count: 1 } };
  const next: JsonValue = { id: 'next', nested: { count: 2 } };
  cases.push(
    make('actual-returned-record-identity-without-pending', initial, [
      { ...get('capture-initial', initial), retain: { id: 'initial', stage: 'call' } },
      {
        id: 'get-same',
        method: 'get',
        args: [],
        result: { identityWith: 'initial' },
        expected: true,
      },
      {
        id: 'fresh-equal-looking-is-not-initial',
        method: 'set',
        args: [initial],
        result: { identityWith: 'initial' },
        retain: { id: 'equal', stage: 'call' },
        expected: false,
      },
      {
        id: 'get-replacement',
        method: 'get',
        args: [],
        result: { identityWith: 'equal' },
        expected: true,
      },
      { ...set('capture-next', next), retain: { id: 'next', stage: 'call' } },
      {
        id: 'same-next',
        method: 'get',
        args: [],
        result: { identityWith: 'next' },
        expected: true,
      },
      {
        id: 'restore-original',
        method: 'set',
        args: [ref('initial')],
        result: { identityWith: 'initial' },
        expected: true,
      },
      get('original-content', initial),
      {
        id: 'restored-not-next',
        method: 'get',
        args: [],
        result: { identityWith: 'next' },
        expected: false,
      },
      {
        id: 'restore-next',
        method: 'set',
        args: [ref('next')],
        result: { identityWith: 'next' },
        expected: true,
      },
      get('next-content', next),
    ]),
  );
  const large = 'state-🌍\0\n' + 'x'.repeat(16384);
  cases.push(
    make('large-odd-string-replacement', '', [
      set('large', large),
      get('large-read', large),
      set('empty', ''),
      get('empty-read', ''),
      set('large-again', large),
      get('large-again-read', large),
    ]),
  );
  return cases;
}
