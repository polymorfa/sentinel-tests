import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const marker = (identifier: JsonValue, target: JsonValue = null): JsonValue => ({
  __rc: [target, identifier],
});
const invoke = (id: string, payload: JsonValue, context: JsonValue = {}): Probe => ({
  id,
  args: [context, payload],
  expected: absent,
});
const flush = (id: string, identifiers: JsonValue[] = []): Probe => ({
  id,
  module: 'BanzaiLazyQueue',
  export: 'flushQueue',
  args: [],
  expected: identifiers.map((identifier) => [
    'require_cond_exposure_logging',
    { identifier },
    absent,
  ]),
});
function plan(name: string, probes: Probe[]): BehaviorCase {
  return {
    schemaVersion: 1,
    id: `marker-exposure-state-${name}-v1`,
    version: 1,
    module: 'replaceTransportMarkers',
    export: '$module',
    context: { gates: {} },
    probes,
  };
}
export function markerExposureStateCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  cases.push(
    plan('initial-and-once-across-flush', [
      flush('initial-empty'),
      invoke('first-marker', { value: marker('once') }),
      flush('first-event', ['once']),
      invoke('repeat-after-flush', { value: marker('once') }),
      flush('already-seen-is-silent'),
      flush('repeated-empty-flush'),
    ]),
  );
  cases.push(
    plan('first-seen-order', [
      invoke('ordered-duplicates', [
        marker('B'),
        marker('A'),
        marker('B'),
        marker('C'),
        marker('A'),
      ]),
      flush('unique-first-seen-order', ['B', 'A', 'C']),
      invoke('old-and-new', [marker('C'), marker('D'), marker('A'), marker('E')]),
      flush('only-new-identifiers', ['D', 'E']),
      invoke('all-seen-again', [marker('E'), marker('D'), marker('C'), marker('B'), marker('A')]),
      flush('all-seen-silent'),
    ]),
  );
  cases.push(
    plan('falsy-and-distinct-primitive-identifiers', [
      invoke(
        'falsy-identifiers',
        [null, false, 0, '', absent, { $type: 'number', value: 'NaN' }].map((identifier) =>
          marker(identifier),
        ),
      ),
      flush('falsy-never-exposed'),
      invoke(
        'distinct-truthy-identifiers',
        [true, 1, '1', '0', -1, 1, true, '1'].map((identifier) => marker(identifier)),
      ),
      flush('numeric-string-boolean-distinct', [true, 1, '1', '0', -1]),
      invoke(
        'repeat-distinct-types',
        [-1, '0', '1', 1, true].map((identifier) => marker(identifier)),
      ),
      flush('repeats-silent'),
    ]),
  );
  cases.push(
    plan('depth-first-records-and-arrays', [
      invoke('nested-source-traversal', {
        left: [marker('left-0'), { nested: marker('deep') }, marker('left-2')],
        right: { first: marker('right-first'), second: [marker('deep'), marker('right-last')] },
        tail: marker('tail'),
      }),
      flush('depth-first-events', [
        'left-0',
        'deep',
        'left-2',
        'right-first',
        'right-last',
        'tail',
      ]),
      invoke('numeric-record-keys', {
        '2': marker('index-two'),
        '1': marker('index-one'),
        after: marker('after-indices'),
      }),
      flush('integer-keys-before-ordinary-key', ['index-one', 'index-two', 'after-indices']),
    ]),
  );
  cases.push(
    plan('plain-and-empty-payloads', [
      invoke('empty-record', {}),
      invoke('empty-array', []),
      invoke('plain-data', { value: 7, text: 'literal', nested: [null, false, 0, ''] }),
      flush('nonmarkers-have-no-exposure'),
      invoke('valid-after-empty', { value: marker('after-empty') }),
      flush('later-marker-still-works', ['after-empty']),
    ]),
  );
  const partial = { first: marker('kept'), later: { __rel: true } };
  cases.push(
    plan('partial-committed-event-and-retry', [
      { id: 'fail-after-first-exposure', args: [null, partial], throws: { name: 'TypeError' } },
      flush('earlier-event-committed', ['kept']),
      { id: 'repeat-failure', args: [null, partial], throws: { name: 'TypeError' } },
      flush('committed-identifier-stays-deduped'),
      invoke(
        'valid-recovery',
        { first: marker('kept'), later: { __rel: true }, newValue: marker('recovered') },
        { relativeTo: 'synthetic-context' },
      ),
      flush('only-new-recovery-event', ['recovered']),
      invoke('recovered-repeat', { value: marker('recovered') }),
      flush('recovery-deduped'),
    ]),
  );
  cases.push(
    plan('failure-before-marker-and-valid-retry', [
      {
        id: 'fail-before-exposure',
        args: [null, { first: { __rel: true }, later: marker('later') }],
        throws: { name: 'TypeError' },
      },
      flush('no-prefix-event'),
      invoke(
        'valid-retry',
        { first: { __rel: true }, later: marker('later') },
        { relativeTo: null },
      ),
      flush('retry-exposes-once', ['later']),
      invoke(
        'second-valid-retry',
        { first: { __rel: true }, later: marker('later') },
        { relativeTo: null },
      ),
      flush('retry-stays-deduped'),
    ]),
  );
  cases.push(
    plan('actual-named-target-source', [
      invoke('resolve-actual-simple-hook-module', {
        value: marker('known-local-target', 'SimpleHook'),
      }),
      flush('named-target-exposure', ['known-local-target']),
      invoke('repeat-named-target', { value: marker('known-local-target', 'SimpleHook') }),
      flush('named-target-deduped'),
    ]),
  );
  for (const name of ['fresh-a', 'fresh-b'])
    cases.push(
      plan(name, [
        flush('fresh-empty'),
        invoke('same-identifier-in-fresh-case', { value: marker('fresh-worker') }),
        flush('fresh-case-exposure', ['fresh-worker']),
      ]),
    );
  for (const seed of [1, 7, 19]) {
    const seen = new Set<string | number>();
    const probes: Probe[] = [flush('initial-empty')];
    for (let round = 0; round < 12; round++) {
      const identifiers: (string | number)[] = [
        `seed-${seed}-key-${round % 7}`,
        ((round + seed) % 3) + 1,
        String(((round + seed) % 3) + 1),
        `seed-${seed}-key-${(round + 2) % 7}`,
        `seed-${seed}-key-${round % 7}`,
      ];
      const expected: JsonValue[] = [];
      for (const identifier of identifiers)
        if (!seen.has(identifier)) {
          seen.add(identifier);
          expected.push(identifier);
        }
      probes.push(
        invoke(`round-${round}-nested-payload`, {
          left: [marker(identifiers[0]!), { nested: marker(identifiers[1]!) }],
          right: [marker(identifiers[2]!), marker(identifiers[3]!)],
          tail: marker(identifiers[4]!),
        }),
        flush(`round-${round}-new-exposures`, expected),
      );
    }
    probes.push(
      invoke(
        'repeat-all-generated-identifiers',
        [...seen].reverse().map((identifier) => marker(identifier)),
      ),
      flush('all-generated-identifiers-stay-deduped'),
    );
    cases.push(plan(`generated-history-${seed}`, probes));
  }
  return cases;
}
