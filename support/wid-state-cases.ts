import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const missingProviders = ['JSErrorLoggingConfig', 'cr:34987', 'cr:38444', 'cr:5411', 'cr:6640'];
const boundary: JsonValue = {
  $type: 'function',
  throws: { name: 'SentinelFixtureBoundaryError', message: 'Unavailable provider was invoked' },
};
const globals = (pn: string, lid: string | null, device: number): JsonValue => ({
  myJids: { deviceJid: `${pn}:${device}@s.whatsapp.net`, userJid: `${pn}@s.whatsapp.net` },
  lidDeviceJid: lid === null ? null : `${lid}:${device}@lid`,
});
const A = globals('19995550000', '12345', 1);
const B = globals('19995550001', '12346', 2);
const C = globals('19995550002', null, 3);
const D = globals('19995550003', '12347', 4);
const call = (
  id: string,
  module: string,
  exported: string,
  args: JsonValue[],
  expected: JsonValue,
): Probe => ({ id, module, export: exported, args, expected });
const setGlobals = (id: string, value: JsonValue) =>
  call(id, 'WAWebGlobals', 'setGlobals', [value], absent);
const pn = (id: string, value: string): Probe => ({
  ...call(id, 'WAWebUserPrefsMeUser', 'getMaybeMePnUser', [], `${value}@c.us`),
  result: { method: 'toString' },
});
const lid = (id: string, value: string | null): Probe => ({
  ...call(
    id,
    'WAWebUserPrefsMeUser',
    'getMaybeMeLidUser',
    [],
    value === null ? null : `${value}@lid`,
  ),
  ...(value === null ? {} : { result: { method: 'toString' } }),
});
const clearPn = (id: string) =>
  call(id, 'WAWebUserPrefsMeUser', 'clearGetMaybeMePnUserCache', [], absent);
const clearLid = (id: string) =>
  call(id, 'WAWebUserPrefsMeUser', 'clearGetMaybeMeLidUserCache', [], absent);
const clearStore = (id: string) => call(id, 'WAWebWidStore', 'delete', [], absent);
const factory = (
  id: string,
  exported: string,
  args: JsonValue[],
  method: string,
  expected: JsonValue,
  resultArgs?: JsonValue[],
): Probe => ({
  id,
  export: exported,
  args,
  result: { method, ...(resultArgs ? { args: resultArgs } : {}) },
  expected,
});
function makeCase(id: string, gates: Record<string, boolean>, probes: Probe[]): BehaviorCase {
  return {
    schemaVersion: 1,
    id: `wid-state-${id}-${Object.values(gates).map(Number).join('')}-v1`,
    version: 1,
    module: 'WAWebWidFactory',
    export: 'createWid',
    probes,
    context: { babelHelpers: ['extends', 'taggedTemplateLiteralLoose'], gates: { gkx: gates } },
    stubs: [
      ...missingProviders.map((module) => ({
        module,
        exports: module === 'cr:6640' ? null : boundary,
      })),
      {
        module: 'WAWebRuntimeEnvironmentUtils',
        exports: { isWorker: { $type: 'function', returns: true } },
      },
    ],
  };
}
interface WidVector {
  input: string;
  canonical: string;
  jid: string;
  device: number;
  user: string;
  server?: string;
}
const literals: WidVector[] = [
  {
    input: '19995550000@s.whatsapp.net',
    canonical: '19995550000@c.us',
    jid: '19995550000@s.whatsapp.net',
    device: 0,
    user: '19995550000',
    server: 'c.us',
  },
  {
    input: '19995550000.0:01@c.us',
    canonical: '19995550000:1@c.us',
    jid: '19995550000:1@s.whatsapp.net',
    device: 1,
    user: '19995550000',
    server: 'c.us',
  },
  {
    input: '19995550000:0@c.us',
    canonical: '19995550000@c.us',
    jid: '19995550000@s.whatsapp.net',
    device: 0,
    user: '19995550000',
    server: 'c.us',
  },
  {
    input: '12345.0:02@lid',
    canonical: '12345:2@lid',
    jid: '12345:2@lid',
    device: 2,
    user: '12345',
    server: 'lid',
  },
  {
    input: '12345:7@msgr',
    canonical: '12345:7@lid',
    jid: '12345:7@lid',
    device: 7,
    user: '12345',
    server: 'lid',
  },
  {
    input: '19995550000:99@hosted',
    canonical: '19995550000:99@hosted',
    jid: '19995550000:99@hosted',
    device: 99,
    user: '19995550000',
    server: 'hosted',
  },
  {
    input: '12345:99@hosted.lid',
    canonical: '12345:99@hosted.lid',
    jid: '12345:99@hosted.lid',
    device: 99,
    user: '12345',
    server: 'hosted.lid',
  },
  {
    input: '12345-1234567890@g.us',
    canonical: '12345-1234567890@g.us',
    jid: '12345-1234567890@g.us',
    device: 0,
    user: '12345-1234567890',
    server: 'g.us',
  },
  {
    input: 'status@broadcast',
    canonical: 'status@broadcast',
    jid: 'status@broadcast',
    device: 0,
    user: 'status',
    server: 'broadcast',
  },
  {
    input: '12345@newsletter',
    canonical: '12345@newsletter',
    jid: '12345@newsletter',
    device: 0,
    user: '12345',
    server: 'newsletter',
  },
  {
    input: '12345:0@bot',
    canonical: '12345@bot',
    jid: '12345@bot',
    device: 0,
    user: '12345',
    server: 'bot',
  },
  {
    input: 'abcdef0123456789ab@call',
    canonical: 'abcdef0123456789ab@call',
    jid: 'abcdef0123456789ab@call',
    device: 0,
    user: 'abcdef0123456789ab',
    server: 'call',
  },
];

