import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const nan: JsonValue = { $type: 'number', value: 'NaN' };
const ref = (value: string): JsonValue => ({ $type: 'reference', value });
const method = (
  id: string,
  name: string,
  args: JsonValue[],
  expected: JsonValue = absent,
): Probe => ({
  id,
  method: name,
  args: structuredClone(args),
  expected: structuredClone(expected),
});
const has = (id: string, args: JsonValue[], expected: boolean): Probe =>
  method(id, 'hasCallback', args, expected);
const malformedCall = (id: string): Probe => ({
  id,
  method: 'call',
  args: [7, 'synthetic'],
  throws: { name: 'TypeError' },
});
function add(id: string, value: JsonValue, retain?: string): Probe {
  return {
    ...method(id, 'add', [value], value),
    ...(retain ? { retain: { id: retain, stage: 'call' as const } } : {}),
  };
}
function plan(name: string, probes: Probe[]): BehaviorCase {
  return {
    schemaVersion: 1,
    id: `simple-hook-state-${name}-v1`,
    version: 1,
    module: 'SimpleHook',
    export: 'SimpleHook',
    construct: { args: [] },
    context: { gates: {} },
    probes,
  };
}

/** Data are deliberately malformed callbacks; no function or once wrapper is supplied. */
export function simpleHookStateCases(): BehaviorCase[] {
  const a: JsonValue = { tag: 'A' },
    b: JsonValue = { tag: 'B' };
  const cases: BehaviorCase[] = [
    plan('fresh-empty-methods', [
      has('empty-no-query', [], false),
      has('empty-null-query', [null], false),
      has('empty-undefined-query', [absent], false),
      method('empty-public-call', 'call', []),
      method('empty-call-with-data', 'call', [1, 'unused', null]),
      method('remove-absent-data', 'remove', [{ tag: 'absent' }], false),
      method('empty-pop', 'removeLast', []),
      method('clear-empty', 'clear', []),
      has('still-empty', [], false),
    ]),
    plan('identity-duplicates-remove-all', [
      add('retain-real-A', a, 'A'),
      has('same-A-present', [ref('A')], true),
      has('equal-new-A-absent', [a], false),
      {
        id: 'duplicate-same-object',
        method: 'add',
        args: [ref('A')],
        result: { identityWith: 'A' },
        expected: true,
      },
      add('retain-equal-distinct-B', a, 'B'),
      has('B-present', [ref('B')], true),
      method('remove-every-A', 'remove', [ref('A')], true),
      has('A-gone', [ref('A')], false),
      has('B-remains', [ref('B')], true),
      method('second-A-remove-false', 'remove', [ref('A')], false),
      {
        id: 'pop-real-B',
        method: 'removeLast',
        args: [],
        result: { identityWith: 'B' },
        expected: true,
      },
      method('empty-after-pop', 'removeLast', []),
      method('empty-call-after-removal', 'call', []),
    ]),
    plan('lifo-returned-object-identity', [
      add('push-A', a, 'A'),
      add('push-B', b, 'B'),
      add('push-C', { tag: 'C' }, 'C'),
      {
        id: 'pop-C-identity',
        method: 'removeLast',
        args: [],
        result: { identityWith: 'C' },
        expected: true,
      },
      has('C-absent', [ref('C')], false),
      has('A-still-present', [ref('A')], true),
      {
        id: 'pop-B-identity',
        method: 'removeLast',
        args: [],
        result: { identityWith: 'B' },
        expected: true,
      },
      {
        id: 'pop-A-identity',
        method: 'removeLast',
        args: [],
        result: { identityWith: 'A' },
        expected: true,
      },
      has('all-popped', [], false),
      method('empty-call', 'call', []),
    ]),
    plan('plain-data-dollar-one-matching', [
      add('retain-target', { tag: 'target' }, 'target'),
      {
        id: 'retain-plain-alias-record',
        method: 'add',
        args: [{ tag: 'alias', $1: ref('target') }],
        retain: { id: 'alias', stage: 'call' },
        expected: { tag: 'alias', $1: { tag: 'target' } },
      },
      method('remove-target-only', 'remove', [ref('target')], true),
      has('data-property-matches-target', [ref('target')], true),
      method('remove-is-not-property-matching', 'remove', [ref('target')], false),
      has('equal-new-target-does-not-match', [{ tag: 'target' }], false),
      method('remove-alias-itself', 'remove', [ref('alias')], true),
      has('target-no-longer-matched', [ref('target')], false),
      add('primitive-alias-record', { $1: 7 }),
      has('primitive-data-property-match', [7], true),
      method('remove-seven-does-not-remove-record', 'remove', [7], false),
      method('pop-actual-record', 'removeLast', [], { $1: 7 }),
      method('empty-call', 'call', []),
    ]),
    plan('nullish-query-means-any-entry', [
      add('store-false', false),
      has('no-query-sees-entry', [], true),
      has('null-query-sees-entry', [null], true),
      has('undefined-query-sees-entry', [absent], true),
      has('false-is-present', [false], true),
      has('unrelated-record-absent', [{}], false),
      method('remove-false', 'remove', [false], true),
      has('now-empty', [], false),
      add('store-null', null),
      has('null-query-still-any', [null], true),
      has('undefined-query-still-any', [absent], true),
      {
        id: 'nonnull-query-hits-null',
        method: 'hasCallback',
        args: [{}],
        throws: { name: 'TypeError' },
      },
      method('repair-remove-null', 'remove', [null], true),
      has('empty-again', [], false),
    ]),
    plan('null-before-match-error-repair', [
      add('null-first', null),
      add('A-second', a, 'A'),
      {
        id: 'null-blocks-later-match',
        method: 'hasCallback',
        args: [ref('A')],
        throws: { name: 'TypeError' },
      },
      method('remove-null-with-real-predicate', 'remove', [null], true),
      has('A-now-reachable', [ref('A')], true),
      malformedCall('A-still-not-callable'),
      has('failed-call-preserved-A', [ref('A')], true),
      method('remove-A', 'remove', [ref('A')], true),
      method('empty-call-recovers', 'call', []),
      add('retry-with-new-data', b, 'B'),
      has('B-registers', [ref('B')], true),
      method('clear-real-state', 'clear', []),
      method('empty-call-after-clear', 'call', []),
      has('clear-emptied', [], false),
    ]),
    plan('null-after-early-match', [
      add('A-first', a, 'A'),
      add('null-second', null),
      has('earlier-match-short-circuits', [ref('A')], true),
      {
        id: 'equal-new-query-reaches-null',
        method: 'hasCallback',
        args: [a],
        throws: { name: 'TypeError' },
      },
      method('pop-null-repairs', 'removeLast', [], null),
      has('A-remains', [ref('A')], true),
      {
        id: 'pop-A-original',
        method: 'removeLast',
        args: [],
        result: { identityWith: 'A' },
        expected: true,
      },
      method('empty-call', 'call', []),
    ]),
    plan('undefined-before-match-repair', [
      add('undefined-first', absent),
      add('A-second', a, 'A'),
      {
        id: 'undefined-blocks-match',
        method: 'hasCallback',
        args: [ref('A')],
        throws: { name: 'TypeError' },
      },
      method('remove-undefined', 'remove', [absent], true),
      has('A-now-reachable', [ref('A')], true),
      method('clear', 'clear', []),
      has('empty', [], false),
      method('empty-call', 'call', []),
    ]),
    plan('nan-strict-equality', [
      add('store-nan', nan),
      has('nan-not-strictly-found', [nan], false),
      has('nullish-query-sees-it', [null], true),
      method('nan-not-strictly-removed', 'remove', [nan], false),
      method('pop-nan', 'removeLast', [], nan),
      has('empty', [], false),
      method('empty-call', 'call', []),
    ]),
  ];
  const failures: Probe[] = [];
  [0, false, 'malformed', null, absent, { $type: 'BigInt', value: '101' }].forEach(
    (value, index) => {
      failures.push(
        add(`store-${index}`, value),
        malformedCall(`call-error-${index}`),
        has(`still-stored-${index}`, [], true),
        method(`remove-${index}`, 'remove', [value], true),
        method(`recovered-empty-call-${index}`, 'call', []),
      );
    },
  );
  failures.push(
    add('store-array', [], 'array'),
    malformedCall('array-call-error'),
    has('array-still-there', [ref('array')], true),
    method('remove-array', 'remove', [ref('array')], true),
    method('empty-after-array', 'call', []),
  );
  cases.push(plan('malformed-call-persists-until-removal', failures));
  cases.push(
    plan('noncallable-apply-data-field', [
      add('record-with-number-apply', { apply: 3 }, 'record'),
      malformedCall('data-apply-is-not-function'),
      has('record-not-removed-by-failure', [ref('record')], true),
      method('clear-record', 'clear', []),
      method('empty-call-recovers', 'call', []),
      has('empty', [], false),
    ]),
  );
  const options: JsonValue[] = [
    null,
    {},
    { once: false },
    { once: 0 },
    { once: 1 },
    { once: 'true' },
    { once: null },
    { once: absent },
  ];
  const optionProbes: Probe[] = [];
  options.forEach((option, index) => {
    const value = { optionIndex: index };
    optionProbes.push(
      {
        ...method(`add-option-${index}`, 'add', [value, option], value),
        retain: { id: `option-${index}`, stage: 'call' },
      },
      has(`same-returned-data-${index}`, [ref(`option-${index}`)], true),
      method(`remove-option-${index}`, 'remove', [ref(`option-${index}`)], true),
      method(`empty-call-${index}`, 'call', []),
    );
  });
  cases.push(plan('once-nontrue-options-only', optionProbes));
  for (const seed of [5, 23]) {
    const tokens = Array.from({ length: 6 }, (_, index) => ({
      token: `t-${seed}-${index}`,
      group: index % 3,
    }));
    const order: number[] = [];
    const probes: Probe[] = [];
    for (let index = 0; index < tokens.length; index++) {
      probes.push(add(`add-${index}`, tokens[index]!, `token-${index}`));
      order.push(index);
      if (index % 2 === 1) {
        probes.push(
          method(`duplicate-${index}`, 'add', [ref(`token-${index - 1}`)], tokens[index - 1]!),
        );
        order.push(index - 1);
      }
      if (index % 3 === 2) {
        const removed = index - 2;
        const existed = order.includes(removed);
        while (order.includes(removed)) order.splice(order.indexOf(removed), 1);
        probes.push(
          method(`remove-all-${removed}`, 'remove', [ref(`token-${removed}`)], existed),
          has(`removed-${removed}-absent`, [ref(`token-${removed}`)], false),
        );
        const last = order.pop()!;
        probes.push(
          method(`pop-after-${index}`, 'removeLast', [], tokens[last]!),
          has(`membership-after-pop-${index}`, [ref(`token-${last}`)], order.includes(last)),
        );
      }
    }
    let pop = 0;
    while (order.length) {
      const last = order.pop()!;
      probes.push(method(`drain-${pop++}`, 'removeLast', [], tokens[last]!));
    }
    probes.push(
      has('drained-empty', [], false),
      method('drained-call', 'call', []),
      method('clear-idempotent', 'clear', []),
      method('empty-pop', 'removeLast', []),
    );
    cases.push(plan(`generated-token-history-${seed}`, probes));
  }
  return cases;
}
