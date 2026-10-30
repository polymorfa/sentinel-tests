import type { BehaviorCase, JsonValue, Probe } from './types.ts';

export const fbEnumerateSourceSha256 =
  '9478dc10afde1a20ec6e30d40d63d215de953f684c5818edf05308cee10edcad';
const absent: JsonValue = { $type: 'undefined' };
const nan: JsonValue = { $type: 'number', value: 'NaN' };
const ref = (value: string): JsonValue => ({ $type: 'reference', value });
const done: JsonValue = { done: true, value: absent };
const step = (value: JsonValue): JsonValue => ({ done: false, value });
const make = (id: string, module: string, exported: string, probes: Probe[]): BehaviorCase => ({
  schemaVersion: 1,
  id: `fb-enumerate-${id}-v1`,
  version: 1,
  module,
  export: exported,
  probes,
  context: { bootstrap: { 'fb-enumerate': fbEnumerateSourceSha256 }, gates: {} },
});
const next = (id: string, handle: string, expected: JsonValue): Probe => ({
  id,
  module: 'WAIterableOperators',
  export: 'iteratorFromArray',
  args: [ref(handle)],
  result: { method: 'next' },
  expected,
});
function sequence(
  id: string,
  exported: string,
  args: JsonValue[],
  values: JsonValue[],
): BehaviorCase {
  const probes: Probe[] = [
    {
      id: 'create-and-first',
      args,
      retain: { id: 'iterator', stage: 'call' },
      result: { method: 'next' },
      expected: values.length ? step(values[0]!) : done,
    },
  ];
  for (let index = 1; index < values.length; index++)
    probes.push(next(`step-${index}`, 'iterator', step(values[index]!)));
  probes.push(next('terminal', 'iterator', done), next('terminal-again', 'iterator', done));
  return make(id, 'enumerate', exported, probes);
}
const equals = (
  id: string,
  left: JsonValue,
  right: JsonValue,
  expected: boolean,
  comparator?: JsonValue,
): BehaviorCase =>
  make(id, 'equalsIterable', '$module', [
    {
      id: 'compare',
      args: [left, right, ...(comparator === undefined ? [] : [comparator])],
      expected,
    },
  ]);

