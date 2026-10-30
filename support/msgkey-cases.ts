import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const globalsA: JsonValue = {
  myJids: { deviceJid: '19995550000:1@s.whatsapp.net', userJid: '19995550000@s.whatsapp.net' },
  lidDeviceJid: '12345:1@lid',
};
const globalsB: JsonValue = {
  myJids: { deviceJid: '19995550001:2@s.whatsapp.net', userJid: '19995550001@s.whatsapp.net' },
  lidDeviceJid: '12346:2@lid',
};
const boundary: JsonValue = {
  $type: 'function',
  throws: { name: 'SentinelFixtureBoundaryError', message: 'Unavailable provider was invoked' },
};
const makeCase = (id: string, probes: Probe[]): BehaviorCase => ({
  schemaVersion: 1,
  id: `msgkey-${id}-v1`,
  version: 1,
  module: 'WAWebMsgKey',
  export: 'from',
  context: {
    babelHelpers: ['extends', 'taggedTemplateLiteralLoose'],
    gates: { gkx: {}, abprops: {}, knobs: {} },
  },
  stubs: [
    ...['JSErrorLoggingConfig', 'cr:34987', 'cr:38444', 'cr:5411', 'cr:6640'].map((module) => ({
      module,
      exports: module === 'cr:6640' ? null : boundary,
    })),
    {
      module: 'WAWebRuntimeEnvironmentUtils',
      exports: { isWorker: { $type: 'function', returns: true } },
    },
  ],
  probes,
});
const globals = (id: string, value: JsonValue): Probe => ({
  id,
  module: 'WAWebGlobals',
  export: 'setGlobals',
  args: [value],
  expected: absent,
});
const clear = (id: string, entry: string): Probe => ({
  id,
  module: 'WAWebUserPrefsMeUser',
  export: entry,
  args: [],
  expected: absent,
});
const representation = (id: string, value: JsonValue, expected: string, entry = 'from'): Probe => ({
  id,
  export: entry,
  args: [value],
  result: { method: 'toString' },
  expected,
});
const remotes = [
  { input: '19995550001@s.whatsapp.net', output: '19995550001@c.us', self: false },
  { input: '19995550000@s.whatsapp.net', output: '19995550000@c.us', self: true },
  { input: '19995550000.0:00@c.us', output: '19995550000@c.us', self: true },
  { input: '19995550000:1@c.us', output: '19995550000:1@c.us', self: false },
  { input: '12346@lid', output: '12346@lid', self: false },
  { input: '12345@lid', output: '12345@lid', self: true },
  { input: '120363000001-1555000000@g.us', output: '120363000001-1555000000@g.us', self: false },
  { input: 'status@broadcast', output: 'status@broadcast', self: false },
  { input: '120363@newsletter', output: '120363@newsletter', self: false },
  { input: '19995550001:99@hosted', output: '19995550001:99@hosted', self: false },
  { input: '12346:99@hosted.lid', output: '12346:99@hosted.lid', self: false },
  { input: 'call', output: 'call', self: false },
];
const ids = ['A', 'message_odd_parts', 'odd\u0000\n\\é😀', 'x'.repeat(4097)];
const participants = [
  { input: undefined, output: '' },
  { input: '19995550002.0:02@s.whatsapp.net', output: '_19995550002:2@c.us' },
  { input: '12347@lid', output: '_12347@lid' },
];

