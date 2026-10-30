import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const missingProviders = [
  'AnalyticsCoreData',
  'CookieCoreConfig',
  'CookieCoreLoggingConfig',
  'CookieDomain',
  'CurrentUserInitialData',
  'InitialCookieConsent',
  'JSErrorLoggingConfig',
  'ServerNonce',
  'ServerTimeData',
  'SiteData',
  'cr:1126',
  'cr:16728',
  'cr:21223',
  'cr:310',
  'cr:34987',
  'cr:3725',
  'cr:38444',
  'cr:4344',
  'cr:5292',
  'cr:5411',
  'cr:6640',
  'cr:8958',
];
const boundary: JsonValue = {
  $type: 'function',
  throws: { name: 'SentinelFixtureBoundaryError', message: 'Unavailable provider was invoked' },
};
const row = (configValue: JsonValue, extra: Record<string, JsonValue> = {}): JsonValue => ({
  configCode: 3042,
  configValue,
  hasAccessed: true,
  configExpoKey: null,
  ...extra,
});
const call = (id: string, exported: string, args: JsonValue[], expected: JsonValue): Probe => ({
  id,
  export: exported,
  args,
  expected,
});
const read = (id: string, expected: JsonValue, name = 'web_image_max_edge'): Probe => ({
  ...call(id, 'getABPropConfigValue', [name], expected),
  module: 'WAWebABProps',
});
const bulk = (id: string, rows: JsonValue[]) =>
  call(id, 'bulkCreateOrReplaceABPropConfigs', [rows], absent);
