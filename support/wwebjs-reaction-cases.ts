import type { BehaviorCase, JsonValue, Probe } from './types.ts';
export const wwebjsReactionCommit = '064a3d5a5a3dce1281a6a12740b5a7051339d154';
export const wwebjsReactionModule = `library:wwebjs:${wwebjsReactionCommit}:Reaction`;
const absent: JsonValue = { $type: 'undefined' };
const ref = (id: string): JsonValue => ({ $type: 'reference', value: id });
const empty = {
  id: absent,
  orphan: absent,
  orphanReason: absent,
  timestamp: absent,
  reaction: absent,
  read: absent,
  msgId: absent,
  senderId: absent,
  ack: absent,
};
// Input and observation tables are authored independently; no generic patch mapper supplies oracles.
const inputA: JsonValue = {
  msgKey: { $1: 'reaction-a' },
  orphan: 0,
  orphanReason: null,
  timestamp: 1720000000,
  reactionText: '👍',
  read: false,
  parentMsgKey: { _serialized: 'message-a' },
  senderUserJid: '111@c.us',
  ack: 1,
  ignored: 'not-a-reaction-field',
};
const stateA: JsonValue = {
  id: { $1: 'reaction-a' },
  orphan: 0,
  orphanReason: null,
  timestamp: 1720000000,
  reaction: '👍',
  read: false,
  msgId: { _serialized: 'message-a' },
  senderId: '111@c.us',
  ack: 1,
};
const inputB: JsonValue = {
  msgKey: 'reaction-b',
  orphan: -7,
  orphanReason: 'late',
  timestamp: 0,
  reactionText: '',
  read: true,
  parentMsgKey: 0,
  senderUserJid: null,
  ack: null,
};
const stateB: JsonValue = {
  id: 'reaction-b',
  orphan: -7,
  orphanReason: 'late',
  timestamp: 0,
  reaction: '',
  read: true,
  msgId: 0,
  senderId: null,
  ack: null,
};
const inputC: JsonValue = { reactionText: 'partial', ignored: 7 };
const stateC: JsonValue = { ...empty, reaction: 'partial' };
const inputD: JsonValue = { ack: 9 };
const stateD: JsonValue = { ...empty, ack: 9 };
const construct = (id: string, args: JsonValue[], expected: JsonValue, retain?: string): Probe => ({
  id,
  construct: true,
  args,
  result: { method: '_clone' },
  expected,
  ...(retain ? { retain: { id: retain, stage: 'call' as const } } : {}),
});
const normalize = (id: string, args: JsonValue[], expected: JsonValue): Probe => ({
  id,
  module: './Base',
  export: '_normalizeId',
  args,
  expected,
});
const clone = (id: string, target: string, expected: JsonValue, retain?: string): Probe => ({
  ...normalize(id, [ref(target)], expected),
  result: { method: '_clone' },
  ...(retain ? { retain: { id: retain, stage: 'result' as const } } : {}),
});
const patch = (id: string, target: string, data: JsonValue): Probe => ({
  ...normalize(id, [ref(target)], data),
  result: { method: '_patch', args: [data] },
});
const identity = (id: string, value: string, other: string, expected: boolean): Probe => ({
  ...normalize(id, [ref(value)], expected),
  result: { identityWith: other },
});
const badPatch = (id: string, target: string, args: JsonValue[]): Probe => ({
  id,
  module: './Base',
  export: '_normalizeId',
  args: [ref(target)],
  result: { method: '_patch', args },
  throws: { name: 'TypeError' },
});
const make = (name: string, probes: Probe[]): BehaviorCase => ({
  schemaVersion: 1,
  id: `wwebjs-reaction-${name}-v1`,
  version: 1,
  module: wwebjsReactionModule,
  export: '$module',
  context: { clock: '2026-10-30T00:00:00.000Z', timezone: 'UTC', randomSeed: 1, gates: {} },
  stubs: [],
  probes,
});