/** Literal expectations for actual MsgKey.from, actual factory-created Wids and original self readers. */
export function msgkeyCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const probes: Probe[] = [];
  let index = 0;
  for (const remote of remotes)
    for (const fromMe of [false, true])
      for (const id of ids)
        for (const participant of participants) {
          const object: Record<string, JsonValue> = { fromMe, remote: remote.input, id };
          if (participant.input !== undefined) object.participant = participant.input;
          probes.push(
            representation(
              `object-${index++}`,
              object,
              `${fromMe}_${remote.output}_${id}${remote.self ? (fromMe ? '_out' : '_in') : ''}${participant.output}`,
            ),
          );
        }
  for (let offset = 0; offset < probes.length; offset += 48)
    cases.push(
      makeCase(`object-${offset}`, [
        globals('globals-a', globalsA),
        ...probes.slice(offset, offset + 48),
      ]),
    );
  const stringProbes: Probe[] = [
    representation('three-slots', 'true_19995550001@s.whatsapp.net_A', 'true_19995550001@c.us_A'),
    representation('fourth-out-ignored', 'true_19995550001@c.us_A_out', 'true_19995550001@c.us_A'),
    representation('fourth-in-ignored', 'false_19995550001@c.us_A_in', 'false_19995550001@c.us_A'),
    representation(
      'fourth-participant',
      'true_19995550001@c.us_A_12347@lid',
      'true_19995550001@c.us_A_12347@lid',
    ),
    representation(
      'fifth-participant',
      'false_19995550001@c.us_A_out_12347@lid',
      'false_19995550001@c.us_A_12347@lid',
    ),
    representation(
      'fifth-with-odd-fourth',
      'true_19995550001@c.us_A_ignored_19995550002@s.whatsapp.net',
      'true_19995550001@c.us_A_19995550002@c.us',
    ),
    representation(
      'extra-slots-drop-participant',
      'true_19995550001@c.us_A_out_12347@lid_extra',
      'true_19995550001@c.us_A',
    ),
    representation('self-derived-out', 'true_19995550000@c.us_A_in', 'true_19995550000@c.us_A_out'),
    representation('self-derived-in', 'false_12345@lid_A_out', 'false_12345@lid_A_in'),
    representation('only-exact-true-token', 'TRUE_19995550001@c.us_A', 'false_19995550001@c.us_A'),
  ];
  cases.push(
    makeCase('string-representation', [
      globals('globals-a', globalsA),
      ...stringProbes,
      ...stringProbes.map((probe, position) => ({
        ...probe,
        id: `from-string-${position}`,
        export: 'fromString',
      })),
    ]),
  );
  const parser = (
    id: string,
    value: string,
    fromMe: boolean,
    remote: JsonValue,
    messageId: JsonValue,
    participant: JsonValue = absent,
  ): Probe => ({
    id,
    module: 'WAWebParseMsgKeyString',
    export: '$module',
    args: [value],
    expected: { fromMe, remote, id: messageId, participant },
  });
  cases.push(
    makeCase('literal-parser-fields', [
      parser('three', 'true_remote_ID', true, 'remote', 'ID'),
      parser('four-out', 'true_remote_ID_out', true, 'remote', 'ID'),
      parser('four-in', 'false_remote_ID_in', false, 'remote', 'ID'),
      parser('four-participant', 'true_remote_ID_participant', true, 'remote', 'ID', 'participant'),
      parser('five', 'true_remote_ID_out_participant', true, 'remote', 'ID', 'participant'),
      parser('five-empty', 'true_remote_ID__participant', true, 'remote', 'ID', 'participant'),
      parser('six', 'true_remote_ID_out_participant_extra', true, 'remote', 'ID'),
      parser('uppercase', 'TRUE_remote_ID', false, 'remote', 'ID'),
      parser('numeric-token', '1_remote_ID', false, 'remote', 'ID'),
      parser('empty-remote', 'true__ID', true, '', 'ID'),
      parser('empty-id-and-participant', 'false_remote__', false, 'remote', '', ''),
      parser('unicode', 'true_é😀_nul\u0000_odd\n', true, 'é😀', 'nul\u0000', 'odd\n'),
      ...[null, absent, '', false, 0, [], {}].map((value, position): Probe => ({
        id: `invalid-parser-${position}`,
        module: 'WAWebParseMsgKeyString',
        export: '$module',
        args: [value],
        throws: { name: 'Error', message: 'MsgKey fromString error: str is null or not a string' },
      })),
      {
        id: 'null-from-string',
        export: 'fromString',
        args: [null],
        throws: { name: 'Error', message: 'MsgKey.fromString error: str is null or not a string' },
      },
    ]),
  );
  cases.push(
    makeCase('self-cache-lifetime', [
      globals('globals-a', globalsA),
      representation(
        'pn-self-a',
        { fromMe: true, remote: '19995550000@c.us', id: 'A' },
        'true_19995550000@c.us_A_out',
      ),
      representation(
        'lid-self-a',
        { fromMe: false, remote: '12345@lid', id: 'A' },
        'false_12345@lid_A_in',
      ),
      globals('globals-b', globalsB),
      representation(
        'cached-pn-old-self',
        { fromMe: true, remote: '19995550000@c.us', id: 'B' },
        'true_19995550000@c.us_B_out',
      ),
      representation(
        'cached-pn-new-not-self',
        { fromMe: true, remote: '19995550001@c.us', id: 'B' },
        'true_19995550001@c.us_B',
      ),
      representation(
        'cached-lid-old-self',
        { fromMe: false, remote: '12345@lid', id: 'B' },
        'false_12345@lid_B_in',
      ),
      representation(
        'cached-lid-new-not-self',
        { fromMe: false, remote: '12346@lid', id: 'B' },
        'false_12346@lid_B',
      ),
      clear('clear-pn', 'clearGetMaybeMePnUserCache'),
      representation(
        'fresh-pn-new-self',
        { fromMe: true, remote: '19995550001@c.us', id: 'C' },
        'true_19995550001@c.us_C_out',
      ),
      representation(
        'fresh-pn-old-not-self',
        { fromMe: true, remote: '19995550000@c.us', id: 'C' },
        'true_19995550000@c.us_C',
      ),
      representation(
        'lid-still-cached',
        { fromMe: false, remote: '12345@lid', id: 'C' },
        'false_12345@lid_C_in',
      ),
      clear('clear-lid', 'clearGetMaybeMeLidUserCache'),
      representation(
        'fresh-lid-new-self',
        { fromMe: false, remote: '12346@lid', id: 'D' },
        'false_12346@lid_D_in',
      ),
      representation(
        'fresh-lid-old-not-self',
        { fromMe: false, remote: '12345@lid', id: 'D' },
        'false_12345@lid_D',
      ),
    ]),
  );
  cases.push(
    makeCase('json-guard-and-clone', [
      globals('globals-a', globalsA),
      ...(
        [
          null,
          {},
          { fromMe: true, remote: '19995550001@c.us', id: 'A' },
          'true_19995550001@c.us_A',
        ] as JsonValue[]
      ).map((other, position): Probe => ({
        id: `equals-json-${position}`,
        args: [{ fromMe: true, remote: '19995550001@c.us', id: 'A' }],
        result: { method: 'equals', args: [other] },
        expected: false,
      })),
      {
        id: 'clone-own-data',
        args: [{ fromMe: true, remote: '19995550001@c.us', id: 'A' }],
        result: { method: 'clone' },
        expected: {
          fromMe: true,
          remote: { server: 'c.us', user: '19995550001', _serialized: '19995550001@c.us' },
          id: 'A',
          $1: 'true_19995550001@c.us_A',
        },
      },
    ]),
  );
  cases.push(...msgkeyReferenceCases());
  return cases;
}

