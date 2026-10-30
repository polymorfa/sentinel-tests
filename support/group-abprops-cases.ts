import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const cache = 'WAWebGroupABPropsCache';
const reader = 'WAWebGroupABProps';
const boolName = 'group_history_send_group_level',
  boolCode = 23245;
const intName = 'group_history_messages_time_limit_secs_group_level',
  intCode = 26270;
const ref = (value: string): JsonValue => ({ $type: 'reference', value });
const row = (configCode: number, configValue: JsonValue, override?: JsonValue): JsonValue => ({
  configCode,
  configValue,
  hasAccessed: true,
  configExpoKey: null,
  ...(override === undefined ? {} : { overriddenConfigValue: override }),
});
const call = (id: string, exported: string, args: JsonValue[], expected: JsonValue): Probe => ({
  id,
  export: exported,
  args,
  expected,
});
const init = (id: string) => call(id, 'initializeGroupABPropsCache', [], absent);
const clear = (id: string) => call(id, 'clearGroupABPropConfigs', [], absent);
const bulk = (id: string, group: string, records: JsonValue) =>
  call(id, 'bulkCreateOrReplaceGroupABPropConfigs', [group, records], absent);
const all = (id: string, group: string, expected: JsonValue) =>
  call(id, 'getAllGroupABPropConfigsForGroup', [group], expected);
const read = (id: string, group: string, name: string, expected: JsonValue): Probe => ({
  ...call(id, 'getGroupABPropConfigValue', [group, name], expected),
  module: reader,
});
const failure = (id: string, group: string, records: JsonValue): Probe => ({
  id,
  export: 'bulkCreateOrReplaceGroupABPropConfigs',
  args: [group, records],
  throws: { name: 'TypeError' },
});
const make = (id: string, enabled: boolean, probes: Probe[]): BehaviorCase => ({
  schemaVersion: 1,
  id: `group-abprops-${id}-${enabled}-v1`,
  version: 1,
  module: cache,
  export: 'getAllGroupABPropConfigsForGroup',
  probes,
  context: {
    babelHelpers: ['extends', 'taggedTemplateLiteralLoose'],
    gates: { gkx: { '16539': enabled }, knobs: { '1600': false, '1964': false, '5257': false } },
  },
  stubs: ['SiteData', 'cr:5292', 'cr:6640'].map((module) => ({
    module,
    exports:
      module === 'cr:6640'
        ? null
        : {
            $type: 'function',
            throws: {
              name: 'SentinelFixtureBoundaryError',
              message: 'Unavailable provider was invoked',
            },
          },
  })),
});

// Exact declared defaults at both source pins. Group reader uses index2, not index3.
const defaults: [string, number][] = [
  ['ai_group_tee_history_share_group_level_enabled', 0],
  ['group_history_messages_time_limit_secs_group_level', 1209600],
  ['group_history_out_of_window_pin_sender_group_level', 0],
  ['group_history_send_admin_set_default_on_group_level', 0],
  ['group_history_send_after_join_group_level', 0],
  ['group_history_send_group_level', 0],
  ['group_history_setting_decouple_enabled_group_level', 0],
  ['group_history_settings_toggle_ui_group_level', 0],
  ['group_settings_ia_group_level', -1],
  ['pinned_messages_infinite_sender_group_level_enabled', 0],
  ['pinned_messages_remove_30_day_pins_group_level', 0],
  ['poll_add_option_creator_enabled_group_level', 0],
  ['poll_add_option_enabled_group_level', 0],
  ['poll_creator_edit_enabled_group_level', 0],
  ['poll_end_time_enabled_group_level', 0],
  ['poll_hide_voters_enabled_group_level', 0],
  ['rt_ghs_sender_group_level_enabled', 0],
  ['wa_web_channels_comet_video_player_enabled', 0],
  ['web_test_use_case_client_group', 0],
];
const defaultValue = (name: string, value: number): JsonValue =>
  name === intName || name === 'group_settings_ia_group_level' ? value : false;

