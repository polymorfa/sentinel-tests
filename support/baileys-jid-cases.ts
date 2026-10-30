import type { BehaviorCase, JsonValue, Probe } from './types.ts';

export const baileysJidCommit = '81345beb67ca3fb0eb79a2c20cd4ac24da517929';
export const baileysJidModule = `library:baileys:${baileysJidCommit}:jid-utils`;

/** Frozen literal/table oracles for an actual pinned JID leaf; no library implementation enters this file. */
export function baileysJidCases(): BehaviorCase[] {
  const undef: JsonValue = { $type: 'undefined' };
  const nan: JsonValue = { $type: 'number', value: 'NaN' };
  const infinity: JsonValue = { $type: 'number', value: 'Infinity' };
  const minusInfinity: JsonValue = { $type: 'number', value: '-Infinity' };
  const cases: BehaviorCase[] = [];
  function family(id: string, exported: string): Probe[] {
    const probes: Probe[] = [];
    cases.push({
      schemaVersion: 1,
      id: `baileys-private-jid-${id}-v1`,
      version: 1,
      module: baileysJidModule,
      export: exported,
      context: { clock: '2026-10-30T00:00:00.000Z', timezone: 'UTC', randomSeed: 1, gates: {} },
      stubs: [],
      probes,
    });
    return probes;
  }
  function add(
    probes: Probe[],
    id: string,
    args: JsonValue[],
    expected: JsonValue,
    exported?: string,
  ) {
    probes.push({ id, args, expected, ...(exported ? { export: exported } : {}) });
  }
  function bad(probes: Probe[], id: string, args: JsonValue[], exported?: string) {
    probes.push({
      id,
      args,
      throws: { name: 'TypeError' },
      ...(exported ? { export: exported } : {}),
    });
  }
  function decoded(
    server: string,
    user: string,
    domainType: JsonValue = 0,
    device: JsonValue = undef,
  ): JsonValue {
    return { server, user, domainType, device };
  }
  const encode = family('encode-literals', 'jidEncode');
  const encodeVectors: [JsonValue[], string][] = [
    [['alice', 's.whatsapp.net'], 'alice@s.whatsapp.net'],
    [[null, 'lid'], '@lid'],
    [[0, 'c.us'], '@c.us'],
    [['0', 'c.us', 0, 0], '0@c.us'],
    [[undef, 'g.us'], '@g.us'],
    [['', 'newsletter', 1, 2], '_2:1@newsletter'],
    [[7, 'call', -1, -2], '7_-2:-1@call'],
    [['a', 'hosted', 99], 'a:99@hosted'],
    [['a', 'hosted.lid', 99, 129], 'a_129:99@hosted.lid'],
    [['u', 's.whatsapp.net', nan, nan], 'u@s.whatsapp.net'],
    [['u', 's.whatsapp.net', infinity, minusInfinity], 'u_-Infinity:Infinity@s.whatsapp.net'],
    [['u', 's.whatsapp.net', null, null], 'u@s.whatsapp.net'],
    [[false, 'bot'], '@bot'],
    [[12.5, 'lid', 1.5, 2.5], '12.5_2.5:1.5@lid'],
    [['A@B', 'C.US', 1, 1], 'A@B_1:1@C.US'],
  ];
  encodeVectors.forEach(([args, value], i) => add(encode, `literal-${i}`, args, value));
  const decode = family('decode-literals', 'jidDecode');
  const decodeVectors: [JsonValue, JsonValue][] = [
    [undef, undef],
    [null, undef],
    [false, undef],
    [7, undef],
    ['', undef],
    ['bad', undef],
    ['@', decoded('', '')],
    ['alice@s.whatsapp.net', decoded('s.whatsapp.net', 'alice')],
    ['alice:0@s.whatsapp.net', decoded('s.whatsapp.net', 'alice', 0, 0)],
    ['alice_2:7@s.whatsapp.net', decoded('s.whatsapp.net', 'alice', 2, 7)],
    ['alice_2:7@lid', decoded('lid', 'alice', 1, 7)],
    ['alice_2:7@hosted', decoded('hosted', 'alice', 128, 7)],
    ['alice_2:7@hosted.lid', decoded('hosted.lid', 'alice', 129, 7)],
    ['a:x@unknown', decoded('unknown', 'a', 0, nan)],
    ['a_abc:2@unknown', decoded('unknown', 'a', nan, 2)],
    ['a_2_ignored:3:4@x@y', decoded('x@y', 'a', 2, 3)],
    ['a_0x10:0x10@x', decoded('x', 'a', 16, 16)],
    ['a_12tail: @x', decoded('x', 'a', 12, 0)],
    [':@lid', decoded('lid', '', 1)],
    ['A_2:2@LID', decoded('LID', 'A', 2, 2)],
  ];
  decodeVectors.forEach(([value, expected], i) => add(decode, `literal-${i}`, [value], expected));
  const normalized = family('normalization-literals', 'jidNormalizedUser');
  const normalizationVectors: [JsonValue, string][] = [
    [undef, ''],
    [null, ''],
    [false, ''],
    ['', ''],
    ['bad', ''],
    ['199:2@c.us', '199@s.whatsapp.net'],
    ['a_2:7@lid', 'a@lid'],
    ['A_2:7@C.US', 'A@C.US'],
    ['A_2:7@s.whatsapp.net', 'A@s.whatsapp.net'],
    ['@c.us', '@s.whatsapp.net'],
    ['@', '@'],
    ['a@x@y', 'a@x@y'],
    ['a:Infinity@hosted', 'a@hosted'],
    ['0:0@c.us', '0@s.whatsapp.net'],
  ];
  normalizationVectors.forEach(([value, expected], i) =>
    add(normalized, `literal-${i}`, [value], expected),
  );
  const equality = family('same-user-literals', 'areJidsSameUser');
  const equalityVectors: [JsonValue, JsonValue, boolean][] = [
    ['u:1@s.whatsapp.net', 'u:2@lid', true],
    ['u@bot', 'u@g.us', true],
    ['u@x', 'v@x', false],
    [undef, undef, true],
    [null, undef, true],
    ['bad', 'bad', true],
    ['bad', 'u@x', false],
    ['@x', '@y', true],
    ['A@x', 'a@x', false],
    ['a_1:3@lid', 'a_2:4@c.us', true],
    ['a:1:ignored@x', 'a@x', true],
    ['', null, true],
  ];
  equalityVectors.forEach(([a, b, expected], i) => add(equality, `literal-${i}`, [a, b], expected));
  const predicates = [
    'isJidMetaAI',
    'isPnUser',
    'isLidUser',
    'isJidBroadcast',
    'isJidGroup',
    'isJidStatusBroadcast',
    'isJidNewsletter',
    'isHostedPnUser',
    'isHostedLidUser',
  ];
  const classification = family('server-predicate-table', 'isPnUser');
  const classifierVectors: [string, string[]][] = [
    ['a@s.whatsapp.net', ['isPnUser']],
    ['a@lid', ['isLidUser']],
    ['a@broadcast', ['isJidBroadcast']],
    ['status@broadcast', ['isJidBroadcast', 'isJidStatusBroadcast']],
    ['a@g.us', ['isJidGroup']],
    ['a@newsletter', ['isJidNewsletter']],
    ['a@hosted', ['isHostedPnUser']],
    ['a@hosted.lid', ['isHostedLidUser']],
    ['a@bot', ['isJidMetaAI']],
    ['a@unknown', []],
  ];
  classifierVectors.forEach(([value, positive], i) =>
    predicates.forEach((exported) =>
      add(classification, `row-${i}-${exported}`, [value], positive.includes(exported), exported),
    ),
  );
  const odd = family('predicate-types-and-bot', 'isPnUser');
  for (const [i, input] of [undef, null, '', 7].entries())
    for (const exported of predicates) {
      if (exported === 'isJidStatusBroadcast')
        add(odd, `type-${i}-${exported}`, [input], false, exported);
      else if (input === 7) bad(odd, `type-${i}-${exported}`, [input], exported);
      else add(odd, `type-${i}-${exported}`, [input], input === '' ? false : undef, exported);
    }
  const botVectors: [JsonValue, JsonValue][] = [
    [undef, undef],
    [null, null],
    ['', ''],
    [false, false],
    ['13135550000@c.us', true],
    ['13165550000@c.us', true],
    ['13135550000:1@c.us', false],
    ['13135550000@s.whatsapp.net', false],
    ['13135550000@C.US', false],
    ['1313555000@c.us', false],
    ['131355500000@c.us', false],
    ['x13135550000@c.us', false],
    ['13135550000@bot', false],
    ['0@c.us', false],
    ['13135550000@x@c.us', true],
  ];
  botVectors.forEach(([value, expected], i) => add(odd, `bot-${i}`, [value], expected, 'isJidBot'));
  bad(odd, 'bot-number', [7], 'isJidBot');
  const domains = family('domain-enum-and-fallback', 'getServerFromDomainType');
  for (const [i, initial] of ['s.whatsapp.net', 'custom', '', 'LID'].entries())
    for (const [domain, expected] of [
      [0, initial],
      [1, 'lid'],
      [128, 'hosted'],
      [129, 'hosted.lid'],
    ] as const)
      add(domains, `enum-${i}-${domain}`, [initial, domain], expected);
  [undef, null, -1, 2, '1', nan, infinity].forEach((value, i) =>
    add(domains, `fallback-${i}`, ['custom', value], 'custom'),
  );
  const grid = family('enum-device-grid', 'jidEncode');
  // Fixed reviewed suffix/decoded-value table; no source function calculates an oracle.
  const gridRows: [number, number, string, number, JsonValue][] = [
    [0, 0, '', 0, undef],
    [0, 1, ':1', 0, 1],
    [0, 99, ':99', 0, 99],
    [1, 0, '_1', 1, undef],
    [1, 1, '_1:1', 1, 1],
    [1, 99, '_1:99', 1, 99],
    [128, 0, '_128', 128, undef],
    [128, 1, '_128:1', 128, 1],
    [128, 99, '_128:99', 128, 99],
    [129, 0, '_129', 129, undef],
    [129, 1, '_129:1', 129, 1],
    [129, 99, '_129:99', 129, 99],
  ];
  for (const [server, forcedDomain] of [
    ['s.whatsapp.net', null],
    ['lid', 1],
  ] as const)
    for (const [agent, device, suffix, domain, decodedDevice] of gridRows) {
      const value = `19995550000${suffix}@${server}`;
      const id = `${server}-${agent}-${device}`;
      add(grid, `encode-${id}`, ['19995550000', server, device, agent], value);
      add(
        grid,
        `decode-${id}`,
        [value],
        decoded(
          server,
          '19995550000',
          forcedDomain === null ? domain : forcedDomain,
          decodedDevice,
        ),
        'jidDecode',
      );
    }
  const transfer = family('transfer-device-literals', 'transferDevice');
  const transferVectors: [JsonValue, JsonValue, string][] = [
    ['u:7@lid', 'v@c.us', 'v:7@c.us'],
    ['u:0@x', 'v@lid', 'v@lid'],
    ['u:99@x', 'v_129:4@hosted.lid', 'v:99@hosted.lid'],
    ['bad', 'v@x', 'v@x'],
    [undef, 'v@x', 'v@x'],
    ['u:x@x', 'v@x', 'v@x'],
    ['u:-3@x', 'v@x', 'v:-3@x'],
    ['u:Infinity@x', 'v@x', 'v:Infinity@x'],
    ['u:1@x', '@lid', ':1@lid'],
    ['u_1:2@x', 'v_2:3@y@z', 'v:2@y@z'],
  ];
  transferVectors.forEach(([a, b, expected], i) => add(transfer, `literal-${i}`, [a, b], expected));
  bad(transfer, 'missing-target', ['u:1@x', 'bad']);
  bad(transfer, 'undefined-target', ['u:1@x', undef]);

  return cases;
}
