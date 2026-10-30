import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProbeControls } from '../support/probe-controls.ts';
import { widStateCases } from '../support/wid-state-cases.ts';
import { msgkeyCases } from '../support/msgkey-cases.ts';
import { resolvableCases } from '../support/resolvable-cases.ts';
import { lruStateCases, wwAiCacheCases } from '../support/cache-state-cases.ts';
import type { BehaviorCase, JsonValue } from '../support/types.ts';

const base = (): BehaviorCase => ({
  schemaVersion: 1,
  id: 'control',
  version: 1,
  module: 'Example',
  export: '$module',
  probes: [{ id: 'one', args: [], expected: 1 }],
});
const ref = (value = 'original'): JsonValue => ({ $type: 'reference', value });
const retained = (): BehaviorCase => ({
  ...base(),
  probes: [
    {
      id: 'make',
      args: [],
      retain: { id: 'original', stage: 'call' },
      result: { method: 'toString' },
      expected: 'value',
    },
    {
      id: 'clone',
      export: 'from',
      args: [ref()],
      retain: { id: 'clone', stage: 'result' },
      result: { method: 'clone' },
      expected: { value: 1 },
    },
    {
      id: 'identity',
      export: 'from',
      args: [ref('clone')],
      result: { identityWith: 'original' },
      expected: false,
    },
    {
      id: 'equals',
      export: 'from',
      args: [{ nested: [ref('clone')] }],
      result: { method: 'equals', args: [ref()] },
      expected: true,
    },
  ],
});
const reject = (value: unknown) => assert.throws(() => validateProbeControls(value));

test('probe validation admits module selectors, constructed methods and ordered Promise property operations', () => {
  validateProbeControls(base());
  validateProbeControls({
    ...base(),
    probes: [
      {
        id: 'selected',
        module: 'Other',
        export: 'Class.from',
        args: [],
        result: { method: 'toString' },
        clock: '2026-10-30T00:00:00.000Z',
        expected: 'value',
      },
    ],
  });
  validateProbeControls({
    ...base(),
    construct: { args: [1] },
    probes: [
      {
        id: 'capture',
        args: [],
        pending: { id: 'promise', action: 'start', property: 'promise' },
        expected: { $type: 'undefined' },
      },
      {
        id: 'inspect',
        args: [],
        pending: { id: 'promise', action: 'inspect' },
        expected: { state: 'pending' },
      },
      { id: 'resolve', method: 'resolve', args: [1], expected: { $type: 'undefined' } },
      { id: 'await', args: [], pending: { id: 'promise', action: 'await' }, expected: 1 },
    ],
  });
  validateProbeControls({
    ...base(),
    probes: [
      {
        id: 'start',
        args: [],
        pending: { id: 'job', action: 'start' },
        expected: { $type: 'undefined' },
      },
      { id: 'await', args: [], pending: { id: 'job', action: 'await' }, expected: 1 },
    ],
  });
});

test('retention validation admits prior object names recursively without claiming their runtime types', () => {
  validateProbeControls(retained());
  // Admission describes names and stages; only execution can reject a primitive
  // result or prove that these names refer to actual factory-created objects.
  validateProbeControls({
    ...base(),
    probes: [{ id: 'make', args: [], retain: { id: 'value', stage: 'call' }, expected: 1 }],
  });
  const maximum = {
    ...base(),
    probes: Array.from({ length: 128 }, (_, index) => ({
      id: `probe-${index}`,
      args: [],
      retain: { id: `object-${index}`, stage: 'call' },
      expected: null,
    })),
  };
  validateProbeControls(maximum);
  reject({ ...maximum, probes: [...maximum.probes, { id: 'overflow', args: [], expected: null }] });
});

test('reference IDs, marker shape and earlier-probe ordering fail closed', () => {
  for (const value of [
    '',
    'constructor',
    'prototype',
    '__proto__',
    'x'.repeat(129),
    'bad\nname',
    1,
    null,
  ]) {
    const testCase = retained();
    (testCase.probes[0].retain as unknown as Record<string, unknown>).id = value;
    reject(testCase);
  }
  for (const marker of [
    ref('later'),
    { $type: 'reference' },
    { $type: 'reference', value: 1 },
    { $type: 'reference', value: 'original', extra: true },
  ]) {
    const testCase = retained();
    testCase.probes[1].args = [marker];
    reject(testCase);
  }
  for (const mutate of [
    (value: BehaviorCase) => {
      value.probes[0].args = [ref()];
    },
    (value: BehaviorCase) => {
      value.probes[0].result = { identityWith: 'original' };
    },
    (value: BehaviorCase) => {
      value.probes[1].retain = { id: 'original', stage: 'call' };
    },
    (value: BehaviorCase) => {
      value.probes[1].result = { identityWith: 'clone' };
    },
  ]) {
    const testCase = retained();
    mutate(testCase);
    reject(testCase);
  }
});