/** Independent named-record list model for one finite sequence, not an injected resolver. */
function generated(enabled: boolean, page: number): BehaviorCase {
  type Entry = { code: number; value: JsonValue; override?: JsonValue };
  let groups: { id: string; rows: Entry[] }[] = [];
  let installed = false,
    ready = false,
    gate = enabled;
  const probes: Probe[] = [],
    updates: NonNullable<NonNullable<BehaviorCase['context']>['gateUpdates']> = [];
  const names = ['synthetic-a@g.us', 'synthetic-b@g.us', 'synthetic-c@g.us'];
  const state = (id: string) => {
    let group = groups.find((group) => group.id === id);
    if (!group) {
      group = { id, rows: [] };
      groups.push(group);
    }
    return group;
  };
  const merge = (id: string, entry: Entry) => {
    const group = state(id),
      index = group.rows.findIndex((other) => other.code === entry.code);
    if (index < 0) group.rows.push(entry);
    else group.rows[index] = entry;
  };
  const expected = (id: string, code: number, fallback: JsonValue): JsonValue => {
    if (!installed || !ready) return fallback;
    const entry = groups
      .find((group) => group.id === id)
      ?.rows.find((entry) => entry.code === code);
    return entry
      ? gate && entry.override !== undefined && entry.override !== null
        ? entry.override
        : entry.value
      : fallback;
  };
  const observe = (prefix: string) => {
    for (let group = 0; group < names.length; group++)
      probes.push(
        read(
          `${prefix}-bool-${group}`,
          names[group]!,
          boolName,
          expected(names[group]!, boolCode, false),
        ),
        read(
          `${prefix}-int-${group}`,
          names[group]!,
          intName,
          expected(names[group]!, intCode, 1209600),
        ),
      );
  };
  observe('initial');
  for (let round = 0; round < 12; round++) {
    const group = names[(round * 2 + page) % names.length]!,
      action = (round + page) % 6;
    if (action === 0) {
      installed = true;
      probes.push(init(`r-${round}-initialize`));
    } else if (action === 1) {
      const boolean: Entry = { code: boolCode, value: round % 2 === 0, override: round % 2 !== 0 },
        integer: Entry = { code: intCode, value: round * 7 - page };
      merge(group, boolean);
      merge(group, integer);
      ready = true;
      probes.push(
        bulk(`r-${round}-merge`, group, [
          row(boolean.code, boolean.value, boolean.override),
          row(integer.code, integer.value),
        ]),
      );
    } else if (action === 2) {
      state(group);
      ready = true;
      probes.push(bulk(`r-${round}-empty-success`, group, []));
    } else if (action === 3) {
      const entry: Entry = { code: boolCode, value: round % 2 === 0, override: round % 2 !== 0 };
      merge(group, entry);
      probes.push(
        failure(`r-${round}-partial-failure`, group, [
          row(entry.code, entry.value, entry.override),
          null,
        ]),
      );
    } else if (action === 4) {
      groups = [];
      ready = false;
      probes.push(clear(`r-${round}-clear`));
    } else {
      gate = !gate;
      const beforeProbe = `r-${round}-gate-change`;
      updates.push({ beforeProbe, gates: { gkx: { '16539': gate } } });
      probes.push(
        all(
          beforeProbe,
          group,
          groups
            .find((entry) => entry.id === group)
            ?.rows.map((entry) => row(entry.code, entry.value, entry.override)) || [],
        ),
      );
    }
    observe(`r-${round}`);
  }
  const testCase = make(`generated-global-readiness-page-${page}`, enabled, probes);
  testCase.context!.gateUpdates = updates;
  return testCase;
}

