import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const cache = 'WAWebGroupABPropsCache',
  updater = 'WAWebGroupABPropsUpdateFromStorage';
const group = 'synthetic-input-a@g.us',
  other = 'synthetic-input-b@g.us';
const bool = 'group_history_send_group_level',
  integer = 'group_history_messages_time_limit_secs_group_level';
const row = (code: JsonValue, value: JsonValue, override: JsonValue = null): JsonValue => ({
  configCode: code,
  configValue: value,
  overriddenConfigValue: override,
  hasAccessed: true,
  configExpoKey: null,
});
const call = (
  id: string,
  exported: string,
  args: JsonValue[],
  expected: JsonValue,
  module = cache,
): Probe => ({ id, module, export: exported, args, expected });
const init = (id: string) => call(id, 'initializeGroupABPropsCache', [], absent);
const clear = (id: string) => call(id, 'clearGroupABPropConfigs', [], absent);
const update = (id: string, rows: JsonValue, key = group) =>
  call(id, 'updateSingleGroupABPropsCache', [key, rows], absent, updater);
const read = (id: string, name: string, expected: JsonValue, key = group) =>
  call(id, 'getGroupABPropConfigValue', [key, name], expected, 'WAWebGroupABProps');
const all = (id: string, expected: JsonValue, key = group) =>
  call(id, 'getAllGroupABPropConfigsForGroup', [key], expected);
const fails = (probe: Probe): Probe => {
  const { expected: _, ...rest } = probe;
  return { ...rest, throws: { name: 'TypeError' } };
};