test('references cannot escape argument trees or return through typed fixture functions', () => {
  for (const field of ['context', 'stubs', 'construct', 'sourceExpectation']) {
    const testCase: Record<string, unknown> = { ...retained(), [field]: { nested: [ref()] } };
    reject(testCase);
  }
  for (const field of ['expected', 'throws', 'clock']) {
    const testCase = retained();
    (testCase.probes[2] as unknown as Record<string, unknown>)[field] = ref();
    reject(testCase);
  }
  for (const field of ['returns', 'throws']) {
    const testCase = retained();
    testCase.probes[1].args = [{ $type: 'function', [field]: { nested: [ref()] } }];
    reject(testCase);
    testCase.probes[1].args = [];
    testCase.probes[1].result = { method: 'equals', args: [{ $type: 'function', [field]: ref() }] };
    reject(testCase);
  }
});

test('result and retention controls are exclusive and cannot merge with any pending operation', () => {
  for (const result of [
    { identityWith: 'original', method: 'equals' },
    { identityWith: 'original', args: [] },
    { identityWith: 'original', extra: true },
    { method: 'constructor' },
    { method: 'equals', extra: true },
  ]) {
    const testCase = retained();
    (testCase.probes[2] as unknown as Record<string, unknown>).result = result;
    reject(testCase);
  }
  for (const retain of [
    { id: 'new', stage: 'unknown' },
    { id: 'new', stage: 'call', extra: true },
    { id: 'new' },
  ]) {
    const testCase = retained();
    (testCase.probes[1] as unknown as Record<string, unknown>).retain = retain;
    reject(testCase);
  }
  const noProjection = retained();
  delete noProjection.probes[1].result;
  reject(noProjection);
  const identityResult = retained();
  identityResult.probes[1].result = { identityWith: 'original' };
  reject(identityResult);
  const throwing = retained();
  throwing.probes[0] = {
    id: 'make',
    args: [],
    retain: { id: 'original', stage: 'call' },
    throws: { name: 'Error' },
  };
  reject(throwing);
  for (const index of [0, 3]) {
    const mixed = retained();
    mixed.probes[index].pending = { id: 'job', action: 'start' };
    reject(mixed);
  }
});

test('ordinary selectors, error assertions, probe bounds and unique IDs stay enforced', () => {
  for (const value of [
    null,
    {},
    { ...base(), probes: [] },
    { ...base(), probes: [base().probes[0], base().probes[0]] },
  ])
    reject(value);
  for (const path of [
    'constructor',
    'Class.__proto__',
    'Class.prototype',
    'Class..from',
    '../from',
    '',
    'x'.repeat(257),
  ]) {
    reject({ ...base(), export: path });
    reject({ ...base(), probes: [{ id: 'selected', export: path, args: [], expected: 1 }] });
  }
  for (const probe of [
    { id: '', args: [], expected: 1 },
    { id: 'value', args: [], expected: 1, throws: { name: 'Error' } },
    { id: 'value', args: [], throws: {} },
    { id: 'value', args: [], throws: { code: 'bad' } },
    { id: 'value', args: [], expected: 1, unknown: true },
    { id: 'value', args: [], expected: 1, clock: '2026-10-30' },
    { id: 'value', args: [], expected: 1, module: 'Other' },
    { id: 'value', args: [], expected: 1, method: 'value' },
  ])
    reject({ ...base(), probes: [probe] });
  for (const name of ['constructor', '__proto__', 'prototype', 'value.call'])
    reject({
      ...base(),
      construct: { args: [] },
      probes: [{ id: 'value', method: name, args: [], expected: 1 }],
    });
});

test('pending controls preserve handle order and own Promise property boundaries', () => {
  for (const pending of [
    { id: 'missing', action: 'await' },
    { id: 'job', action: 'unknown' },
    { id: 'job', action: 'start', extra: true },
    { id: 'job', action: 'start', property: 'constructor' },
  ])
    reject({ ...base(), probes: [{ id: 'one', args: [], pending, expected: 1 }] });
  const start = { id: 'start', args: [], pending: { id: 'job', action: 'start' }, expected: 1 };
  reject({ ...base(), probes: [start, { ...start, id: 'second' }] });
  for (const extra of [
    { args: [1] },
    { export: 'value' },
    { method: 'value' },
    { result: { method: 'value' } },
    { module: 'Other', export: 'value' },
  ])
    reject({
      ...base(),
      probes: [
        start,
        { id: 'await', args: [], pending: { id: 'job', action: 'await' }, expected: 1, ...extra },
      ],
    });
  reject({ ...base(), construct: { args: [] }, probes: [{ id: 'one', args: [], expected: 1 }] });
  reject({
    ...base(),
    construct: { args: [] },
    probes: [
      {
        id: 'one',
        method: 'value',
        args: [],
        pending: { id: 'job', action: 'start', property: 'promise' },
        expected: 1,
      },
    ],
  });
});

test('authored Wid, MsgKey, Resolvable and cache plans use admitted controls without executing subjects', () => {
  const cases = [
    ...widStateCases(),
    ...msgkeyCases(),
    ...resolvableCases(),
    ...lruStateCases(),
    ...wwAiCacheCases(),
  ];
  assert.ok(cases.length > 100);
  for (const testCase of cases)
    assert.doesNotThrow(() => validateProbeControls(testCase), testCase.id);
});