export function groupABPropsCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  for (const enabled of [false, true]) {
    const a = 'synthetic-a@g.us',
      b = 'synthetic-b@g.us',
      c = 'synthetic-c@g.us';
    const boolean = row(boolCode, true),
      integer = row(intCode, 17);
    cases.push(
      make('failed-first-group-exposed-by-other-empty-success', enabled, [
        read('before-hook-default', a, boolName, false),
        init('install-original-reader'),
        failure('first-group-partially-mutates-before-throw', a, [boolean, null, integer]),
        all('partial-row-retained-but-not-ready', a, [boolean]),
        read('partial-row-hidden-before-any-success', a, boolName, false),
        read('second-group-default', b, boolName, false),
        bulk('other-group-empty-success-resolves-global-readiness', b, []),
        read('failed-group-row-now-visible', a, boolName, true),
        read('failed-unreached-int-stays-default', a, intName, 1209600),
        read('successful-empty-group-stays-default', b, boolName, false),
        all('other-group-has-no-records', b, []),
      ]),
    );
    cases.push(
      make('bulk-before-install-reinit-and-clear-keeps-hook', enabled, [
        bulk('load-before-install', a, [boolean]),
        read('uninstalled-hook-keeps-default', a, boolName, false),
        init('install'),
        read('loaded-row-visible', a, boolName, true),
        init('reinitialize-does-not-clear'),
        read('reinit-retains-row', a, boolName, true),
        clear('clear-records-and-readiness'),
        all('records-cleared', a, []),
        read('not-ready-default', a, boolName, false),
        failure('partial-after-clear', a, [integer, null]),
        read('new-partial-row-hidden', a, intName, 1209600),
        bulk('other-empty-success', b, []),
        read('clear-retained-hook-needs-no-reinstall', a, intName, 17),
        bulk('merge-after-recovery', a, [boolean]),
        read('both-records-live', a, boolName, true),
      ]),
    );
    cases.push(
      make('cross-group-duplicates-and-empty-merge', enabled, [
        init('install'),
        bulk('first-two-codes', a, [boolean, integer]),
        bulk('second-group-same-code-different-value', b, [row(boolCode, false)]),
        read('first-group-isolated', a, boolName, true),
        read('second-group-isolated', b, boolName, false),
        bulk('duplicate-codes-last-value-wins', a, [
          row(boolCode, false),
          row(boolCode, true),
          row(boolCode, false),
        ]),
        all('duplicate-replacement-keeps-first-insertion-order', a, [
          row(boolCode, false),
          integer,
        ]),
        bulk('empty-is-merge-not-clear', a, []),
        all('empty-retains-both-rows', a, [row(boolCode, false), integer]),
        read('other-group-int-default', b, intName, 1209600),
        bulk('integer-zero-and-negative', a, [row(intCode, 0), row(35639, -7)]),
        read('zero-is-a-server-value', a, intName, 0),
        read('negative-integer-read', a, 'group_settings_ia_group_level', -7),
      ]),
    );
    cases.push(
      make('failed-updates-do-not-revoke-ready-state', enabled, [
        init('install'),
        bulk('make-ready', a, [row(boolCode, false), integer]),
        failure('partial-replacement-on-ready-group', a, [boolean, null, row(intCode, 99)]),
        read('first-write-visible-despite-throw', a, boolName, true),
        read('unreached-write-not-applied', a, intName, 17),
        failure('different-group-fails-partially', b, [row(intCode, -5), null]),
        read('global-ready-exposes-failed-other-group', b, intName, -5),
        failure('noniterable-still-creates-empty-map', c, null),
        all('created-group-no-records', c, []),
        read('created-group-reader-falls-back', c, intName, 1209600),
        clear('clear-readiness'),
        read('old-group-hidden-after-clear', b, intName, 1209600),
      ]),
    );
    cases.push(
      make('retained-snapshot-arrays-share-records-not-container', enabled, [
        init('install'),
        bulk('seed-records', a, [boolean, integer]),
        {
          ...all('retain-first-array', a, [boolean, integer]),
          retain: { id: 'rows', stage: 'call' },
        },
        {
          ...all('retain-actual-first-record', a, boolean),
          result: { method: 'at', args: [0] },
          retain: { id: 'record', stage: 'result' },
        },
        {
          ...all('fresh-array-shares-record', a, true),
          result: { method: 'includes', args: [ref('record')] },
        },
        { ...all('fresh-array-container-distinct', a, false), result: { identityWith: 'rows' } },
        bulk('replace-first-record', a, [row(boolCode, false)]),
        {
          ...all('replacement-is-not-old-record', a, false),
          result: { method: 'includes', args: [ref('record')] },
        },
        bulk('reuse-old-array-in-another-group', b, ref('rows')),
        read('old-record-value-outlives-replacement', b, boolName, true),
        {
          ...all('other-group-has-original-record-identity', b, true),
          result: { method: 'includes', args: [ref('record')] },
        },
        clear('clear-all-groups'),
        bulk('reuse-array-after-clear-without-reinstall', c, ref('rows')),
        read('old-record-restores-value-after-clear', c, boolName, true),
        {
          ...all('clear-does-not-destroy-retained-record', c, true),
          result: { method: 'includes', args: [ref('record')] },
        },
        {
          ...all('mutate-only-new-snapshot-array', c, integer),
          result: { method: 'pop' },
          retain: { id: 'popped', stage: 'result' },
        },
        all('array-pop-does-not-remove-cache-row', c, [boolean, integer]),
        {
          ...all('popped-record-still-in-cache', c, true),
          result: { method: 'includes', args: [ref('popped')] },
        },
      ]),
    );
    const nullish: Probe[] = [init('install')];
    for (const [index, value] of [false, 0, '', null, absent, true, 17, -1].entries()) {
      nullish.push(
        bulk(`value-${index}`, a, [row(boolCode, value)]),
        read(`read-${index}`, a, boolName, value === null || value === absent ? false : value),
      );
    }
    cases.push(make('raw-values-and-nullish-defaults', enabled, nullish));
    const defaultProbes = defaults.map(([name, value], index) =>
      read(`uninstalled-${index}`, a, name, defaultValue(name, value)),
    );
    defaultProbes.push(init('install'), bulk('empty-ready', a, []));
    defaults.forEach(([name, value], index) =>
      defaultProbes.push(read(`ready-missing-${index}`, a, name, defaultValue(name, value))),
    );
    cases.push(make('all-source-declared-defaults', enabled, defaultProbes));
    const overrides: Probe[] = [
      init('install'),
      bulk('server-and-local', a, [row(boolCode, true, false), row(intCode, 17, 0)]),
      read('initial-bool', a, boolName, enabled ? false : true),
      read('initial-int', a, intName, enabled ? 0 : 17),
      read('changed-bool', a, boolName, enabled ? true : false),
      read('changed-int', a, intName, enabled ? 17 : 0),
      read('restored-bool', a, boolName, enabled ? false : true),
      read('restored-int', a, intName, enabled ? 0 : 17),
    ];
    const transition = make('local-override-rereads-current-gate', enabled, overrides);
    transition.context!.gateUpdates = [
      { beforeProbe: 'changed-bool', gates: { gkx: { '16539': !enabled } } },
      { beforeProbe: 'restored-bool', gates: { gkx: { '16539': enabled } } },
    ];
    cases.push(transition);
    for (let page = 0; page < 3; page++) cases.push(generated(enabled, page));
  }
  const keys = ['10314', '16539', '26256', '26258', '26259', '4112'];
  for (let assignment = 0; assignment < 64; assignment++) {
    const gkx = Object.fromEntries(
      keys.map((key, index) => [key, Math.floor(assignment / 2 ** index) % 2 === 1]),
    );
    const a = 'cartesian-a@g.us',
      b = 'cartesian-b@g.us';
    const enabled = gkx['16539']!;
    const testCase = make(`boolean-cartesian-transition-${assignment}`, enabled, [
      read('before-install-default', a, boolName, false),
      init('install'),
      failure('first-prefix-fails-before-ready', a, [row(boolCode, true), null]),
      all('prefix-retained', a, [row(boolCode, true)]),
      read('not-ready-default', a, boolName, false),
      bulk('other-group-empty-success', b, []),
      read('global-readiness-exposes-prefix', a, boolName, true),
      bulk('install-server-and-local-records', a, [
        row(boolCode, true, false),
        row(intCode, 17, 0),
      ]),
      read('selected-bool-branch', a, boolName, enabled ? false : true),
      init('reinitialize-does-not-reset'),
      read('selected-int-branch-after-reinit', a, intName, enabled ? 0 : 17),
      clear('clear-keeps-hook'),
      failure('retry-prefix-fails-after-clear', a, [row(intCode, 31), null]),
      read('retry-hidden-until-success', a, intName, 1209600),
      bulk('empty-success-reopens-global-readiness', b, []),
      read('retained-hook-exposes-retry', a, intName, 31),
      bulk('replace-with-local-zero', a, [row(intCode, 31, 0)]),
      read('selected-local-zero-or-server', a, intName, enabled ? 0 : 31),
      bulk('duplicate-codes-last-wins', a, [row(boolCode, true), row(boolCode, false)]),
      all('record-order-after-retry-and-merge', a, [row(intCode, 31, 0), row(boolCode, false)]),
      read('last-duplicate-value', a, boolName, false),
    ]);
    testCase.context!.gates!.gkx = gkx;
    cases.push(testCase);
  }
  return cases;
}