export function fbEnumerateCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const arrays: JsonValue[][] = [
    [],
    [absent],
    [false, 0, '', null, absent],
    [1, 2, 3],
    Array.from({ length: 65 }, (_, index) => (index * 251) % 257),
  ];
  for (const [index, values] of arrays.entries()) {
    cases.push(
      sequence(`array-default-${index}`, '$module', [values], values),
      sequence(`array-values-${index}`, 'values', [values], values),
      sequence(
        `array-keys-${index}`,
        'keys',
        [values],
        values.map((_, index) => index),
      ),
      sequence(
        `array-entries-${index}`,
        'entries',
        [values],
        values.map((value, index) => [index, value]),
      ),
      sequence(
        `array-generic-string-keys-${index}`,
        'generic',
        [values],
        values.map((value, index) => [String(index), value]),
      ),
    );
  }
  const strings = ['', 'a', 'é', '😀x', '\ud83d', '\ude00', 'a\ud83db'];
  for (const [index, value] of strings.entries()) {
    const codePoints = Array.from(value);
    cases.push(
      sequence(`string-default-${index}`, '$module', [value], codePoints),
      sequence(`string-values-${index}`, 'values', [value], codePoints),
      sequence(
        `string-generic-codeunits-${index}`,
        'generic',
        [value],
        Array.from({ length: value.length }, (_, index) => [String(index), value[index]!]),
      ),
      make(`string-keys-reject-${index}`, 'enumerate', 'keys', [
        {
          id: 'reject',
          args: [value],
          throws: {
            name: 'TypeError',
            message: "Strings default iterator doesn't implement keys.",
          },
        },
      ]),
      make(`string-entries-reject-${index}`, 'enumerate', 'entries', [
        {
          id: 'reject',
          args: [value],
          throws: {
            name: 'TypeError',
            message: "Strings default iterator doesn't implement entries.",
          },
        },
      ]),
    );
  }
  const object: JsonValue = {
    '10': 'ten',
    '2': 'two',
    z: 'zee',
    a: 'aye',
    ['__proto__']: 'own-data',
  };
  const entries: JsonValue[] = [
    ['2', 'two'],
    ['10', 'ten'],
    ['z', 'zee'],
    ['a', 'aye'],
    ['__proto__', 'own-data'],
  ];
  cases.push(
    sequence('object-default-entries', '$module', [object], entries),
    sequence('object-keys', 'keys', [object], ['2', '10', 'z', 'a', '__proto__']),
    sequence('object-values', 'values', [object], ['two', 'ten', 'zee', 'aye', 'own-data']),
    sequence('object-entries', 'entries', [object], entries),
    sequence('object-generic', 'generic', [object], entries),
  );
  for (const [index, value] of [0, 1, false, true, ''].entries())
    cases.push(sequence(`falsy-or-boxed-default-${index}`, '$module', [value], []));
  const bytes: JsonValue = {
    $type: 'Uint8Array',
    value: [255, 0, 127, 128, 254],
    byteOffset: 1,
    byteLength: 3,
  };
  for (const exported of ['$module', 'keys', 'values', 'entries'])
    cases.push(
      sequence(
        `typed-view-iterable-ignores-kind-${exported === '$module' ? 'default' : exported}`,
        exported,
        [bytes],
        [0, 127, 128],
      ),
    );
  cases.push(
    sequence(
      'typed-view-generic-string-keys',
      'generic',
      [bytes],
      [
        ['0', 0],
        ['1', 127],
        ['2', 128],
      ],
    ),
  );
  for (const [index, mode] of [absent, null, false, 0, ''].entries()) {
    cases.push(
      sequence(`falsy-kind-array-default-${index}`, '$module', [[4, 5], mode], [4, 5]),
      sequence(`falsy-kind-object-default-${index}`, '$module', [{ a: 1 }, mode], [['a', 1]]),
    );
  }
  for (const [index, mode] of ['unknown', true, 1].entries())
    cases.push(
      make(`invalid-kind-${index}`, 'enumerate', '$module', [
        { id: 'reject', args: [[1], mode], throws: { name: 'TypeError' } },
      ]),
    );
  for (const exported of ['$module', 'keys', 'values', 'entries', 'generic'])
    for (const [index, input] of [null, absent].entries())
      cases.push(
        make(
          `nullish-input-${exported === '$module' ? 'default' : exported}-${index}`,
          'enumerate',
          exported,
          [{ id: 'reject', args: [input], throws: { name: 'TypeError' } }],
        ),
      );
  cases.push(
    make('generic-array-snapshots-keys-before-addition', 'WAIterableOperators', 'first', [
      {
        id: 'retain-actual-array',
        args: [[[10, 20]]],
        retain: { id: 'array', stage: 'call' },
        expected: [10, 20],
      },
      {
        id: 'snapshot-fallback-keys',
        module: 'enumerate',
        export: 'generic',
        args: [ref('array')],
        retain: { id: 'iterator', stage: 'call' },
        result: { method: 'next' },
        expected: step(['0', 10]),
      },
      {
        id: 'add-key-through-actual-array',
        args: [[ref('array')]],
        result: { method: 'push', args: [30] },
        expected: 3,
      },
      next('old-key-still-present', 'iterator', step(['1', 20])),
      next('new-key-not-in-snapshot', 'iterator', done),
      next('still-done', 'iterator', done),
    ]),
  );
  cases.push(
    make('generic-array-values-remain-lazy-after-shift', 'WAIterableOperators', 'first', [
      {
        id: 'retain-actual-array',
        args: [[[10, 20, 30]]],
        retain: { id: 'array', stage: 'call' },
        expected: [10, 20, 30],
      },
      {
        id: 'snapshot-fallback-keys',
        module: 'enumerate',
        export: 'generic',
        args: [ref('array')],
        retain: { id: 'iterator', stage: 'call' },
        result: { method: 'next' },
        expected: step(['0', 10]),
      },
      {
        id: 'remove-leading-key',
        args: [[ref('array')]],
        result: { method: 'shift' },
        expected: 10,
      },
      next('captured-key-reads-new-value', 'iterator', step(['1', 30])),
      next('removed-key-still-enumerated-with-undefined', 'iterator', step(['2', absent])),
      next('terminal', 'iterator', done),
    ]),
  );
  cases.push(
    make('object-values-share-retained-nested-arrays', 'WAIterableOperators', 'first', [
      {
        id: 'retain-object',
        args: [[{ a: [1], b: [2] }]],
        retain: { id: 'object', stage: 'call' },
        expected: { a: [1], b: [2] },
      },
      {
        id: 'original-values',
        module: 'enumerate',
        export: 'values',
        args: [ref('object')],
        retain: { id: 'iterator', stage: 'call' },
        result: { method: 'next' },
        expected: step([1]),
      },
      {
        id: 'retain-second-value',
        args: [ref('iterator')],
        retain: { id: 'nested', stage: 'call' },
        expected: [2],
      },
      {
        id: 'mutate-retained-native-array',
        args: [[ref('nested')]],
        result: { method: 'push', args: [3] },
        expected: 2,
      },
      {
        id: 'new-value-iterator',
        module: 'enumerate',
        export: 'values',
        args: [ref('object')],
        retain: { id: 'again', stage: 'call' },
        result: { method: 'next' },
        expected: step([1]),
      },
      next('shared-nested-value-updated', 'again', step([2, 3])),
      next('terminal', 'again', done),
    ]),
  );
  return cases;
}