/** Actual factory/validator/Wid and self-user memoizers; all self data is synthetic source input. */
export function widStateCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  for (const gate16539 of [false, true])
    for (const gate26256 of [false, true])
      for (const redact of [false, true]) {
        const gates = { '16539': gate16539, '26256': gate26256, '26258': redact };
        cases.push(
          makeCase('separate-pn-lid-memoizers', gates, [
            setGlobals('set-A', A),
            pn('initial-PN-A', '19995550000'),
            lid('initial-LID-A', '12345'),
            setGlobals('replace-globals-B', B),
            pn('PN-stale-A', '19995550000'),
            lid('LID-stale-A', '12345'),
            clearPn('clear-PN-only'),
            pn('PN-fresh-B', '19995550001'),
            lid('LID-still-stale-A', '12345'),
            clearLid('clear-LID'),
            lid('LID-fresh-B', '12346'),
            setGlobals('set-C-no-LID', C),
            clearLid('clear-before-null-LID'),
            lid('LID-null-cached', null),
            setGlobals('set-D', D),
            lid('LID-null-retained-after-source-update', null),
            pn('PN-still-cached-B', '19995550001'),
            clearPn('clear-PN-before-D'),
            pn('PN-fresh-D', '19995550003'),
            clearLid('clear-null-LID'),
            lid('LID-fresh-D', '12347'),
            clearStore('delete-factory-cache'),
            pn('PN-memoizer-retains-value', '19995550003'),
            lid('LID-memoizer-retains-value', '12347'),
            setGlobals('set-A-again', A),
            pn('PN-stale-D-after-reinit', '19995550003'),
            lid('LID-stale-D-after-reinit', '12347'),
            clearPn('clear-PN-reinit'),
            clearLid('clear-LID-reinit'),
            pn('PN-reinitialized-A', '19995550000'),
            lid('LID-reinitialized-A', '12345'),
          ]),
        );
        cases.push(
          makeCase('failed-source-read-retry', gates, [
            {
              id: 'PN-before-globals-error',
              module: 'WAWebUserPrefsMeUser',
              export: 'getMaybeMePnUser',
              args: [],
              throws: { name: 'Error', message: 'globals api called before set' },
            },
            setGlobals('set-missing-device-globals', { myJids: {}, lidDeviceJid: null }),
            {
              id: 'PN-missing-device-error',
              module: 'WAWebUserPrefsMeUser',
              export: 'getMaybeMePnUser',
              args: [],
              throws: { name: 'Error', message: "Trying to access myDeviceJid, but it's not set" },
            },
            lid('null-LID-cached', null),
            setGlobals('restore-valid-A', A),
            pn('failed-PN-not-cached-retry-A', '19995550000'),
            lid('null-LID-remains-cached', null),
            clearLid('clear-null-after-restore'),
            lid('LID-valid-after-clear', '12345'),
          ]),
        );
        const representation: Probe[] = [];
        for (const [index, vector] of literals.entries()) {
          const logUser = redact
            ? vector.server === 'g.us'
              ? `${vector.user.split('-')[0]!.slice(-4)}-${vector.user.split('-')[1]}`
              : vector.user.slice(-4)
            : vector.user;
          const log = `${logUser}${vector.device ? `:${vector.device}` : ''}@${vector.server}`;
          representation.push(
            factory(
              `v-${index}-canonical`,
              'createWid',
              [vector.input],
              'toString',
              vector.canonical,
            ),
            factory(`v-${index}-legacy`, 'createWid', [vector.input], 'toJid', vector.jid),
            factory(`v-${index}-device`, 'createWid', [vector.input], 'getDeviceId', vector.device),
            factory(`v-${index}-log`, 'createWid', [vector.input], 'toLogString', log),
          );
        }
        representation.push(
          factory('bare-call-special', 'createWid', ['call'], 'toString', 'call'),
          factory(
            'full-agent-and-device',
            'createWid',
            ['19995550000@c.us'],
            'toString',
            '19995550000.0:0@c.us',
            [{ formatFull: true }],
          ),
          factory(
            'full-legacy',
            'createWid',
            ['19995550000:2@c.us'],
            'toString',
            '19995550000.0:2@s.whatsapp.net',
            [{ formatFull: true, legacy: true }],
          ),
          factory(
            'PN-device-from-user',
            'createDeviceWidFromUserAndDevice',
            ['19995550000', 'c.us', 2],
            'toString',
            '19995550000:2@c.us',
          ),
          factory(
            'PN-device99-hosted',
            'createDeviceWidFromUserAndDevice',
            ['19995550000', 'c.us', 99],
            'toString',
            '19995550000:99@hosted',
          ),
          factory(
            'LID-device99-hosted',
            'createDeviceWidFromUserAndDevice',
            ['12345', 'lid', 99],
            'toString',
            '12345:99@hosted.lid',
          ),
          factory('LID-user', 'createUserLidOrThrow', ['12345', 'lid'], 'toString', '12345@lid'),
          factory(
            'PN-user-device-zero',
            'createUserWidOrThrow',
            ['19995550000:0@s.whatsapp.net'],
            'toString',
            '19995550000@c.us',
          ),
          factory(
            'widlike-serialized',
            'createWidFromWidLike',
            [{ _serialized: '12345:2@lid' }],
            'toString',
            '12345:2@lid',
          ),
          clearStore('clear-before-normalized-recreate'),
          factory(
            'normalized-recreated',
            'createWid',
            ['19995550000@s.whatsapp.net'],
            'toString',
            '19995550000@c.us',
          ),
        );
        const liveLog = (id: string, enabled: boolean) =>
          factory(
            id,
            'createWid',
            ['19995550000@c.us'],
            'toLogString',
            enabled ? '0000@c.us' : '19995550000@c.us',
          );
        representation.push(
          liveLog('log-before-change', redact),
          liveLog('log-after-change', !redact),
          liveLog('log-after-restore', redact),
        );
        const representationCase = makeCase('valid-representation', gates, representation);
        representationCase.context!.gateUpdates = [
          { beforeProbe: 'log-after-change', gates: { gkx: { '26258': !redact } } },
          { beforeProbe: 'log-after-restore', gates: { gkx: { '26258': redact } } },
        ];
        cases.push(representationCase);
        const generated: Probe[] = [];
        for (let index = 0; index < 24; index++) {
          const user = `1999555${String(index).padStart(4, '0')}`;
          const device = index % 3;
          const canonical = `${user}${device ? `:${device}` : ''}@c.us`;
          generated.push(
            factory(
              `generated-${index}-canonical`,
              'createWid',
              [`${user}.0:0${device}@s.whatsapp.net`],
              'toString',
              canonical,
            ),
            factory(
              `generated-${index}-device`,
              'createWid',
              [`${user}:${device}@c.us`],
              'getDeviceId',
              device,
            ),
            factory(
              `generated-${index}-not-equal-to-plain-widlike`,
              'createWid',
              [canonical],
              'equals',
              false,
              [{ _serialized: canonical, user, server: 'c.us' }],
            ),
            factory(`generated-${index}-is-user`, 'createWid', [canonical], 'isUser', true),
          );
        }
        cases.push(makeCase('generated-valid-normalization', gates, generated));
      }
  return cases;
}
