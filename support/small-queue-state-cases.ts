import type { BehaviorCase, JsonValue, Probe } from './types.ts';
const absent: JsonValue = { $type: 'undefined' };
const nan: JsonValue = { $type: 'number', value: 'NaN' };
const reference = (value: string): JsonValue => ({ $type: 'reference', value });
const call = (id: string, method: string, args: JsonValue[], expected: JsonValue): Probe => ({
  id,
  method,
  args,
  expected,
});
const enqueue = (id: string, value: JsonValue): Probe => call(id, 'enqueue', [value], absent);
const list = (id: string, value: JsonValue): Probe => call(id, 'enqueueList', [value], absent);
const count = (id: string, expected: number): Probe => call(id, 'getLength', [], expected);
function plan(name: string, probes: Probe[]): BehaviorCase {
  return {
    schemaVersion: 1,
    id: `small-queue-state-${name}-v1`,
    version: 1,
    module: 'SmallQueue',
    export: '$module',
    construct: { args: [] },
    context: { gates: {} },
    probes,
  };
}
export function smallQueueStateCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  cases.push(
    plan('fifo-peek-and-empty', [
      call('initial-empty', 'isEmpty', [], true),
      count('initial-count', 0),
      call('empty-peek', 'peek', [], null),
      call('empty-dequeue', 'dequeue', [], null),
      enqueue('stage-a', 'A'),
      list('stage-bc', ['B', 'C']),
      count('three-items', 3),
      call('peek-a', 'peek', [], 'A'),
      call('peek-a-again', 'peek', [], 'A'),
      count('peek-did-not-consume', 3),
      ...['A', 'B', 'C'].map((value, index) => call(`dequeue-${index}`, 'dequeue', [], value)),
      count('drained-count', 0),
      call('drained-empty', 'isEmpty', [], true),
      call('empty-again', 'dequeue', [], null),
    ]),
  );
  cases.push(
    plan('remove-first-strict-duplicate', [
      list('stage-duplicates', [1, 2, 1, '1', 1]),
      call('remove-first-number', 'remove', [1], absent),
      count('only-one-removed', 4),
      call('head-is-two', 'peek', [], 2),
      call('remove-string-only', 'remove', ['1'], absent),
      count('string-removed', 3),
      call('missing-remove', 'remove', [99], absent),
      count('missing-keeps-count', 3),
      ...[2, 1, 1].map((value, index) => call(`remaining-${index}`, 'dequeue', [], value)),
      call('drained', 'isEmpty', [], true),
    ]),
  );
  cases.push(
    plan('nan-is-not-removed-by-indexof', [
      list('stage-nans', [nan, 1, nan]),
      call('remove-nan', 'remove', [nan], absent),
      count('nans-retained', 3),
      call('first-nan', 'dequeue', [], nan),
      call('remove-one', 'remove', [1], absent),
      count('one-nan-left', 1),
      call('second-nan', 'dequeue', [], nan),
      call('empty-return', 'dequeue', [], null),
    ]),
  );
  cases.push(
    plan('null-undefined-presence', [
      list('stage-nullish', [null, absent, false, 0, '']),
      count('five-values', 5),
      call('null-still-present', 'isEmpty', [], false),
      call('peek-stored-null', 'peek', [], null),
      call('dequeue-stored-null', 'dequeue', [], null),
      count('four-left', 4),
      call('peek-stored-undefined', 'peek', [], absent),
      call('dequeue-undefined', 'dequeue', [], absent),
      ...[false, 0, ''].map((value, index) => call(`falsy-${index}`, 'dequeue', [], value)),
      call('actually-empty', 'isEmpty', [], true),
      count('zero-left', 0),
      call('empty-null', 'peek', [], null),
    ]),
  );
  const record: JsonValue = { label: 'same', count: 3 };
  cases.push(
    plan('actual-returned-object-references', [
      list('stage-independent-records', [record, record]),
      { ...call('retain-actual-peek', 'peek', [], record), retain: { id: 'first', stage: 'call' } },
      {
        id: 'same-peek-object',
        method: 'peek',
        args: [],
        result: { identityWith: 'first' },
        expected: true,
      },
      call('fresh-equal-record-not-removed', 'remove', [record], absent),
      count('both-records-remain', 2),
      call('remove-actual-first-reference', 'remove', [reference('first')], absent),
      count('one-record-left', 1),
      {
        id: 'second-object-distinct',
        method: 'peek',
        args: [],
        result: { identityWith: 'first' },
        expected: false,
      },
      {
        ...call('retain-actual-dequeue', 'dequeue', [], record),
        retain: { id: 'second', stage: 'call' },
      },
      enqueue('reenqueue-real-object', reference('second')),
      enqueue('reenqueue-same-object-again', reference('second')),
      call('remove-only-first-alias', 'remove', [reference('second')], absent),
      count('one-alias-left', 1),
      {
        id: 'remaining-alias-identity',
        method: 'dequeue',
        args: [],
        result: { identityWith: 'second' },
        expected: true,
      },
      call('empty-after-aliases', 'isEmpty', [], true),
    ]),
  );
  cases.push(
    plan('typed-view-list', [
      list('stage-offset-view', {
        $type: 'Uint8Array',
        value: [238, 238, 0, 128, 255, 221],
        byteOffset: 2,
        byteLength: 3,
      }),
      list('empty-view-is-noop', {
        $type: 'Uint8Array',
        value: [238, 221],
        byteOffset: 1,
        byteLength: 0,
      }),
      count('only-visible-bytes', 3),
      ...[0, 128, 255].map((value, index) => call(`view-byte-${index}`, 'dequeue', [], value)),
      call('view-drained', 'isEmpty', [], true),
    ]),
  );
  const malformed: Probe[] = [enqueue('existing-head', 'kept')];
  [null, 7, 'text', { length: 2, '0': 1, '1': 2 }].forEach((value, index) => {
    malformed.push(
      {
        id: `bad-list-${index}`,
        method: 'enqueueList',
        args: [value],
        throws: { name: 'TypeError' },
      },
      count(`unchanged-count-${index}`, index + 1),
      call(`unchanged-head-${index}`, 'peek', [], 'kept'),
      list(`valid-retry-${index}`, [index]),
      count(`retried-count-${index}`, index + 2),
    );
  });
  malformed.push(
    call('head-after-all-failures', 'dequeue', [], 'kept'),
    ...[0, 1, 2, 3].map((value) => call(`retry-value-${value}`, 'dequeue', [], value)),
    call('all-retries-drained', 'isEmpty', [], true),
  );
  cases.push(plan('malformed-list-before-first-insert', malformed));
  const large = Array.from({ length: 2048 }, (_, index) => (index * 73 + 19) % 1009);
  cases.push(
    plan('large-list-prefix-and-count', [
      list('stage-large-list', large),
      count('large-count', 2048),
      call('large-prefix-peek', 'peek', [], 19),
      ...[19, 92, 165, 238, 311].map((value, index) =>
        call(`large-prefix-${index}`, 'dequeue', [], value),
      ),
      count('remaining-count-only', 2043),
      call('still-nonempty', 'isEmpty', [], false),
    ]),
  );
  const odd = 'λ\u0000雪'.repeat(1024);
  cases.push(
    plan('odd-large-values', [
      enqueue('large-string', odd),
      enqueue('nested-value', { items: [null, false, 'tail'] }),
      call('large-string-peek', 'peek', [], odd),
      count('two-after-peek', 2),
      call('large-string-dequeue', 'dequeue', [], odd),
      call('nested-dequeue', 'dequeue', [], { items: [null, false, 'tail'] }),
      call('odd-values-drained', 'isEmpty', [], true),
    ]),
  );
  for (const seed of [0, 1, 2, 3]) {
    let model: number[] = [];
    const probes: Probe[] = [];
    for (let step = 0; step < 24; step++) {
      const value = (Math.floor(step / 4) + seed) % 4;
      if (step % 4 === 0) {
        probes.push(enqueue(`step-${step}-enqueue`, value));
        model = [...model, value];
      } else if (step % 4 === 1) {
        probes.push(list(`step-${step}-list`, [value, value + 10]));
        model = [...model, value, value + 10];
      } else if (step % 4 === 2) {
        probes.push(call(`step-${step}-remove-first`, 'remove', [value], absent));
        let removed = false;
        model = model.filter((item) => {
          if (!removed && item === value) {
            removed = true;
            return false;
          }
          return true;
        });
      } else {
        probes.push(call(`step-${step}-dequeue`, 'dequeue', [], model[0] ?? null));
        model = model.slice(1);
      }
      probes.push(
        count(`step-${step}-count`, model.length),
        call(`step-${step}-peek`, 'peek', [], model[0] ?? null),
      );
    }
    model.forEach((value, index) => probes.push(call(`drain-${index}`, 'dequeue', [], value)));
    probes.push(
      count('final-zero', 0),
      call('final-empty', 'isEmpty', [], true),
      call('final-empty-dequeue', 'dequeue', [], null),
    );
    cases.push(plan(`generated-history-${seed}`, probes));
  }
  return cases;
}
