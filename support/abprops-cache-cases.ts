import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const configName = 'web_image_max_edge';
const configCode = 3042;
const defaultValue = 1600;
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
const record = (configValue: JsonValue, extra: Record<string, JsonValue> = {}): JsonValue => ({
  configCode,
  configValue,
  hasAccessed: false,
  configExpoKey: null,
  ...extra,
});
const call = (id: string, exported: string, args: JsonValue[], expected: JsonValue): Probe => ({
  id,
  export: exported,
  args,
  expected,
});
const ready = (id: string, expected: boolean) => call(id, 'isABPropConfigsReady', [], expected);
const peek = (id: string, value: JsonValue, source = 'server') =>
  call(id, 'peekABPropConfigValue', [configName], { value, source });
const bulk = (id: string, records: JsonValue[]) =>
  call(id, 'bulkCreateOrReplaceABPropConfigs', [records], absent);
const clear = (id: string) => call(id, 'clearABPropConfigs', [], absent);
const all = (id: string, records: JsonValue[]) => call(id, 'getAllABPropConfigs', [], records);
const failure = (id: string, args: JsonValue[]): Probe => ({
  id,
  export: 'bulkCreateOrReplaceABPropConfigs',
  args,
  throws: { name: 'TypeError' },
});
const makeCase = (id: string, enabled: boolean, probes: Probe[]): BehaviorCase => ({
  schemaVersion: 1,
  id: `abprops-cache-${id}-${enabled}-v1`,
  version: 1,
  module: 'WAWebABPropsCache',
  export: 'isABPropConfigsReady',
  probes,
  context: {
    babelHelpers: ['extends', 'taggedTemplateLiteralLoose'],
    gates: { gkx: { '16539': enabled }, knobs: { '6581': false, '6120': false } },
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

/** Real original cache and readiness state, with external storage/worker effects excluded. */
export function abpropsCacheCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  for (const enabled of [false, true]) {
    cases.push(
      makeCase('lifetime', enabled, [
        ready('initial-not-ready', false),
        peek('initial-default', defaultValue, 'default'),
        call('initialize-reader-hook', 'initializeABPropsCache', [], absent),
        ready('hook-does-not-resolve', false),
        bulk('first-load', [record(17)]),
        ready('loaded', true),
        call('resolved-wait', 'waitForABPropConfigsReady', [], absent),
        peek('first-server', 17),
        bulk('replace-same-code', [record(29)]),
        peek('replacement-visible', 29),
        all('one-record-after-replacement', [record(29)]),
        bulk('empty-load', []),
        ready('empty-load-keeps-ready', true),
        peek('empty-load-keeps-value', 29),
        clear('logout-clear'),
        ready('logout-not-ready', false),
        all('logout-no-records', []),
        peek('logout-default', defaultValue, 'default'),
        call('reinitialize-reader-hook', 'initializeABPropsCache', [], absent),
        ready('reinitialize-still-not-ready', false),
        bulk('new-session', [record(41)]),
        ready('new-session-ready', true),
        call('new-resolved-wait', 'waitForABPropConfigsReady', [], absent),
        peek('new-session-value', 41),
        clear('final-clear'),
        ready('final-not-ready', false),
      ]),
    );
    cases.push(
      makeCase('partial-failed-initial-load', enabled, [
        failure('invalid-input-null', [null]),
        ready('still-unready-after-null', false),
        failure('invalid-input-record', [{}]),
        ready('still-unready-after-object', false),
        failure('first-row-installed-before-bad-row', [[record(55), null]]),
        all('partial-record-retained', [record(55)]),
        ready('failure-did-not-resolve', false),
        peek('partial-record-hidden-before-ready', defaultValue, 'default'),
        bulk('successful-empty-recovery', []),
        ready('recovery-resolves', true),
        peek('partial-record-exposed-after-recovery', 55),
        clear('clear-partial-record'),
        all('no-record-after-clear', []),
      ]),
    );
    cases.push(
      makeCase('partial-failed-ready-load', enabled, [
        bulk('initial-good', [record(5)]),
        failure('replacement-installed-before-bad-row', [[record(66), null]]),
        ready('old-readiness-retained', true),
        peek('partial-replacement-visible', 66),
        all('one-partial-replacement', [record(66)]),
        bulk('duplicate-records-last-wins', [record(1), record(2), record(3)]),
        peek('last-duplicate-value', 3),
        all('last-duplicate-record-only', [record(3)]),
        clear('reset-after-failure'),
        ready('reset-unready', false),
        bulk('recover-after-reset', [record(7)]),
        peek('recovered-value', 7),
      ]),
    );
    cases.push(
      makeCase('override-presence-and-code-identity', enabled, [
        bulk('server-zero-override-false', [record(0, { overriddenConfigValue: false })]),
        peek(
          'false-override-is-present',
          enabled ? false : 0,
          enabled ? 'local_override' : 'server',
        ),
        bulk('server-false-override-zero', [record(false, { overriddenConfigValue: 0 })]),
        peek(
          'zero-override-is-present',
          enabled ? 0 : false,
          enabled ? 'local_override' : 'server',
        ),
        bulk('server-empty-override-null', [record('', { overriddenConfigValue: null })]),
        peek('null-override-falls-through', ''),
        bulk('server-null', [record(null)]),
        peek('null-server-falls-back', defaultValue, 'default'),
        bulk('string-code-distinct-map-key', [record(77, { configCode: String(configCode) })]),
        peek('string-code-does-not-replace-number', defaultValue, 'default'),
        all('distinct-string-and-number-codes', [
          record(null),
          record(77, { configCode: String(configCode) }),
        ]),
        bulk('unknown-code-retained', [record(88, { configCode: 987654321 })]),
        all('unknown-code-not-filtered-by-cache', [
          record(null),
          record(77, { configCode: String(configCode) }),
          record(88, { configCode: 987654321 }),
        ]),
        clear('clear-unvalidated-records'),
        all('all-records-cleared', []),
      ]),
    );
    const transition = makeCase('live-local-override-gate', enabled, [
      bulk('load-local-override', [record(10, { overriddenConfigValue: 20 })]),
      peek('initial-assignment', enabled ? 20 : 10, enabled ? 'local_override' : 'server'),
      peek('changed-assignment', enabled ? 10 : 20, enabled ? 'server' : 'local_override'),
      clear('clear-with-changed-assignment'),
      ready('changed-assignment-unready', false),
      bulk('reload-under-changed-assignment', [record(0, { overriddenConfigValue: false })]),
      peek(
        'changed-assignment-retained-after-clear',
        enabled ? 0 : false,
        enabled ? 'server' : 'local_override',
      ),
      peek('restored-assignment', enabled ? false : 0, enabled ? 'local_override' : 'server'),
    ]);
    transition.context!.gateUpdates = [
      { beforeProbe: 'changed-assignment', gates: { gkx: { '16539': !enabled } } },
      { beforeProbe: 'restored-assignment', gates: { gkx: { '16539': enabled } } },
    ];
    cases.push(transition);
    // 64 complete clear/load/peek transitions per assignment, partitioned below the128-probe cap.
    const values: JsonValue[] = [
      0,
      false,
      '',
      null,
      -2147483648,
      4294967295,
      'odd\nvalue',
      { nested: [0, false, null] },
    ];
    for (let page = 0; page < 4; page++) {
      const probes: Probe[] = [];
      for (let index = page * 16; index < (page + 1) * 16; index++) {
        const value = values[index % values.length]!;
        probes.push(
          clear(`round-${index}-clear`),
          ready(`round-${index}-unready`, false),
          bulk(`round-${index}-load`, [record(value)]),
          ready(`round-${index}-ready`, true),
          peek(`round-${index}-peek`, value ?? defaultValue, value === null ? 'default' : 'server'),
        );
      }
      cases.push(makeCase(`generated-restarts-${page}`, enabled, probes));
    }
  }
  return cases;
}
