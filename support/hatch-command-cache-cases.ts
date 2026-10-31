import type { BehaviorCase, JsonValue, Probe } from './types.ts';
const absent: JsonValue = { $type: 'undefined' };
const reference = (value: string): JsonValue => ({ $type: 'reference', value });
const alpha: JsonValue = [
  { name: '/alpha', description: 'Alpha command', prompt: 'Synthetic alpha prompt' },
];
const beta: JsonValue = [
  { name: 'beta', description: 'Beta command', prompt: 'Synthetic beta prompt' },
  { name: '/beta-long', description: 'Second', prompt: 'Different' },
];
const get = (id: string, key: JsonValue, expected: JsonValue): Probe => ({
  id,
  export: 'getHatchCommands',
  args: [key],
  expected,
});
const set = (id: string, key: JsonValue, value: JsonValue): Probe => ({
  id,
  export: 'setHatchCommands',
  args: [key, value],
  expected: absent,
});
function plan(name: string, probes: Probe[]): BehaviorCase {
  return {
    schemaVersion: 1,
    id: `hatch-command-cache-${name}-v1`,
    version: 1,
    module: 'WAWebHatchCommandCache',
    export: 'getHatchCommands',
    probes,
  };
}
export function hatchCommandCacheCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const keys = ['19995550101@s.whatsapp.net', '19995550102@s.whatsapp.net'];
  const commands = [alpha, beta];
  // Each base-4 digit selects one of two keys and one of two literal command arrays.
  for (let history = 0; history < 64; history++) {
    const model: JsonValue[] = [absent, absent],
      probes: Probe[] = [
        get('initial-key-0', keys[0]!, absent),
        get('initial-key-1', keys[1]!, absent),
      ];
    for (let step = 0; step < 3; step++) {
      const operation = Math.floor(history / 4 ** (2 - step)) % 4,
        key = operation >>> 1,
        value = operation & 1;
      probes.push(set(`step-${step}-op-${operation}`, keys[key]!, commands[value]!));
      model[key] = commands[value]!;
      probes.push(
        get(`step-${step}-read-0`, keys[0]!, model[0]!),
        get(`step-${step}-read-1`, keys[1]!, model[1]!),
      );
    }
    cases.push(plan(`complete-input-history-${history}`, probes));
  }
  cases.push(
    plan('initial-populate-overwrite-independent-keys', [
      get('missing-a', 'a', absent),
      get('missing-b', 'b', absent),
      set('populate-a', 'a', alpha),
      get('read-a', 'a', alpha),
      get('b-still-missing', 'b', absent),
      set('populate-b', 'b', beta),
      set('overwrite-a', 'a', beta),
      get('read-new-a', 'a', beta),
      get('read-b', 'b', beta),
      get('other-missing', 'other', absent),
    ]),
  );
  const falsy: JsonValue[] = [
    null,
    absent,
    false,
    0,
    '',
    [],
    {},
    { $type: 'number', value: 'NaN' },
  ];
  const values: Probe[] = [get('initial-undefined', 'value-key', absent)];
  for (let i = 0; i < falsy.length; i++)
    values.push(
      set(`replace-${i}`, 'value-key', falsy[i]!),
      get(`read-${i}`, 'value-key', falsy[i]!),
      get(`unrelated-${i}`, 'unrelated', absent),
    );
  cases.push(plan('nullish-falsy-generic-values', values));
  const oddKeys = ['', ' space ', 'line\nkey', 'e\u0301', '👩🏽‍💻', '<&>"\'', 'x'.repeat(4097)];
  const odd: Probe[] = [];
  for (let i = 0; i < oddKeys.length; i++) {
    const value: JsonValue = [
      { name: `/command-${i}`, description: `e\u0301🙂 ${i}`, prompt: `literal\n${i}` },
    ];
    odd.push(
      get(`missing-${i}`, oddKeys[i]!, absent),
      set(`set-${i}`, oddKeys[i]!, value),
      get(`read-${i}`, oddKeys[i]!, value),
    );
  }
  odd.push(get('similar-unwritten', 'space', absent), get('normalization-unwritten', 'é', absent));
  cases.push(plan('odd-long-string-keys', odd));
  cases.push(
    plan('natural-cached-array-identity-and-restore', [
      set('initial-set', 'key', alpha),
      { ...get('retain-original', 'key', alpha), retain: { id: 'original', stage: 'call' } },
      { ...get('repeat-original', 'key', true), result: { identityWith: 'original' } },
      set('replace', 'key', beta),
      { ...get('retain-replacement', 'key', beta), retain: { id: 'replacement', stage: 'call' } },
      { ...get('replacement-not-old', 'key', false), result: { identityWith: 'original' } },
      { ...get('replacement-repeated', 'key', true), result: { identityWith: 'replacement' } },
      set('restore-actual-old', 'key', reference('original')),
      { ...get('restored-old', 'key', true), result: { identityWith: 'original' } },
      get('restored-literal', 'key', alpha),
      get('other-key-unaffected', 'other', absent),
    ]),
  );
  const generated: Probe[] = [];
  for (let i = 0; i < 32; i++) {
    const key = `1999555${String(i).padStart(4, '0')}@s.whatsapp.net`,
      value: JsonValue = Array.from({ length: i % 5 }, (_, j) => ({
        name: `/${i}-${j}`,
        description: `e\u0301👩🏽‍💻 ${'x'.repeat(i * 7 + j)}`,
        prompt: `<&>\n${i}:${j}`,
      }));
    generated.push(set(`write-${i}`, key, value), get(`read-${i}`, key, value));
  }
  cases.push(plan('generated-command-records', generated));
  return cases;
}
