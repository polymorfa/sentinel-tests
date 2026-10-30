import type { BehaviorCase, JsonValue, Probe } from './types.ts';

export const customErrorBabelSha256 =
  'd87819406e3accc642307f2a1da84ff09c7541b6ee5724b1e66d86e1e77ee606';
const absent: JsonValue = { $type: 'undefined' };
const ref = (value: string): JsonValue => ({ $type: 'reference', value });
const text = (name: string, message: string) => (message === '' ? name : `${name}: ${message}`);
const construct = (
  id: string,
  exported: string,
  args: JsonValue[],
  expected: string,
  retained?: string,
): Probe => ({
  id,
  export: exported,
  construct: true,
  args,
  result: { method: 'toString' },
  expected,
  ...(retained ? { retain: { id: retained, stage: 'call' as const } } : {}),
});
const fail = (id: string, args: JsonValue[]): Probe => ({
  id,
  export: 'AggregateError',
  construct: true,
  args,
  throws: { name: 'TypeError' },
});
const make = (name: string, probes: Probe[], exported = 'CustomError'): BehaviorCase => ({
  schemaVersion: 1,
  id: `custom-error-state-${name}-v1`,
  version: 1,
  module: 'WACustomError',
  export: exported,
  context: { bootstrap: { 'babel-helpers': customErrorBabelSha256 } },
  probes,
});