export function equalsIterableCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const vectors: { left: JsonValue; right: JsonValue; expected: boolean }[] = [
    { left: [], right: [], expected: true },
    { left: [1, 2], right: [1, 2], expected: true },
    { left: [1], right: [1, 2], expected: false },
    { left: [0], right: [false], expected: false },
    { left: [0], right: ['0'], expected: false },
    { left: [nan], right: [nan], expected: false },
    { left: [absent], right: [absent], expected: true },
    { left: [null], right: [null], expected: true },
    { left: [[1]], right: [[1]], expected: false },
    { left: [{ a: 1 }], right: [{ a: 1 }], expected: false },
    { left: {}, right: {}, expected: true },
    { left: { a: 1 }, right: { a: 1 }, expected: false },
    { left: 0, right: false, expected: true },
    { left: '', right: 0, expected: true },
    { left: false, right: [], expected: true },
    { left: 0, right: {}, expected: true },
    { left: nan, right: nan, expected: true },
    { left: null, right: null, expected: true },
    { left: absent, right: absent, expected: true },
    { left: 'a', right: ['a'], expected: true },
    { left: '😀', right: ['😀'], expected: false },
    { left: '😀', right: ['\ud83d', '\ude00'], expected: false },
    { left: { size: 1, a: 1 }, right: { size: 2, a: 1 }, expected: false },
    { left: { $type: 'Uint8Array', value: [1, 2] }, right: [1, 2], expected: true },
  ];
  vectors.forEach((vector, index) =>
    cases.push(equals(`literal-equality-${index}`, vector.left, vector.right, vector.expected)),
  );
  const primitives: JsonValue[] = ['', 0, false, null, absent, -1, 1, 'odd😀'];
  for (const length of [0, 1, 2, 3, 8, 31, 65])
    for (let page = 0; page < 3; page++) {
      const values = Array.from(
        { length },
        (_, index) => primitives[(index + page) % primitives.length]!,
      );
      const changed = [...values];
      changed[Math.max(0, length - 1)] = 'changed-sentinel';
      cases.push(
        make(`generated-primitive-length-${length}-page-${page}`, 'equalsIterable', '$module', [
          { id: 'equal-copy', args: [values, [...values]], expected: true },
          { id: 'one-changed-element', args: [values, changed], expected: false },
          { id: 'different-length', args: [values, [...values, 'extra']], expected: false },
        ]),
      );
    }
  for (const [index, comparator] of [false, 0, '', null, absent].entries())
    cases.push(equals(`falsy-comparator-${index}`, [1, 2], [1, 2], true, comparator));
  for (const [index, comparator] of [true, 1, 'not-callable', {}].entries())
    cases.push(
      make(`truthy-noncallable-comparator-${index}`, 'equalsIterable', '$module', [
        { id: 'reject', args: [[1], [1], comparator], throws: { name: 'TypeError' } },
      ]),
    );
  for (const [index, args] of [
    [null, absent],
    [null, []],
    [absent, false],
  ].entries())
    cases.push(
      make(`nullish-unequal-input-${index}`, 'equalsIterable', '$module', [
        { id: 'reject', args, throws: { name: 'TypeError' } },
      ]),
    );
  cases.push(
    make('identity-fastpath-on-object-and-nan-array', 'WAIterableOperators', 'first', [
      {
        id: 'retain-object',
        args: [[{ a: 1 }]],
        retain: { id: 'object', stage: 'call' },
        expected: { a: 1 },
      },
      {
        id: 'same-object',
        module: 'equalsIterable',
        export: '$module',
        args: [ref('object'), ref('object')],
        expected: true,
      },
      {
        id: 'different-equal-shaped-object',
        module: 'equalsIterable',
        export: '$module',
        args: [ref('object'), { a: 1 }],
        expected: false,
      },
      {
        id: 'retain-nan-array',
        args: [[[nan]]],
        retain: { id: 'array', stage: 'call' },
        expected: [nan],
      },
      {
        id: 'same-array-fastpath-does-not-compare-nan',
        module: 'equalsIterable',
        export: '$module',
        args: [ref('array'), ref('array')],
        expected: true,
      },
    ]),
  );
  cases.push(
    make('same-iterator-fastpath-does-not-consume', 'enumerate', '$module', [
      {
        id: 'retain-iterator',
        args: [[1, 2, 3]],
        retain: { id: 'iterator', stage: 'call' },
        result: { method: 'next' },
        expected: step(1),
      },
      {
        id: 'same-iterator',
        module: 'equalsIterable',
        export: '$module',
        args: [ref('iterator'), ref('iterator')],
        expected: true,
      },
      next('second-value-not-skipped', 'iterator', step(2)),
      next('third-value', 'iterator', step(3)),
      next('terminal', 'iterator', done),
    ]),
  );
  cases.push(
    make('compare-remaining-iterator-values', 'enumerate', '$module', [
      {
        id: 'left-prefix-consumed',
        args: [[1, 2, 3]],
        retain: { id: 'left', stage: 'call' },
        result: { method: 'next' },
        expected: step(1),
      },
      {
        id: 'right-different-prefix-consumed',
        args: [[0, 2, 3]],
        retain: { id: 'right', stage: 'call' },
        result: { method: 'next' },
        expected: step(0),
      },
      {
        id: 'remaining-streams-equal',
        module: 'equalsIterable',
        export: '$module',
        args: [ref('left'), ref('right')],
        expected: true,
      },
      next('left-exhausted', 'left', done),
      next('right-exhausted', 'right', done),
      {
        id: 'both-exhausted-iterators-equal',
        module: 'equalsIterable',
        export: '$module',
        args: [ref('left'), ref('right')],
        expected: true,
      },
    ]),
  );
  cases.push(
    make('early-value-mismatch-leaves-iterators-open', 'enumerate', '$module', [
      {
        id: 'left-prefix',
        args: [[0, 1, 2]],
        retain: { id: 'left', stage: 'call' },
        result: { method: 'next' },
        expected: step(0),
      },
      {
        id: 'right-prefix',
        args: [[0, 9, 2]],
        retain: { id: 'right', stage: 'call' },
        result: { method: 'next' },
        expected: step(0),
      },
      {
        id: 'next-values-differ',
        module: 'equalsIterable',
        export: '$module',
        args: [ref('left'), ref('right')],
        expected: false,
      },
      next('left-still-open', 'left', step(2)),
      next('right-still-open', 'right', step(2)),
      next('left-terminal', 'left', done),
      next('right-terminal', 'right', done),
    ]),
  );
  return cases;
}