const clear = (id: string) => call(id, 'clearABPropConfigs', [], absent);
const init = (id: string) => call(id, 'initializeABPropsCache', [], absent);
const ready = (id: string, expected: boolean) => call(id, 'isABPropConfigsReady', [], expected);
const failedLoad = (id: string, rows: JsonValue[]): Probe => ({
  id,
  export: 'bulkCreateOrReplaceABPropConfigs',
  args: [rows],
  throws: { name: 'TypeError' },
});
const waitStart = (id: string, handle: string): Probe => ({
  ...call(id, 'waitForABPropConfigsReady', [], absent),
  pending: { id: handle, action: 'start' },
});
const inspect = (id: string, handle: string, fulfilled = false): Probe => ({
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

export function abpropsReaderCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  for (const override of [false, true])
    for (const readLog of [false, true])
      for (const awaitingExposure of [false, true]) {
        const makeCase = (name: string, probes: Probe[]): BehaviorCase => ({
          schemaVersion: 1,
          id: `abprops-reader-${name}-${override}-${readLog}-${awaitingExposure}-v1`,
          version: 1,
          module: 'WAWebABPropsCache',
          export: 'isABPropConfigsReady',
          probes,
          context: {
            babelHelpers: ['extends', 'taggedTemplateLiteralLoose'],
            gates: {
              gkx: { '16539': override, '26256': readLog },
              knobs: { '6581': awaitingExposure, '6120': false },
            },
          },
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
        });
        const lifetime = makeCase('lifetime', [
          read('before-hook-default', 1600),
          init('install-real-reader'),
          read('installed-unready-default', 1600),
          bulk('initial-load', [row(17)]),
          read('initial-value', 17),
          bulk('replace-load', [row(29)]),
          read('replacement-value', 29),
          init('repeat-initialize'),
          ready('reinitialize-keeps-ready', true),
          read('reinitialize-keeps-value', 29),
          bulk('empty-keeps-values', []),
          read('empty-load-value', 29),
          clear('clear-first-session'),
          read('same-reader-default-after-clear', 1600),
          ready('clear-is-unready', false),
          bulk('reload-without-hook-install', [row(41)]),
          read('retained-hook-fresh-cache', 41),
          bulk('load-local-override', [row(10, { overriddenConfigValue: 20 })]),
          read('initial-gate', override ? 20 : 10),
          read('changed-gate', override ? 10 : 20),
          clear('clear-under-changed-gate'),
          bulk('reload-local-override', [row(0, { overriddenConfigValue: false })]),
          read('changed-gate-survives-reset', override ? 0 : false),
          read('restored-gate', override ? false : 0),
        ]);
        lifetime.context!.gateUpdates = [
          { beforeProbe: 'changed-gate', gates: { gkx: { '16539': !override } } },
          { beforeProbe: 'restored-gate', gates: { gkx: { '16539': override } } },
        ];
        cases.push(lifetime);
        const values: JsonValue[] = [
          null,
          absent,
          0,
          false,
          '',
          -2147483648,
          4294967295,
          'odd\nvalue',
          [0, false, null],
          { nested: [0, false, null] },
        ];
        const probes: Probe[] = [init('install-reader')];
        values.forEach((value, index) =>
          probes.push(
            bulk(`value-${index}-load`, [row(value)]),
            read(`value-${index}-read`, value === null || value === absent ? 1600 : value),
          ),
        );
        for (const [name, code, defaultValue, value] of [
          ['web_design_refresh', 6665, false, true],
          ['disable_auto_download', 1838, false, true],
          ['in_app_support_v2_number_prefixes', 1031, '15517868', 'synthetic-prefix'],
        ] as const) {
          probes.push(
            clear(`key-${code}-clear`),
            read(`key-${code}-default`, defaultValue, name),
            bulk(`key-${code}-load`, [row(value, { configCode: code })]),
            read(`key-${code}-assigned`, value, name),
          );
        }
        probes.push(
          {
            id: 'missing-name-error',
            module: 'WAWebABProps',
            export: 'getABPropConfigValue',
            args: ['sentinel_missing_config'],
            throws: { name: 'TypeError' },
          },
          {
            id: 'missing-argument-error',
            module: 'WAWebABProps',
            export: 'getABPropConfigValue',
            args: [],
            throws: { name: 'TypeError' },
          },
          read('valid-read-after-errors', 'synthetic-prefix', 'in_app_support_v2_number_prefixes'),
        );
        cases.push(makeCase('values-and-errors', probes));
        cases.push(
          makeCase('pending-failed-recovery', [
            init('install-reader'),
            waitStart('start-before-ready', 'initial'),
            inspect('initial-pending', 'initial'),
            failedLoad('partial-failed-load', [row(55), null]),
            ready('failure-unready', false),
            inspect('failed-load-still-pending', 'initial'),
            read('partial-value-hidden', 1600),
            bulk('successful-empty-retry', []),
            inspect('retry-fulfilled', 'initial', true),
            wait('await-recovered', 'initial'),
            read('partial-value-now-visible', 55),
            waitStart('start-on-ready-promise', 'already-ready'),
            inspect('already-ready-fulfilled', 'already-ready', true),
            wait('await-already-ready', 'already-ready'),
            failedLoad('failed-ready-replacement', [row(77), null]),
            ready('failure-keeps-old-ready', true),
            inspect('old-wait-stays-fulfilled', 'initial', true),
            read('partial-ready-value-visible', 77),
          ]),
        );
        cases.push(
          makeCase('pending-clear-lifetime', [
            init('install-reader'),
            waitStart('start-old-wait', 'old'),
            inspect('old-pending', 'old'),
            clear('replace-readiness'),
            init('reinitialize-unready'),
            waitStart('start-fresh-wait', 'fresh'),
            inspect('old-still-pending-before-load', 'old'),
            inspect('fresh-pending', 'fresh'),
            bulk('load-fresh-session', [row(9)]),
            inspect('fresh-fulfilled', 'fresh', true),
            inspect('orphan-old-remains-pending', 'old'),
            wait('await-fresh', 'fresh'),
            read('fresh-reader-value', 9),
            clear('replace-readiness-again'),
            waitStart('start-next-wait', 'next'),
            inspect('next-pending', 'next'),
            bulk('load-next-session', [row(11)]),
            wait('await-next', 'next'),
            inspect('next-fulfilled', 'next', true),
            inspect('old-still-pending-after-two-resets', 'old'),
            inspect('prior-fulfilled-stays-fulfilled', 'fresh', true),
            read('next-reader-value', 11),
          ]),
        );
      }
  return cases;
}