/** Genuine original constructors and composed error references; no formatter/error substitutes. */
export function customErrorStateCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  for (const [exported, args, expected] of [
    ['CustomError', [], 'Error'],
    ['TimeoutError', [], 'TimeoutError: TimeoutError'],
    ['UnimplementedMethod', [], 'UnimplementedMethod: UnimplementedMethod'],
    ['AggregateError', [[]], 'AggregateError: No errors'],
  ] as [string, JsonValue[], string][])
    cases.push({
      ...make(
        `direct-default-${exported}`,
        [{ id: 'inherited-native-to-string', method: 'toString', args: [], expected }],
        exported,
      ),
      construct: { args },
    });
  const messages: [JsonValue, string, string, string][] = [
    ['', '', '', ''],
    ['synthetic message', 'synthetic message', 'synthetic message', 'synthetic message'],
    ['line\nnext\0end', 'line\nnext\0end', 'line\nnext\0end', 'line\nnext\0end'],
    ['失敗-🌍', '失敗-🌍', '失敗-🌍', '失敗-🌍'],
    ['x'.repeat(1025), 'x'.repeat(1025), 'x'.repeat(1025), 'x'.repeat(1025)],
    [null, 'null', 'TimeoutError', 'UnimplementedMethod'],
    [absent, '', 'TimeoutError', 'UnimplementedMethod'],
    [17, '17', '17', '17'],
    [{ $type: 'BigInt', value: '0' }, '0', '0', '0'],
  ];
  const probes: Probe[] = [];
  messages.forEach(([value, custom, timeout, unimplemented], n) =>
    probes.push(
      construct(`custom-${n}`, 'CustomError', [value], text('Error', custom)),
      construct(`timeout-${n}`, 'TimeoutError', [value], text('TimeoutError', timeout)),
      construct(
        `unimplemented-${n}`,
        'UnimplementedMethod',
        [value],
        text('UnimplementedMethod', unimplemented),
      ),
    ),
  );
  cases.push(make('constructor-message-characterization', probes));
  cases.push(
    make('aggregate-order-duplicates-and-identity', [
      construct('custom-alpha', 'CustomError', ['alpha'], 'Error: alpha', 'alpha'),
      construct('timeout-default', 'TimeoutError', [], 'TimeoutError: TimeoutError', 'timeout'),
      construct(
        'single-original-error',
        'AggregateError',
        [[ref('alpha')]],
        'AggregateError: alpha',
        'single',
      ),
      construct(
        'forward-order',
        'AggregateError',
        [[ref('alpha'), ref('timeout')]],
        'AggregateError: - alpha\n- TimeoutError',
        'forward',
      ),
      construct(
        'reverse-order',
        'AggregateError',
        [[ref('timeout'), ref('alpha')]],
        'AggregateError: - TimeoutError\n- alpha',
      ),
      construct(
        'duplicate-real-reference',
        'AggregateError',
        [[ref('alpha'), ref('alpha')]],
        'AggregateError: - alpha\n- alpha',
      ),
      {
        id: 'fresh-construction-distinct-identity',
        export: 'CustomError',
        construct: true,
        args: ['alpha'],
        result: { identityWith: 'alpha' },
        expected: false,
      },
      construct(
        'old-original-still-readable',
        'AggregateError',
        [[ref('alpha')]],
        'AggregateError: alpha',
      ),
    ]),
  );
  cases.push(
    make('nested-original-aggregates', [
      construct('custom', 'CustomError', ['alpha'], 'Error: alpha', 'alpha'),
      construct('timeout', 'TimeoutError', [], 'TimeoutError: TimeoutError', 'timeout'),
      construct(
        'unimplemented',
        'UnimplementedMethod',
        ['feature'],
        'UnimplementedMethod: feature',
        'feature',
      ),
      construct(
        'inner',
        'AggregateError',
        [[ref('alpha'), ref('timeout')]],
        'AggregateError: - alpha\n- TimeoutError',
        'inner',
      ),
      construct(
        'single-nested',
        'AggregateError',
        [[ref('inner')]],
        'AggregateError: - alpha\n- TimeoutError',
        'single-nested',
      ),
      construct(
        'nested-with-real-leaf',
        'AggregateError',
        [[ref('inner'), ref('feature')]],
        'AggregateError: - - alpha\n- TimeoutError\n- feature',
        'outer',
      ),
      construct(
        'third-level',
        'AggregateError',
        [[ref('outer')]],
        'AggregateError: - - alpha\n- TimeoutError\n- feature',
      ),
      construct(
        'explicit-outer-message',
        'AggregateError',
        [[ref('outer')], 'explicit outer'],
        'AggregateError: explicit outer',
      ),
    ]),
  );
  cases.push(
    make('nullish-real-error-messages', [
      construct('undefined-error', 'CustomError', [absent], 'Error', 'undefined'),
      construct('null-error', 'CustomError', [null], 'Error: null', 'null'),
      construct('empty-error', 'TimeoutError', [''], 'TimeoutError', 'empty'),
      construct('one-undefined', 'AggregateError', [[ref('undefined')]], 'AggregateError'),
      construct('one-null', 'AggregateError', [[ref('null')]], 'AggregateError: null'),
      construct('one-empty', 'AggregateError', [[ref('empty')]], 'AggregateError'),
      construct(
        'joined-nullish',
        'AggregateError',
        [[ref('undefined'), ref('null'), ref('empty')]],
        'AggregateError: - undefined\n- null\n- ',
      ),
    ]),
  );
  cases.push(
    make('explicit-message-selection', [
      construct('seed', 'CustomError', ['leaf'], 'Error: leaf', 'leaf'),
      construct('explicit', 'AggregateError', [[ref('leaf')], 'chosen'], 'AggregateError: chosen'),
      construct('empty-falls-back', 'AggregateError', [[ref('leaf')], ''], 'AggregateError: leaf'),
      construct('null-falls-back', 'AggregateError', [[ref('leaf')], null], 'AggregateError: leaf'),
      construct(
        'undefined-falls-back',
        'AggregateError',
        [[ref('leaf')], absent],
        'AggregateError: leaf',
      ),
      construct(
        'numeric-has-no-length',
        'AggregateError',
        [[ref('leaf')], 17],
        'AggregateError: leaf',
      ),
      construct(
        'empty-array-message-falls-back',
        'AggregateError',
        [[ref('leaf')], []],
        'AggregateError: leaf',
      ),
      construct(
        'array-message-coercion-characterization',
        'AggregateError',
        [[], ['explicit']],
        'AggregateError: explicit',
      ),
      construct(
        'explicit-skips-null-array-format',
        'AggregateError',
        [null, 'chosen'],
        'AggregateError: chosen',
      ),
      construct(
        'explicit-skips-null-leaf-format',
        'AggregateError',
        [[null], 'chosen'],
        'AggregateError: chosen',
      ),
      construct(
        'empty-errors-empty-message',
        'AggregateError',
        [[], ''],
        'AggregateError: No errors',
      ),
    ]),
  );
  cases.push(
    make('failed-construction-and-retained-retry', [
      construct('retained-before-failures', 'CustomError', ['before'], 'Error: before', 'before'),
      fail('null-error-array', [null]),
      fail('undefined-error-array', [absent]),
      fail('non-array-without-map', [{}]),
      fail('null-leaf', [[null]]),
      fail('real-prefix-then-null', [[ref('before'), null]]),
      construct(
        'old-error-after-failure',
        'AggregateError',
        [[ref('before')]],
        'AggregateError: before',
      ),
      construct(
        'new-error-after-failure',
        'TimeoutError',
        ['after'],
        'TimeoutError: after',
        'after',
      ),
      construct(
        'valid-retry-real-errors',
        'AggregateError',
        [[ref('before'), ref('after')]],
        'AggregateError: - before\n- after',
      ),
    ]),
  );
  return cases;
}
