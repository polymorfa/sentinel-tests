import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const absent: JsonValue = { $type: 'undefined' };
const ref = (value: string): JsonValue => ({ $type: 'reference', value });
const call = (
  id: string,
  method: string,
  args: JsonValue[],
  expected: JsonValue = absent,
): Probe => ({ id, args: [], result: { method, args }, expected });
const initialized = (id: string, key: JsonValue, expected: boolean) =>
  call(id, 'getChannelInitialized', [key], expected);
const busy = (id: string, key: JsonValue, expected: JsonValue) =>
  call(id, 'isSinkBusy', [key], expected);
const init = (id: string, key: JsonValue) => call(id, 'setChannelInitialized', [key]);
const setBusy = (id: string, key: JsonValue, value: JsonValue) =>
  call(id, 'setSinkBusy', [key, value]);
const close = (id: string): Probe => ({
  id,
  export: 'closeChannelManager',
  args: [],
  expected: absent,
});
const identity = (id: string): Probe => ({
  id,
  args: [],
  result: { identityWith: 'manager' },
  expected: true,
});
const retain = (id: string): Probe => ({
  ...initialized(id, 'never-seen', false),
  retain: { id: 'manager', stage: 'call' },
});
const make = (name: string, probes: Probe[]): BehaviorCase => ({
  schemaVersion: 1,
  id: `wam-channel-state-${name}-v1`,
  version: 1,
  module: 'WAWamChannelManager',
  export: 'getChannelManager',
  probes,
});