/** Storage-shaped synthetic inputs to the original exported transformer; no storage acquisition. */
export function groupABPropsStorageInputCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  for (const enabled of [false, true]) {
    const make = (name: string, probes: Probe[]) =>
      cases.push({
        schemaVersion: 1,
        id: `group-abprops-storage-input-${name}-${enabled}-v1`,
        version: 1,
        module: updater,
        export: 'updateSingleGroupABPropsCache',
        probes,
        context: {
          babelHelpers: ['extends', 'taggedTemplateLiteralLoose'],
          gates: {
            gkx: {
              '10314': false,
              '16539': enabled,
              '207': false,
              '26256': false,
              '26258': false,
              '26259': false,
              '27164': false,
              '3981': false,
              '4112': false,
            },
            knobs: { '1600': false, '195': false, '1964': false, '5257': false, '5333': false },
          },
        },
        stubs: ['JSErrorLoggingConfig', 'SiteData', 'cr:38444', 'cr:5292', 'cr:6640'].map(
          (module) => ({
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
          }),
        ),
      });
    // Literal expectations distinguish the string parser from truthiness/coercion.
    const booleanInputs: [JsonValue, boolean][] = [
      ['1', true],
      ['True', true],
      ['true', true],
      ['TRUE', false],
      ['  true', false],
      ['false', false],
      ['', false],
      [1, false],
      [true, false],
      [null, false],
      [absent, false],
      [['true'], false],
    ];
    const booleans: Probe[] = [init('install-reader')];
    booleanInputs.forEach(([input, value], n) =>
      booleans.push(
        update(`load-${n}`, [row('23245', input)]),
        all(`record-${n}`, [row(23245, value)]),
        read(`read-${n}`, bool, value),
      ),
    );
    make('boolean-literals', booleans);

    const nan: JsonValue = { $type: 'number', value: 'NaN' };
    const integerInputs: [JsonValue, JsonValue][] = [
      ['17tail', 17],
      ['  -17suffix', -17],
      ['+29', 29],
      ['0x10', 0],
      ['1e3', 1],
      ['3.75', 3],
      ['2147483648', 2147483648],
      ['-2147483649', -2147483649],
      ['', nan],
      ['bad', nan],
      [null, 1209600],
      [absent, 1209600],
      [17, 17],
      [['23'], 23],
    ];
    const integers: Probe[] = [init('install-reader')];
    integerInputs.forEach(([input, value], n) =>
      integers.push(
        update(`load-${n}`, [row('26270', input)]),
        all(`record-${n}`, [row(26270, value)]),
        read(`read-${n}`, integer, value),
      ),
    );
    make('integer-literals', integers);

    const overrides: [JsonValue, JsonValue, JsonValue, JsonValue][] = [
      ['false', 'true', false, true],
      ['true', '0', true, false],
      [null, 'True', false, true],
      ['true', null, true, true],
      ['true', absent, true, true],
    ];
    const overrideProbes: Probe[] = [init('install-reader')];
    overrides.forEach(([base, override, parsed, effective], n) => {
      const overrideValue = override === null || override === absent ? null : effective;
      overrideProbes.push(
        update(`load-${n}`, [row(23245, base, override)]),
        all(`record-${n}`, [row(23245, parsed, overrideValue)]),
        read(`read-${n}`, bool, enabled ? effective : parsed),
      );
    });
    overrideProbes.push(
      update('integer-override', [row(26270, '-17tail', '29tail')]),
      read('integer-override-read', integer, enabled ? 29 : -17),
    );
    make('parsed-nullish-overrides', overrideProbes);

    make('code-coercion-duplicates', [
      init('install-reader'),
      update('mixed-codes', [
        row(' 23245 ', 'false'),
        row('0x5acd', 'true'),
        row(['26270'], '31tail'),
        row('999999', { invalidForKnownInt: true }),
        { configValue: 'unused' },
        row(null, 'unused'),
        row([], 'unused'),
      ]),
      all('known-records-only', [row(23245, true), row(26270, 31)]),
      read('last-duplicate', bool, true),
      read('array-code-coercion', integer, 31),
      update('replace-preserves-order', [
        row('26270.0', '41'),
        row(23245, 'false'),
        row('23245', 'true'),
      ]),
      all('same-key-order', [row(23245, true), row(26270, 41)]),
      update('unknown-only-no-merge', [row('not-a-code', null), row({}, 'unused')]),
      all('unknown-only-keeps-records', [row(23245, true), row(26270, 41)]),
    ]);

    const staging: Probe[] = [
      init('install-reader'),
      update('seed', [row(23245, 'true'), row(26270, '17')]),
    ];
    const invalid: JsonValue[] = [
      [row(23245, 'false'), null],
      [row(26270, '99'), absent],
      null,
      17,
      { length: 0 },
    ];
    invalid.forEach((input, n) =>
      staging.push(
        fails(update(`invalid-${n}`, input)),
        all(`prior-records-${n}`, [row(23245, true), row(26270, 17)]),
        read(`prior-reader-${n}`, bool, true),
      ),
    );
    staging.push(
      update('successful-retry', [row(23245, 'false')]),
      read('retry-value', bool, false),
      read('retry-merges-int', integer, 17),
    );
    make('staging-failure-preserves-prior', staging);

    make('direct-prefix-setup-shared-readiness', [
      init('install-reader'),
      fails(
        call(
          'direct-cache-hidden-prefix-setup',
          'bulkCreateOrReplaceGroupABPropConfigs',
          [group, [row(23245, true), null]],
          absent,
        ),
      ),
      all('setup-prefix-retained', [row(23245, true)]),
      read('setup-prefix-hidden', bool, false),
      fails(update('staged-failure-no-replacement', [row(23245, 'false'), null, row(26270, '99')])),
      all('staging-left-setup-prefix', [row(23245, true)]),
      read('still-unready', bool, false),
      all('no-tail-applied', [row(23245, true)]),
      update('empty-other-group-resolves', [], other),
      read('shared-readiness-reveals-prefix', bool, true),
      all('empty-other-group-records', [], other),
      clear('clear-all'),
      init('reinitialize-retained-hook'),
      fails(
        call(
          'second-direct-prefix-setup',
          'bulkCreateOrReplaceGroupABPropConfigs',
          [other, [row(26270, 43), null]],
          absent,
        ),
      ),
      read('other-prefix-hidden', integer, 1209600, other),
      update('unknown-only-resolves', [row('999999', 'unused')]),
      read('other-prefix-now-visible', integer, 43, other),
      read('cleared-first-default', bool, false),
    ]);

    make('two-group-clear-reinitialize', [
      init('install-reader'),
      update('group-a', [row(23245, 'true'), row(26270, '17')]),
      update('group-b', [row(23245, 'false'), row(26270, '29')], other),
      read('a-bool', bool, true),
      read('b-bool', bool, false, other),
      read('a-int', integer, 17),
      read('b-int', integer, 29, other),
      init('repeat-initialize'),
      fails(update('b-fails-before-merge', [row(26270, '71'), null], other)),
      read('b-prior-kept', integer, 29, other),
      read('a-unchanged', integer, 17),
      clear('clear-both'),
      all('a-empty', []),
      all('b-empty', [], other),
      read('a-default-after-clear', integer, 1209600),
      read('b-default-after-clear', integer, 1209600, other),
      update('reload-b-with-retained-hook', [row(26270, '53')], other),
      read('b-reloaded', integer, 53, other),
      read('a-still-default', integer, 1209600),
      update('a-empty-retry', []),
      read('b-kept-after-empty-a', integer, 53, other),
    ]);
  }
  return cases;
}
