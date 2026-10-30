import type { BehaviorCase, JsonValue, Probe } from './types.ts';

export const originalBabelSha256 =
  'd87819406e3accc642307f2a1da84ff09c7541b6ee5724b1e66d86e1e77ee606';
const absent: JsonValue = { $type: 'undefined' };
const eventModule = 'WAWebAboutCreationWamEvent';
const method = (
  id: string,
  name: string,
  args: JsonValue[],
  expected: JsonValue = absent,
): Probe => ({ id, method: name, args, expected });
const get = (id: string, field: string, value: JsonValue) => method(id, 'getValue', [field], value);
const set = (id: string, values: Record<string, JsonValue>) => method(id, 'set', [values]);
const failure = (probe: Probe, message: string): Probe => {
  const { expected: _, ...rest } = probe;
  return { ...rest, throws: { name: 'TypeError', message } };
};
const validatorFailure = (id: string, condition: string) =>
  failure(
    method(id, 'runPreCommitValidation', []),
    `AboutCreation event validator failed condition ${condition}`,
  );
const clock = (offset: number) => new Date(Date.UTC(2020, 0, 1) + offset).toISOString();

/** Original event state and validation only; no commit, queue or transport calls. */
export function wamEventStateCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  for (const first of [false, true])
    for (const second of [false, true])
      for (const falco of [false, true]) {
        const make = (
          name: string,
          probes: Probe[],
          args: JsonValue[] = [],
          module = eventModule,
          exported = 'AboutCreationWamEvent',
        ) => {
          const testCase: BehaviorCase = {
            schemaVersion: 1,
            id: `wam-event-state-${name}-${first}-${second}-${falco}-v1`,
            version: 1,
            module,
            export: exported,
            construct: { args },
            context: {
              bootstrap: { 'babel-helpers': originalBabelSha256 },
              clock: clock(0),
              gates: { gkx: { '26258': first, '26259': second }, knobs: { '1600': falco } },
            },
            stubs: [{ module: 'cr:6640', exports: null }],
            probes,
          };
          cases.push(testCase);
          return testCase;
        };
        make('fields-failed-prefix-retry', [
          get('initial-absent', 'aboutDuration', absent),
          set('set-valid-fields', {
            aboutDuration: 3,
            aboutLength: 4,
            aboutLocale: 'synthetic-🌍',
            aboutPresetSelected: false,
            aboutRequestType: 2,
          }),
          get('duration', 'aboutDuration', 3),
          get('locale', 'aboutLocale', 'synthetic-🌍'),
          get('boolean', 'aboutPresetSelected', false),
          failure(
            set('failed-second-field', {
              aboutDuration: 17,
              aboutLength: 2.5,
              aboutLocale: 'must-not-apply',
            }),
            'AboutCreation.aboutLength type-validator failed',
          ),
          get('prefix-kept', 'aboutDuration', 17),
          get('invalid-kept-prior', 'aboutLength', 4),
          get('tail-not-applied', 'aboutLocale', 'synthetic-🌍'),
          set('retry', { aboutLength: 29, aboutLocale: '' }),
          get('retry-length', 'aboutLength', 29),
          get('empty-string', 'aboutLocale', ''),
          failure(
            set('wrong-boolean', { aboutPresetSelected: 1 }),
            'AboutCreation.aboutPresetSelected requires type boolean, got 1',
          ),
          get('boolean-kept', 'aboutPresetSelected', false),
          set('nullish-fields', { aboutDuration: null, aboutLength: absent, aboutLocale: null }),
          get('null-number', 'aboutDuration', null),
          get('undefined-number', 'aboutLength', absent),
          get('null-string', 'aboutLocale', null),
          set('unknown-field-assignment', { sentinelUnknown: 7 }),
          get('unknown-is-not-schema-all', 'sentinelUnknown', absent),
        ]);
        const numeric: JsonValue[] = [
          0,
          -1,
          2147483648,
          9007199254740992,
          { $type: 'number', value: 'Infinity' },
          { $type: 'number', value: '-Infinity' },
        ];
        const numberProbes: Probe[] = [];
        numeric.forEach((value, n) =>
          numberProbes.push(
            set(`integer-${n}`, { aboutDuration: value }),
            get(`read-${n}`, 'aboutDuration', value),
          ),
        );
        numberProbes.push(
          failure(
            set('nan-rejected', { aboutDuration: { $type: 'number', value: 'NaN' } }),
            'AboutCreation.aboutDuration type-validator failed',
          ),
          failure(
            set('fraction-rejected', { aboutDuration: -0.5 }),
            'AboutCreation.aboutDuration type-validator failed',
          ),
        );
        make('integer-source-domain', numberProbes);
        const enums: Probe[] = [];
        for (const [field, values] of [
          ['aboutEntrypoint', [1, 2, 3, 4, 5, 6]],
          ['aboutRequestType', [1, 2, 3]],
          ['aboutSaveOutcome', [1, 2, 3, 4]],
          ['preset', Array.from({ length: 15 }, (_, n) => n + 1)],
          [
            'aboutPrompt',
            [
              ...Array.from({ length: 28 }, (_, n) => n + 1),
              ...Array.from({ length: 8 }, (_, n) => n + 30),
            ],
          ],
        ] as [string, number[]][]) {
          for (const value of values) enums.push(set(`${field}-${value}`, { [field]: value }));
          enums.push(get(`${field}-final`, field, values.at(-1)!));
        }
        enums.push(
          failure(
            set('enum-missing-29', { aboutPrompt: 29 }),
            'AboutCreation.aboutPrompt type-validator failed',
          ),
          get('enum-failure-keeps-prior', 'aboutPrompt', 37),
        );
        make('all-declared-enum-values', enums);
        make('precommit-conditions', [
          validatorFailure('empty-event-duration-fails', 'about_duration >= 0'),
          set('duration-only', { aboutDuration: 0 }),
          validatorFailure('missing-length-fails', 'about_length >= 0'),
          set('valid-update', { aboutLength: 0, aboutRequestType: 2 }),
          method('update-valid', 'runPreCommitValidation', []),
          set('create-empty', { aboutRequestType: 1 }),
          validatorFailure('create-needs-positive-length', 'about_length > 0'),
          set('create-nonempty', { aboutLength: 1 }),
          method('create-valid', 'runPreCommitValidation', []),
          set('clear-nonempty', { aboutRequestType: 3 }),
          validatorFailure('clear-needs-zero-length', 'about_length == 0'),
          set('clear-empty', { aboutLength: 0 }),
          method('clear-valid', 'runPreCommitValidation', []),
          set('negative-duration', { aboutDuration: -1 }),
          validatorFailure('negative-duration-fails', 'about_duration >= 0'),
          set('negative-length', { aboutDuration: 0, aboutLength: -1, aboutRequestType: 2 }),
          validatorFailure('negative-length-fails', 'about_length >= 0'),
          set('nullish-numeric-comparison', {
            aboutDuration: null,
            aboutLength: null,
            aboutRequestType: null,
          }),
          method('null-coercion-characterization', 'runPreCommitValidation', []),
        ]);
        make('falco-metadata', [
          method('event-name', 'getEventNameForFalco', [], falco ? 'wam_about_creation' : absent),
          method('known-field', 'hasFalcoField', ['aboutDuration'], falco),
          method('unknown-field', 'hasFalcoField', ['sentinelUnknown'], false),
          method('set-falco-known', 'setFalcoField', ['aboutDuration', 31]),
          get('conditional-falco-set', 'aboutDuration', falco ? 31 : absent),
          set('set-enum-and-null', { aboutRequestType: 2, aboutLocale: null }),
          method(
            'enum-name',
            'resolveEnumValue',
            ['aboutRequestType', 2],
            falco ? 'update_existing' : 2,
          ),
          method('enum-unrecognized-number', 'resolveEnumValue', ['aboutRequestType', 99], 99),
          method(
            'enum-nonnumeric',
            'resolveEnumValue',
            ['aboutRequestType', 'synthetic'],
            'synthetic',
          ),
          method(
            'field-map',
            'getFieldsMapForFalco',
            [],
            falco ? { about_duration: 31, about_request_type: 2 } : null,
          ),
        ]);
        const timers = make('timer-checkpoints', [
          method('mark-constructor-fallback', 'markAboutOverallT', []),
          get('constructor-duration', 'aboutOverallT', 100),
          method('zero-set-before-marker', 'setTime', [0]),
          method('mark-zero-fallback', 'markAboutOverallT', []),
          get('zero-time-uses-current-clock', 'aboutOverallT', 150),
          method('explicit-set-before-marker', 'setTime', [Date.UTC(2020, 0, 1) - 50]),
          method('mark-explicit-time', 'markAboutOverallT', []),
          get('explicit-time-fallback', 'aboutOverallT', 500),
          method('start', 'startAboutOverallT', []),
          method('mark-started', 'markAboutOverallT', []),
          get('started-duration', 'aboutOverallT', 200),
          method('mark-again', 'markAboutOverallT', []),
          get('marker-is-retained', 'aboutOverallT', 400),
          method('zero-set-time', 'setTime', [0]),
          method('mark-after-set-time', 'markAboutOverallT', []),
          get('start-marker-wins', 'aboutOverallT', 600),
          method('mark-backwards', 'markAboutOverallT', []),
          get('negative-timer-characterization', 'aboutOverallT', -100),
        ]);
        const clockUpdates = [
          { beforeProbe: 'mark-constructor-fallback', clock: clock(100) },
          { beforeProbe: 'zero-set-before-marker', clock: clock(200) },
          { beforeProbe: 'mark-zero-fallback', clock: clock(350) },
          { beforeProbe: 'explicit-set-before-marker', clock: clock(400) },
          { beforeProbe: 'mark-explicit-time', clock: clock(450) },
          { beforeProbe: 'start', clock: clock(500) },
          { beforeProbe: 'mark-started', clock: clock(700) },
          { beforeProbe: 'mark-again', clock: clock(900) },
          { beforeProbe: 'zero-set-time', clock: clock(1000) },
          { beforeProbe: 'mark-after-set-time', clock: clock(1100) },
          { beforeProbe: 'mark-backwards', clock: clock(400) },
        ];
        for (const update of clockUpdates)
          timers.probes.find((probe) => probe.id === update.beforeProbe)!.clock = update.clock;
        make(
          'metric-definition-cache',
          [
            {
              id: 'define-integer',
              method: 'define',
              args: [{ eventName: 'Synthetic', fieldName: 'count', id: 1, type: 'integer' }],
              retain: { id: 'metric', stage: 'call' },
              result: { method: 'validator', args: [3] },
              expected: true,
            },
            {
              id: 'same-key-preserves-metric',
              method: 'define',
              args: [{ eventName: 'Synthetic', fieldName: 'count', id: 99, type: 'string' }],
              result: { identityWith: 'metric' },
              expected: true,
            },
            {
              id: 'get-same-metric',
              method: 'getEvent',
              args: ['Synthetic', 'count'],
              result: { identityWith: 'metric' },
              expected: true,
            },
            {
              id: 'integer-rejects-fraction',
              method: 'getEvent',
              args: ['Synthetic', 'count'],
              result: { method: 'validator', args: [3.5] },
              expected: false,
            },
            {
              id: 'integer-infinity-characterization',
              method: 'getEvent',
              args: ['Synthetic', 'count'],
              result: { method: 'validator', args: [{ $type: 'number', value: 'Infinity' }] },
              expected: true,
            },
            {
              id: 'timer-validator',
              method: 'define',
              args: [{ eventName: 'Synthetic', fieldName: 'timer', id: 2, type: 'timer' }],
              result: { method: 'validator', args: [-3] },
              expected: true,
            },
            method('initial-global-absent', 'hasGlobal', ['count'], false),
            {
              id: 'define-global',
              method: 'defineGlobal',
              args: ['count', 1, 'integer', ['regular']],
              retain: { id: 'global', stage: 'call' },
              result: { method: 'validator', args: [7] },
              expected: true,
            },
            method('global-present', 'hasGlobal', ['count'], true),
            {
              id: 'global-get-identity',
              method: 'getGlobal',
              args: ['count'],
              result: { identityWith: 'global' },
              expected: true,
            },
          ],
          [],
          'WAWebWamCodegenGlobalMetrics',
          'Metrics',
        );
      }
  return cases;
}