/** State of the original singleton and its independent maps, not channel/sink implementations. */
export function wamChannelStateCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  cases.push(
    make('close-before-create-and-resume', [
      close('close-before-first-get'),
      retain('capture-manager'),
      identity('same-initial-singleton'),
      init('initialize-a', 'a'),
      setBusy('busy-a', 'a', true),
      close('close-active'),
      initialized('closed-init', 'a', false),
      busy('closed-busy', 'a', false),
      identity('close-keeps-singleton'),
      close('close-again'),
      identity('repeated-close-keeps-singleton'),
      init('resume-initialization', 'a'),
      initialized('resumed-init', 'a', true),
      busy('resume-does-not-set-busy', 'a', false),
      setBusy('resume-busy', 'a', true),
      initialized('init-survives-busy', 'a', true),
      busy('resumed-busy', 'a', true),
    ]),
  );
  const isolation: Probe[] = [];
  for (let key = 0; key < 8; key++) {
    isolation.push(
      initialized(`initial-init-${key}`, `channel-${key}`, false),
      busy(`initial-busy-${key}`, `channel-${key}`, false),
    );
    isolation.push(
      key % 2 === 0
        ? init(`initialize-${key}`, `channel-${key}`)
        : setBusy(`busy-${key}`, `channel-${key}`, true),
    );
  }
  for (let key = 0; key < 8; key++)
    isolation.push(
      initialized(`final-init-${key}`, `channel-${key}`, key % 2 === 0),
      busy(`final-busy-${key}`, `channel-${key}`, key % 2 !== 0),
    );
  isolation.push(close('close-all'));
  for (let key = 0; key < 8; key++)
    isolation.push(
      initialized(`closed-init-${key}`, `channel-${key}`, false),
      busy(`closed-busy-${key}`, `channel-${key}`, false),
    );
  cases.push(make('independent-maps-per-key', isolation));
  const nan: JsonValue = { $type: 'number', value: 'NaN' };
  const keys: JsonValue[] = [
    0,
    1,
    '1',
    false,
    true,
    null,
    absent,
    nan,
    'NaN',
    '',
    'odd\0key',
    '🌍\nchannel',
  ];
  const primitive: Probe[] = [];
  keys.forEach((key, n) =>
    primitive.push(
      setBusy(`set-${n}`, key, 100 + n),
      ...(n % 2 === 0 ? [init(`initialize-${n}`, key)] : []),
    ),
  );
  keys.forEach((key, n) =>
    primitive.push(
      busy(`distinct-value-${n}`, key, 100 + n),
      initialized(`distinct-init-${n}`, key, n % 2 === 0),
    ),
  );
  primitive.push(
    busy('fresh-nan-value-same-key', { $type: 'number', value: 'NaN' }, 107),
    close('close-primitives'),
  );
  keys.forEach((key, n) =>
    primitive.push(busy(`closed-${n}`, key, false), initialized(`closed-init-${n}`, key, false)),
  );
  cases.push(make('primitive-key-samevaluezero', primitive));
  const values: [JsonValue, JsonValue][] = [
    [false, false],
    [null, false],
    [absent, false],
    [0, false],
    [nan, false],
    ['', false],
    [{ $type: 'BigInt', value: '0' }, false],
    [true, true],
    [1, 1],
    [-1, -1],
    ['false', 'false'],
    [[], []],
    [{ value: 0 }, { value: 0 }],
    [
      { $type: 'BigInt', value: '1' },
      { $type: 'BigInt', value: '1' },
    ],
    [
      { $type: 'number', value: 'Infinity' },
      { $type: 'number', value: 'Infinity' },
    ],
  ];
  const truthiness: Probe[] = [init('initialize-value-key', 'value')];
  values.forEach(([value, expected], n) =>
    truthiness.push(setBusy(`store-${n}`, 'value', value), busy(`read-${n}`, 'value', expected)),
  );
  truthiness.push(
    initialized('busy-values-do-not-change-init', 'value', true),
    close('close-truthy-value'),
    busy('close-clears-truthy', 'value', false),
  );
  cases.push(make('busy-value-truthiness-characterization', truthiness));
  cases.push(
    make('manager-object-key', [
      retain('capture-manager'),
      init('initialize-manager-key', ref('manager')),
      initialized('manager-key-init', ref('manager'), true),
      busy('manager-key-busy-default', ref('manager'), false),
      setBusy('manager-key-busy', ref('manager'), 'self-key'),
      busy('manager-key-value', ref('manager'), 'self-key'),
      busy('string-not-manager-key', '[object Object]', false),
      identity('key-operation-keeps-singleton'),
      call('direct-original-close', 'close', []),
      initialized('own-close-resets-init', ref('manager'), false),
      busy('own-close-resets-busy', ref('manager'), false),
      identity('own-close-keeps-singleton'),
      init('resume-self-key', ref('manager')),
      close('export-close'),
      initialized('export-close-resets-self', ref('manager'), false),
      identity('export-close-keeps-singleton'),
    ]),
  );
  for (const page of [0, 1]) {
    // Independent ordered records model; no model code is supplied to the worker.
    const state: { key: string; initialized: boolean; busy: JsonValue }[] = [];
    const probes: Probe[] = [];
    const stateFor = (key: string) => {
      let entry = state.find((entry) => entry.key === key);
      if (!entry) {
        entry = { key, initialized: false, busy: false };
        state.push(entry);
      }
      return entry;
    };
    for (let step = 0; step < 18; step++) {
      const key = `generated-${(step * 5 + page) % 7}`,
        neighbor = `generated-${(step * 5 + page + 1) % 7}`,
        entry = stateFor(key);
      const action = (step + page) % 6;
      if (action === 0 || action === 5) {
        entry.initialized = true;
        probes.push(init(`step-${step}-init`, key));
      } else if (action === 4) {
        for (const item of state) {
          item.initialized = false;
          item.busy = false;
        }
        probes.push(close(`step-${step}-close`));
      } else {
        entry.busy = action === 1 ? true : action === 2 ? false : `busy-${step}`;
        probes.push(setBusy(`step-${step}-set`, key, entry.busy));
      }
      for (const [which, observed] of [
        ['key', key],
        ['neighbor', neighbor],
      ] as const) {
        const expected = stateFor(observed);
        probes.push(
          initialized(`step-${step}-${which}-init`, observed, expected.initialized),
          busy(`step-${step}-${which}-busy`, observed, expected.busy),
        );
      }
    }
    cases.push(make(`generated-close-resume-${page}`, probes));
  }
  return cases;
}