const ref = (id: string): JsonValue => ({ $type: 'reference', value: id });
function msgkeyReferenceCases(): BehaviorCase[] {
  const vectors = [
    { fromMe: true, remote: '19995550001@c.us', id: 'R', serialized: 'true_19995550001@c.us_R' },
    {
      fromMe: false,
      remote: '19995550000@c.us',
      id: 'S',
      serialized: 'false_19995550000@c.us_S_in',
      self: 'in',
    },
    { fromMe: false, remote: '12346@lid', id: 'L', serialized: 'false_12346@lid_L' },
    {
      fromMe: true,
      remote: '120363000001-1555000000@g.us',
      id: 'G',
      serialized: 'true_120363000001-1555000000@g.us_G_12347@lid',
      participant: '12347@lid',
    },
  ];
  const cases: BehaviorCase[] = [];
  for (const [index, vector] of vectors.entries()) {
    const input: Record<string, JsonValue> = {
      fromMe: vector.fromMe,
      remote: vector.remote,
      id: vector.id,
    };
    if (vector.participant) input.participant = vector.participant;
    const widData = (serialized: string): JsonValue => {
      const [user, server] = serialized.split('@');
      return { server: server!, user: user!, _serialized: serialized };
    };
    const cloneData: Record<string, JsonValue> = {
      fromMe: vector.fromMe,
      remote: widData(vector.remote),
      id: vector.id,
      $1: vector.serialized,
    };
    if (vector.self) cloneData.self = vector.self;
    if (vector.participant) cloneData.participant = widData(vector.participant);
    const identity = (id: string, value: JsonValue, handle: string, expected: boolean): Probe => ({
      id,
      args: [value],
      result: { identityWith: handle },
      ...(!expected ? { retain: { id: `observed-${id}`, stage: 'call' as const } } : {}),
      expected,
    });
    cases.push(
      makeCase(`retained-identity-${index}`, [
        globals('globals-a', globalsA),
        {
          ...representation('retain-original', input, vector.serialized),
          retain: { id: 'original', stage: 'call' },
        },
        identity('from-original-preserves-identity', ref('original'), 'original', true),
        {
          id: 'retain-actual-clone',
          args: [ref('original')],
          result: { method: 'clone' },
          retain: { id: 'clone', stage: 'result' },
          expected: cloneData,
        },
        identity('clone-is-distinct-from-original', ref('clone'), 'original', false),
        identity(
          'captured-clone-return-is-actual-MsgKey',
          ref('observed-clone-is-distinct-from-original'),
          'observed-clone-is-distinct-from-original',
          true,
        ),
        representation(
          'captured-clone-return-literal',
          ref('observed-clone-is-distinct-from-original'),
          vector.serialized,
        ),
        {
          id: 'captured-clone-positive-equals',
          args: [ref('observed-clone-is-distinct-from-original')],
          result: { method: 'equals', args: [ref('original')] },
          expected: true,
        },
        identity('from-clone-preserves-clone', ref('clone'), 'clone', true),
        {
          id: 'clone-equals-original',
          args: [ref('clone')],
          result: { method: 'equals', args: [ref('original')] },
          expected: true,
        },
        {
          id: 'original-equals-clone',
          args: [ref('original')],
          result: { method: 'equals', args: [ref('clone')] },
          expected: true,
        },
        representation('clone-serialization-literal', ref('clone'), vector.serialized),
        {
          ...representation('retain-separate-equal-construction', input, vector.serialized),
          retain: { id: 'separate', stage: 'call' },
        },
        identity('separate-construction-distinct', ref('separate'), 'original', false),
        identity(
          'captured-separate-return-is-actual-MsgKey',
          ref('observed-separate-construction-distinct'),
          'observed-separate-construction-distinct',
          true,
        ),
        representation(
          'captured-separate-literal',
          ref('observed-separate-construction-distinct'),
          vector.serialized,
        ),
        {
          id: 'captured-separate-positive-equals',
          args: [ref('observed-separate-construction-distinct')],
          result: { method: 'equals', args: [ref('original')] },
          expected: true,
        },

        {
          id: 'separate-real-instance-equals',
          args: [ref('separate')],
          result: { method: 'equals', args: [ref('original')] },
          expected: true,
        },
        {
          id: 'different-message-id-not-equal',
          args: [{ ...input, id: 'DIFFERENT' }],
          result: { method: 'equals', args: [ref('original')] },
          expected: false,
        },
      ]),
    );
  }
  const selfInput: JsonValue = { fromMe: true, remote: '19995550000@c.us', id: 'A' };
  cases.push(
    makeCase('retained-self-clone-after-cache-clear', [
      globals('globals-a', globalsA),
      {
        ...representation('retain-original-self', selfInput, 'true_19995550000@c.us_A_out'),
        retain: { id: 'original', stage: 'call' },
      },
      globals('globals-b', globalsB),
      clear('clear-pn', 'clearGetMaybeMePnUserCache'),
      clear('clear-lid', 'clearGetMaybeMeLidUserCache'),
      {
        id: 'from-original-still-same-object',
        args: [ref('original')],
        result: { identityWith: 'original' },
        expected: true,
      },
      {
        id: 'clone-recomputes-self-context',
        args: [ref('original')],
        result: { method: 'clone' },
        retain: { id: 'clone', stage: 'result' },
        expected: {
          fromMe: true,
          remote: { server: 'c.us', user: '19995550000', _serialized: '19995550000@c.us' },
          id: 'A',
          $1: 'true_19995550000@c.us_A',
        },
      },
      {
        id: 'changed-context-clone-is-actual-MsgKey',
        args: [ref('clone')],
        result: { identityWith: 'clone' },
        expected: true,
      },
      representation('clone-new-context-literal', ref('clone'), 'true_19995550000@c.us_A'),
      representation(
        'original-old-context-retained',
        ref('original'),
        'true_19995550000@c.us_A_out',
      ),
      {
        id: 'changed-context-clone-not-equal',
        args: [ref('clone')],
        result: { method: 'equals', args: [ref('original')] },
        expected: false,
      },
    ]),
  );
  return cases;
}
