import type { BehaviorCase, JsonValue, Probe } from './types.ts';

export const widOriginalBabelSha256 =
  'd87819406e3accc642307f2a1da84ff09c7541b6ee5724b1e66d86e1e77ee606';
const absent: JsonValue = { $type: 'undefined' };
const factory = 'WAWebWidFactory';
const ref = (value: string): JsonValue => ({ $type: 'reference', value });
const create = (id: string, value: string, expected: string, retain?: string): Probe => ({
  id,
  export: 'createWid',
  args: [value],
  result: { method: 'toString' },
  ...(retain ? { retain: { id: retain, stage: 'call' as const } } : {}),
  expected,
});
const same = (id: string, value: string, retained: string, expected: boolean): Probe => ({
  id,
  export: 'createWid',
  args: [value],
  result: { identityWith: retained },
  expected,
});
const invalid = (id: string, input: string): Probe => ({
  id,
  export: 'createWid',
  args: [input],
  throws: { name: 'InvalidWidError', message: 'wid error: invalid wid' },
});
const clear = (id: string): Probe => ({
  id,
  module: 'WAWebWidStore',
  export: 'delete',
  args: [],
  expected: absent,
});

/** Original Error inheritance and invalid-string cache lifetimes; no logger/parser substitutes. */
export function widOriginalErrorsCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const messages: JsonValue[] = [
    '',
    'synthetic invalid wid',
    'line\nnext\tcolumn',
    'nul\0message',
    '失敗-🌍',
    'x'.repeat(1024),
    'odd'.repeat(2731),
    absent,
    null,
    17,
  ];
  messages.forEach((message, index) => {
    const text = message === absent ? '' : String(message);
    cases.push({
      schemaVersion: 1,
      id: `wid-original-error-constructor-${index}-v1`,
      version: 1,
      module: 'WAWebWidError',
      export: 'InvalidWidError',
      construct: { args: [message] },
      context: { bootstrap: { 'babel-helpers': widOriginalBabelSha256 } },
      probes: [
        {
          id: 'native-error-string',
          method: 'toString',
          args: [],
          expected: text === '' ? 'InvalidWidError' : `InvalidWidError: ${text}`,
        },
      ],
    });
  });
  const bad = [
    'abc@c.us',
    '@c.us',
    '12345:100@c.us',
    '12345.1@c.us',
    '-1@lid',
    'abc@g.us',
    '12345:1@newsletter',
    '12345:98@hosted',
  ];
  for (let bits = 0; bits < 8; bits++) {
    const context: NonNullable<BehaviorCase['context']> = {
      bootstrap: { 'babel-helpers': widOriginalBabelSha256 },
      gates: { gkx: { '16539': !!(bits & 1), '26256': !!(bits & 2), '26258': !!(bits & 4) } },
    };
    const probes: Probe[] = [
      create('seed-canonical', '19995550000@c.us', '19995550000@c.us', 'before'),
      create('seed-other', '19995550001@c.us', '19995550001@c.us', 'other'),
    ];
    bad.forEach((input, n) =>
      probes.push(
        {
          id: `validator-rejects-${n}`,
          module: 'WAWebWidValidator',
          export: 'validateAndGetParts',
          args: [input],
          expected: null,
        },
        invalid(`invalid-${n}`, input),
        same(`canonical-survives-${n}`, '19995550000@c.us', 'before', true),
        same(`other-survives-${n}`, '19995550001@c.us', 'other', true),
      ),
    );
    probes.push(
      {
        id: 'real-log-format-gate',
        export: 'createWid',
        args: ['19995550000@c.us'],
        result: { method: 'toLogString' },
        expected: bits & 4 ? '0000@c.us' : '19995550000@c.us',
      },
      same('legacy-alias-same-cache', '19995550000@s.whatsapp.net', 'before', true),
      {
        id: 'equal-before-clear',
        export: 'createWid',
        args: ['19995550000@c.us'],
        result: { method: 'equals', args: [ref('before')] },
        expected: true,
      },
      clear('clear-cache'),
      same('clear-replaces-identity', '19995550000@c.us', 'before', false),
      create('capture-fresh', '19995550000@c.us', '19995550000@c.us', 'fresh'),
      {
        id: 'equal-value-across-clear',
        export: 'createWid',
        args: ['19995550000@c.us'],
        result: { method: 'equals', args: [ref('before')] },
        expected: true,
      },
      invalid('retry-invalid-after-clear', 'still-not-a-jid'),
      same('fresh-survives-failure', '19995550000@c.us', 'fresh', true),
      same('other-also-replaced', '19995550001@c.us', 'other', false),
      clear('clear-again'),
      same('second-clear-replaces', '19995550000@c.us', 'fresh', false),
      create('valid-retry', '19995550002@c.us', '19995550002@c.us', 'retry'),
      invalid('repeat-invalid', 'abc@c.us'),
      same('retry-kept', '19995550002@c.us', 'retry', true),
    );
    cases.push({
      schemaVersion: 1,
      id: `wid-original-error-cache-lifetime-${bits}-v1`,
      version: 1,
      module: factory,
      export: 'createWid',
      context,
      stubs: [{ module: 'cr:6640', exports: null }],
      probes,
    });
  }
  return cases;
}