/** Actual Reaction/Base constructors, patch/clone methods and static normalization only. */
export function wwebjsReactionCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const falsy: JsonValue[][] = [
    [null],
    [null, absent],
    [null, null],
    [null, false],
    [null, 0],
    [null, ''],
    [null, { $type: 'number', value: 'NaN' }],
    [null, { $type: 'BigInt', value: '0' }],
  ];
  const truthy: JsonValue[] = [{}, [], true, 1, 'x', { $type: 'BigInt', value: '1' }];
  cases.push(
    make('constructor-data-truthiness', [
      ...falsy.map((args, index) => construct(`falsy-${index}`, args, {})),
      ...truthy.map((data, index) => construct(`truthy-${index}`, [null, data], empty)),
      construct('full-data', [null, inputA], stateA),
    ]),
  );
  cases.push(
    make('field-mapping-and-partial-replacement', [
      construct('capture', [null, inputA], stateA, 'original'),
      patch('full-return', 'original', inputB),
      clone('full-state', 'original', stateB),
      patch('partial-return', 'original', inputC),
      clone('partial-state', 'original', stateC),
      patch('ack-only-return', 'original', inputD),
      clone('ack-only-state', 'original', stateD),
      patch('wrong-field-names-return', 'original', {
        id: 'wrong',
        reaction: 'wrong',
        msgId: 'wrong',
        senderId: 'wrong',
      }),
      clone('wrong-fields-not-copied', 'original', empty),
      patch('empty-return', 'original', {}),
      clone('empty-state', 'original', empty),
    ]),
  );
  cases.push(
    make('failed-patches-preserve-state-and-retry', [
      construct('capture', [null, inputA], stateA, 'original'),
      badPatch('null', 'original', [null]),
      clone('after-null', 'original', stateA),
      badPatch('undefined', 'original', [absent]),
      clone('after-undefined', 'original', stateA),
      patch('retry', 'original', inputB),
      clone('after-retry', 'original', stateB),
      badPatch('missing-argument', 'original', []),
      clone('after-missing', 'original', stateB),
      patch('partial-retry', 'original', inputC),
      clone('after-partial-retry', 'original', stateC),
    ]),
  );
  cases.push(
    make('actual-clone-isolation-and-identity', [
      construct('original', [null, inputA], stateA, 'original'),
      clone('retain-clone-a', 'original', stateA, 'clone-a'),
      identity('clone-distinct', 'clone-a', 'original', false),
      patch('original-to-b', 'original', inputB),
      clone('original-b', 'original', stateB),
      clone('old-clone-keeps-a', 'clone-a', stateA),
      patch('clone-to-c', 'clone-a', inputC),
      clone('clone-c', 'clone-a', stateC),
      clone('clone-update-does-not-change-original', 'original', stateB),
      clone('retain-clone-b', 'original', stateB, 'clone-b'),
      identity('two-clones-distinct', 'clone-b', 'clone-a', false),
      patch('original-clear', 'original', {}),
      clone('original-empty', 'original', empty),
      clone('clone-b-keeps-b', 'clone-b', stateB),
      clone('clone-a-keeps-c', 'clone-a', stateC),
    ]),
  );
  const primitives: JsonValue[] = [
    absent,
    null,
    false,
    0,
    '',
    true,
    1,
    'literal',
    { $type: 'number', value: 'NaN' },
    { $type: 'BigInt', value: '0' },
  ];
  cases.push(
    make(
      'base-normalization-primitives',
      primitives.map((value, index) => normalize(`primitive-${index}`, [value], value)),
    ),
  );
  const records: [JsonValue, JsonValue, boolean][] = [
    [{ $1: 'a' }, { $1: 'a', _serialized: 'a' }, false],
    [{ _serialized: null, $1: 'b' }, { _serialized: 'b', $1: 'b' }, false],
    [{ _serialized: absent, $1: 0 }, { _serialized: 0, $1: 0 }, false],
    [{ $1: false, extra: 'kept' }, { $1: false, extra: 'kept', _serialized: false }, false],
    [{ $1: '' }, { $1: '', _serialized: '' }, false],
    [{ _serialized: 'old', $1: 'new' }, { _serialized: 'old', $1: 'new' }, true],
    [{ _serialized: 0, $1: 'new' }, { _serialized: 0, $1: 'new' }, true],
    [{ _serialized: false, $1: 'new' }, { _serialized: false, $1: 'new' }, true],
    [{ _serialized: '', $1: 'new' }, { _serialized: '', $1: 'new' }, true],
    [{ $1: null, extra: 'kept' }, { $1: null, extra: 'kept' }, true],
    [{ other: 7 }, { other: 7 }, true],
    [{ _serialized: null, $1: absent }, { _serialized: null, $1: absent }, true],
  ];
  const normalization: Probe[] = [];
  records.forEach(([input, expected, same], index) => {
    const original = `input-${index}`,
      normalized = `normalized-${index}`;
    normalization.push(
      {
        id: `source-return-${index}`,
        module: './Base',
        export: '$module',
        construct: true,
        args: [null],
        result: { method: '_patch', args: [input] },
        retain: { id: original, stage: 'result' },
        expected: input,
      },
      {
        ...normalize(`copy-or-identity-${index}`, [ref(original)], same),
        result: { identityWith: original },
        retain: { id: normalized, stage: 'call' },
      },
      normalize(`normalized-fields-${index}`, [ref(normalized)], expected),
      identity(`repeat-normalization-${index}`, normalized, normalized, true),
    );
  });
  cases.push(make('base-normalization-copy-versus-identity', normalization));
  const table: [JsonValue, JsonValue][] = [
    [inputA, stateA],
    [inputB, stateB],
    [inputC, stateC],
    [inputD, stateD],
    [{}, empty],
  ];
  for (const page of [0, 1, 2]) {
    const probes: Probe[] = [
      construct('original', [null, inputA], stateA, 'original'),
      clone('old-clone', 'original', stateA, 'old'),
    ];
    for (let step = 0; step < 24; step++) {
      const [data, expected] = table[(step * 3 + page) % table.length]!;
      probes.push(
        patch(`patch-${step}`, 'original', data),
        clone(`state-${step}`, 'original', expected),
      );
      if (step % 6 === 5) probes.push(clone(`old-clone-${step}`, 'old', stateA));
    }
    cases.push(make(`generated-patch-history-${page}`, probes));
  }
  const large = '🌍\0\n' + 'x'.repeat(16384),
    reason = 'odd\0\n' + 'r'.repeat(4096);
  const largeInput: JsonValue = { reactionText: large, orphanReason: reason, ignored: 'ignored' };
  const largeState: JsonValue = { ...empty, reaction: large, orphanReason: reason };
  cases.push(
    make('large-odd-input-fields', [
      construct('large-original', [null, largeInput], largeState, 'original'),
      clone('large-clone', 'original', largeState, 'old'),
      patch('replace-large-with-partial', 'original', inputD),
      clone('small-state', 'original', stateD),
      clone('old-large-clone', 'old', largeState),
      patch('large-retry', 'original', largeInput),
      clone('large-state-restored', 'original', largeState),
    ]),
  );
  return cases;
}
