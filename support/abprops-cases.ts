import type { JsonValue, Probe } from './types.ts';

export const undefinedValue: JsonValue = { $type: 'undefined' };
const nan: JsonValue = { $type: 'number', value: 'NaN' };
const infinity: JsonValue = { $type: 'number', value: 'Infinity' };
const negativeInfinity: JsonValue = { $type: 'number', value: '-Infinity' };

// Reviewed constants, not calls to the parser (or native parseInt/parseFloat).
export const numericRows: readonly [JsonValue, JsonValue, JsonValue][] = [
  ['', nan, nan],
  [' ', nan, nan],
  ['abc', nan, nan],
  ['NaN', nan, nan],
  ['0', 0, 0],
  ['-0', 0, 0],
  ['+0', 0, 0],
  ['01', 1, 1],
  ['-01', -1, -1],
  ['42', 42, 42],
  ['  +42tail', 42, 42],
  ['-7.9', -7, -7.9],
  ['.5', nan, 0.5],
  ['-.5', nan, -0.5],
  ['1e3', 1, 1000],
  ['2E-2', 2, 0.02],
  ['1e', 1, 1],
  ['0x10', 0, 0],
  ['0b11', 0, 0],
  ['1_000', 1, 1],
  ['12,5', 12, 12],
  ['Infinity', nan, infinity],
  ['-Infinity', nan, negativeInfinity],
  ['1e309', 1, infinity],
  ['-1e309', -1, negativeInfinity],
  ['5e-324', 5, 5e-324],
  ['1e-400', 1, 0],
  ['9007199254740991', 9007199254740991, 9007199254740991],
  ['9007199254740993', 9007199254740992, 9007199254740992],
  [true, nan, nan],
  [false, nan, nan],
  [12.5, 12, 12.5],
  [-12.5, -12, -12.5],
  [[], nan, nan],
  [[12], 12, 12],
  [[12, 34], 12, 12],
  [{ value: 12 }, nan, nan],
  ['１２', nan, nan],
  ['\u00a0\t17\n', 17, 17],
  ['++1', nan, nan],
  [{ $type: 'number', value: 'Infinity' }, nan, infinity],
  [{ $type: 'number', value: 'NaN' }, nan, nan],
];

export function parserProbes(): Probe[] {
  const probes: Probe[] = [];
  const defaults: JsonValue[] = ['fallback', false, 0, null, { marker: 'fallback' }];
  const types: JsonValue[] = ['bool', 'int', 'float', 'string', 'unknown', '', 7];
  const booleanValues: JsonValue[] = [
    '1',
    'True',
    'true',
    'TRUE',
    'True ',
    ' true',
    '0',
    'false',
    '',
    1,
    0,
    true,
    false,
    [],
    ['true'],
    {},
  ];
  for (const [index, value] of booleanValues.entries())
    for (const [at, fallback] of defaults.entries())
      probes.push({
        id: `bool-${index}-default-${at}`,
        args: [value, 'bool', fallback],
        expected: index < 3,
      });
  for (const [index, [value, integer, floating]] of numericRows.entries())
    for (const [at, fallback] of defaults.entries()) {
      probes.push({
        id: `int-${index}-default-${at}`,
        args: [value, 'int', fallback],
        expected: integer,
      });
      probes.push({
        id: `float-${index}-default-${at}`,
        args: [value, 'float', fallback],
        expected: floating,
      });
    }
  for (const [index, type] of types.entries())
    for (const [at, fallback] of defaults.entries())
      for (const [nullIndex, value] of [null, undefinedValue].entries())
        probes.push({
          id: `null-value-${nullIndex}-type-${index}-default-${at}`,
          args: [value, type, fallback],
          expected: fallback,
        });
  for (const [index, value] of ['1', false, 0, '', [], { a: 1 }].entries())
    for (const [at, fallback] of defaults.entries())
      for (const [nullIndex, type] of [null, undefinedValue].entries())
        probes.push({
          id: `null-type-${nullIndex}-value-${index}-default-${at}`,
          args: [value, type, fallback],
          expected: fallback,
        });
  for (const [index, value] of ['true', '42', '', 0, false, [], { a: 1 }].entries())
    for (const [at, type] of ['string', 'unknown', '', 'BOOL', 7, false, {}].entries())
      probes.push({
        id: `identity-${index}-type-${at}`,
        args: [value, type, 'fallback'],
        expected: value,
      });
  probes.push({ id: 'missing-all', args: [], expected: undefinedValue });
  probes.push({ id: 'missing-type-and-default', args: ['true'], expected: undefinedValue });
  probes.push({ id: 'null-value-missing-default', args: [null, 'bool'], expected: undefinedValue });
  // Deterministic bounded decimal domain: 257 integers, including every odd/even value.
  for (let value = -128; value <= 128; value++)
    for (const type of ['int', 'float'])
      probes.push({
        id: `decimal-${type}-${value}`,
        args: [`  ${value}suffix`, type, 999],
        expected: value,
      });
  return probes;
}

export function exposureProbes(): Probe[] {
  return [
    { id: 'empty', args: [[]], expected: '' },
    { id: 'order', args: [['third', 'first', 'second']], expected: 'third,first,second' },
    { id: 'duplicates-preserved', args: [['a', 'a', 'b']], expected: 'a,a,b' },
    {
      id: 'coercion',
      args: [[1, true, null, undefinedValue, ['x', 'y'], {}]],
      expected: '1,true,,,x,y,[object Object]',
    },
    { id: 'delimiter-not-escaped', args: [['a,b', 'c']], expected: 'a,b,c' },
    { id: 'string-iterable', args: ['a😀b'], expected: 'a,😀,b' },
    { id: 'array-like', args: [{ 0: 'a', 2: 'c', length: 3 }], expected: 'a,,c' },
    { id: 'non-iterable-object', args: [{}], expected: '' },
    { id: 'numeric-input', args: [42], expected: '' },
    { id: 'null-input', args: [null], throws: { name: 'TypeError' } },
    { id: 'missing-input', args: [], throws: { name: 'TypeError' } },
  ];
}
