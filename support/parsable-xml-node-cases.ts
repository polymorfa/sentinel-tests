import type { BehaviorCase, JsonValue, Probe } from './types.ts';
const absent: JsonValue = { $type: 'undefined' };
const bytes = (value: number[]): JsonValue => ({ $type: 'Uint8Array', value });
const ref = (value: string): JsonValue => ({ $type: 'reference', value });
const call = (id: string, method: string, args: JsonValue[], expected: JsonValue): Probe => ({
  id,
  method,
  args,
  expected,
});
const failure = (id: string, method: string, args: JsonValue[], reason: string): Probe => ({
  id,
  method,
  args,
  throws: { name: 'Error', message: `XmlParsingFailure: parser: expected <root> ${reason}` },
});
function plan(name: string, node: JsonValue, probes: Probe[]): BehaviorCase {
  return {
    schemaVersion: 1,
    id: `parsable-xml-node-${name}-v1`,
    version: 1,
    module: 'WAParsableXmlNode',
    export: 'ParsableXmlNode',
    construct: { args: ['parser', node] },
    probes,
  };
}
export function parsableXmlNodeCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const base = (attrs: JsonValue = {}, content: JsonValue = null): JsonValue => ({
    tag: 'root',
    attrs,
    content,
  });
  const strings = [
    '',
    'a',
    '0',
    'false',
    ' spaced ',
    'line\nbreak',
    'e\u0301',
    '👩🏽‍💻',
    '<&>"\'',
    'x'.repeat(1025),
  ];
  for (let page = 0; page < 2; page++) {
    const attrs: Record<string, JsonValue> = {},
      probes: Probe[] = [];
    for (let i = page * 5; i < (page + 1) * 5; i++) {
      attrs[`key${i}`] = strings[i]!;
      probes.push(
        call(`present-${i}`, 'hasAttr', [`key${i}`], true),
        call(`required-${i}`, 'attrString', [`key${i}`], strings[i]!),
        call(`optional-${i}`, 'maybeAttrString', [`key${i}`], strings[i]!),
      );
    }
    probes.push(
      call('name', 'name', [], 'parser'),
      call('tag', 'tag', [], 'root'),
      call('attrs-present', 'hasAttrs', [], true),
      call('keys', 'getAttrKeys', [], Object.keys(attrs)),
      call('missing', 'hasAttr', ['missing'], false),
      call('optional-missing', 'maybeAttrString', ['missing'], null),
      failure('required-missing', 'attrString', ['missing'], 'to have attribute "missing"'),
      call('valid-after-missing', 'attrString', [`key${page * 5}`], strings[page * 5]!),
      call('assert-tag', 'assertTag', ['root'], absent),
      failure('wrong-tag', 'assertTag', ['other'], 'to be <other>'),
      call('tag-retry', 'assertTag', ['root'], absent),
    );
    cases.push(plan(`attribute-strings-${page}`, base(attrs), probes));
  }
  cases.push(
    plan('empty-attributes-and-assertions', base({ good: 'ok' }), [
      call('assert-ok', 'assertAttr', ['good', 'ok'], absent),
      failure(
        'assert-wrong',
        'assertAttr',
        ['good', 'other'],
        'to have "good"="other", but instead has "ok"',
      ),
      call('assert-retry', 'assertAttr', ['good', 'ok'], absent),
      call('node', 'node', [], base({ good: 'ok' })),
      call('get-node', 'getNode', [], base({ good: 'ok' })),
      call('no-content', 'hasContent', [], false),
      call('no-children', 'hasChildren', [], false),
      call('children-null', 'getChildren', [], null),
      call('no-maybe-child', 'maybeChild', ['a'], null),
      call('no-child', 'hasChild', ['a'], false),
      failure('missing-content', 'contentString', [], 'to have content'),
      call('set-content', 'unsafeSetNodeContent', ['ready'], absent),
      call('read-content-retry', 'contentString', [], 'ready'),
      call('has-content', 'hasContent', [], true),
      call('get-mutated-node', 'getNode', [], base({ good: 'ok' }, 'ready')),
    ]),
  );
  const wrong: [string, JsonValue, string][] = [
    ['null', null, 'object'],
    ['undefined', absent, 'undefined'],
    ['number', 7, 'number'],
    ['bool', false, 'boolean'],
    ['array', [], 'object'],
    ['record', {}, 'object'],
  ];
  for (const [label, value, type] of wrong) {
    const text =
      label === 'record'
        ? '[object Object]'
        : label === 'array'
          ? ''
          : label === 'null'
            ? 'null'
            : label === 'undefined'
              ? 'undefined'
              : String(value);
    cases.push(
      plan(`attribute-nonstring-${label}`, base({ bad: value, good: 'safe' }), [
        call('present-bad', 'hasAttr', ['bad'], true),
        {
          id: 'required-error',
          method: 'attrString',
          args: ['bad'],
          throws: {
            name: 'Error',
            message: `decodeAsString: attribute is ${type} not a string: ${text}`,
          },
        },
        call('required-retry', 'attrString', ['good'], 'safe'),
        {
          id: 'optional-present-error',
          method: 'maybeAttrString',
          args: ['bad'],
          throws: {
            name: 'Error',
            message: `decodeAsString: attribute is ${type} not a string: ${text}`,
          },
        },
        call('optional-retry', 'maybeAttrString', ['good'], 'safe'),
      ]),
    );
  }
  const ints: [string, number][] = [
    ['0', 0],
    ['1', 1],
    ['-12tail', -12],
    ['17tail', 17],
    ['0x10', 0],
    ['0b11', 0],
    ['  +42rest', 42],
    ['5.9', 5],
    ['1e3', 1],
    ['005', 5],
    ['2147483648', 2147483648],
    ['9007199254740991', 9007199254740991],
  ];
  const intAttrs: Record<string, JsonValue> = {},
    intProbes: Probe[] = [];
  for (let i = 0; i < ints.length; i++) {
    const [text, value] = ints[i]!;
    intAttrs[`n${i}`] = text;
    intProbes.push(
      call(`required-${i}`, 'attrInt', [`n${i}`], value),
      call(`optional-${i}`, 'maybeAttrInt', [`n${i}`], value),
    );
  }
  intProbes.push(call('optional-missing', 'maybeAttrInt', ['missing'], null));
  cases.push(plan('decimal-prefix-integers', base(intAttrs), intProbes));
  const badInts = ['', '   ', 'word', '+', '--1', 'Infinity', '١٢'];
  const invalidAttrs: Record<string, JsonValue> = { good: '5' },
    invalidProbes: Probe[] = [];
  for (let i = 0; i < badInts.length; i++) {
    invalidAttrs[`bad${i}`] = badInts[i]!;
    invalidProbes.push(
      failure(
        `invalid-${i}`,
        'attrInt',
        [`bad${i}`],
        `to have "bad${i}"={integer} but has value "${badInts[i]}"`,
      ),
      call(`retry-${i}`, 'attrInt', ['good'], 5),
    );
  }
  cases.push(plan('invalid-integer-recovery', base(invalidAttrs), invalidProbes));
  const ranges: Record<string, JsonValue> = { good: '5' },
    rangeProbes: Probe[] = [];
  for (let value = -3; value <= 12; value++) {
    const key = `n${value + 3}`;
    ranges[key] = String(value);
    const id = `value-${value + 3}`;
    rangeProbes.push(
      value < 0
        ? failure(
            id,
            'attrInt',
            [key, 0, 10],
            `to have "${key}"={at least 0} but has value ${value}`,
          )
        : value >= 10
          ? failure(
              id,
              'attrInt',
              [key, 0, 10],
              `to have "${key}"={below 10} but has value ${value}`,
            )
          : call(id, 'attrInt', [key, 0, 10], value),
    );
    rangeProbes.push(call(`retry-${value + 3}`, 'attrInt', ['good', 0, 10], 5));
  }
  cases.push(plan('inclusive-lower-exclusive-upper', base(ranges), rangeProbes));
  const enumAttrs = { a: 'a', b: 'b', unknown: 'z', empty: '' };
  cases.push(
    plan('enum-record-and-values', base(enumAttrs), [
      call('record-a', 'attrEnum', ['a', { a: 0, b: false }], 0),
      call('record-b', 'attrEnum', ['b', { a: 0, b: false }], false),
      call('record-null-value', 'attrEnum', ['a', { a: null }], null),
      call('optional-missing', 'maybeAttrEnum', ['missing', { a: 1 }], null),
      call('unknown-null', 'attrEnumOrNullIfUnknown', ['unknown', { a: 1 }], null),
      failure(
        'unknown-error',
        'attrEnum',
        ['unknown', { a: 1, b: 2 }],
        'to have "unknown"={a|b} but has value "z"',
      ),
      call('enum-retry', 'attrEnum', ['a', { a: 1 }], 1),
      call('values-hit', 'attrEnumValues', ['a', ['a', 'a', 'b']], 'a'),
      call('values-fallback-false', 'attrEnumValues', ['unknown', ['a', 'b'], false], false),
      call('values-fallback-empty', 'attrEnumValues', ['unknown', ['a', 'b'], ''], ''),
      failure(
        'values-error',
        'attrEnumValues',
        ['unknown', ['a', 'a', 'b']],
        'to have "unknown"={a|b} but has value "z"',
      ),
      call('values-retry', 'attrEnumValues', ['b', ['a', 'b']], 'b'),
      call('empty-valid', 'attrEnum', ['empty', { '': 7 }], 7),
    ]),
  );
  for (const content of [null, '', false, 0, 'text'] as JsonValue[]) {
    const label = content === null ? 'null' : content === '' ? 'empty' : String(content);
    const p: Probe[] = [
      call('has-children', 'hasChildren', [], false),
      call('children', 'getChildren', [], null),
      call('has-content', 'hasContent', [], Boolean(content)),
    ];
    if (content === null)
      p.push(
        failure('read-error', 'contentString', [], 'to have content'),
        call('set-recovery', 'unsafeSetNodeContent', ['ok'], absent),
        call('read-retry', 'contentString', [], 'ok'),
      );
    else p.push(call('raw-content', 'contentString', [], content));
    cases.push(plan(`content-presence-${label}`, base({}, content), p));
  }
  for (const length of [1, 2, 4, 6]) {
    const probes: Probe[] = [];
    for (let sample = 0; sample < 12; sample++) {
      const data = Array.from({ length }, (_, i) => (sample * 37 + i * 53) & 255),
        value = Number(data.reduce((n, b) => n * 256n + BigInt(b), 0n));
      probes.push(
        call(`set-${sample}`, 'unsafeSetNodeContent', [bytes(data)], absent),
        call(`bytes-${sample}`, 'contentBytes', [length], bytes(data)),
        call(`uint-${sample}`, 'contentUint', [length], value),
      );
    }
    probes.push(
      failure(
        'wrong-length',
        'contentBytes',
        [length + 1],
        `to be ${length + 1} bytes, but got ${length} instead`,
      ),
      call(
        'length-retry',
        'contentBytes',
        [length],
        bytes(Array.from({ length }, (_, i) => (11 * 37 + i * 53) & 255)),
      ),
    );
    cases.push(plan(`binary-content-${length}`, base(), probes));
  }
  cases.push(
    plan('content-integers-and-enum', base({}, '17tail'), [
      call('decimal-prefix', 'contentInt', [], 17),
      call('set-range', 'unsafeSetNodeContent', ['10'], absent),
      failure(
        'exclusive-upper',
        'contentInt',
        [0, 10],
        'to have "content"={below 10} but has value 10',
      ),
      call('set-valid', 'unsafeSetNodeContent', ['9'], absent),
      call('range-retry', 'contentInt', [0, 10], 9),
      call('set-invalid', 'unsafeSetNodeContent', ['x'], absent),
      failure('invalid', 'contentInt', [], 'to have "content"={integer} but has value "x"'),
      call('enum-x', 'contentEnum', [{ x: false }], false),
      failure('enum-unknown', 'contentEnum', [{ a: 1 }], 'to have content {a} but has value "x"'),
      call('enum-retry', 'contentEnum', [{ x: 7 }], 7),
      call('clear', 'unsafeSetNodeContent', [null], absent),
      failure('cleared-error', 'contentString', [], 'to have content'),
      call('restore', 'unsafeSetNodeContent', ['3'], absent),
      call('restored', 'contentInt', [], 3),
    ]),
  );
  const childA: JsonValue = { tag: 'a', attrs: { id: 'first' }, content: 'old' },
    childB: JsonValue = { tag: 'b', attrs: {}, content: null },
    childA2: JsonValue = { tag: 'a', attrs: { id: 'second' }, content: null };
  cases.push(
    plan('cached-children-and-unsafe-state', base({}, [childA, childB, childA2]), [
      call('has-children', 'hasChildren', [], true),
      call('no-binary-content', 'hasContent', [], false),
      {
        ...call('first-child', 'child', ['a'], 'a'),
        retain: { id: 'first', stage: 'call' },
        result: { method: 'tag' },
      },
      {
        ...call('first-duplicate-id', 'child', ['a'], 'first'),
        result: { method: 'attrString', args: ['id'] },
      },
      { ...call('same-first', 'maybeChild', ['a'], true), result: { identityWith: 'first' } },
      {
        ...call('cached-array-membership', 'getChildren', [], true),
        retain: { id: 'children', stage: 'call' },
        result: { method: 'includes', args: [ref('first')] },
      },
      call('has-b', 'hasChild', ['b'], true),
      call('missing-maybe', 'maybeChild', ['none'], null),
      failure('missing-required', 'child', ['none'], 'to have child <none>'),
      { ...call('child-retry', 'child', ['a'], true), result: { identityWith: 'first' } },
      failure(
        'children-not-bytes',
        'contentBytes',
        [],
        'to have binary content, but has children instead',
      ),
      failure(
        'children-not-string',
        'contentString',
        [],
        'to have string content, but has children instead',
      ),
      {
        ...call('mutate-real-child', 'child', ['a'], absent),
        result: { method: 'unsafeSetNodeContent', args: ['changed'] },
      },
      {
        ...call('read-mutated-child', 'child', ['a'], 'changed'),
        result: { method: 'contentString' },
      },
      call('replace-raw-content', 'unsafeSetNodeContent', ['raw'], absent),
      { ...call('cache-not-rebuilt', 'child', ['a'], true), result: { identityWith: 'first' } },
      failure(
        'cache-still-blocks-string',
        'contentString',
        [],
        'to have string content, but has children instead',
      ),
      call('clear-cache', 'unsafeSetChildren', [null], absent),
      call('cache-cleared', 'hasChildren', [], false),
      call('raw-now-visible', 'contentString', [], 'raw'),
      call('restore-actual-cache', 'unsafeSetChildren', [ref('children')], absent),
      { ...call('restored-child', 'child', ['a'], true), result: { identityWith: 'first' } },
      call('replace-empty-cache', 'unsafeSetChildren', [[]], absent),
      call('empty-cache-present', 'hasChildren', [], true),
      call('empty-has-no-a', 'hasChild', ['a'], false),
      failure(
        'empty-cache-string-error',
        'contentString',
        [],
        'to have string content, but has children instead',
      ),
      call('clear-again', 'unsafeSetChildren', [null], absent),
      call('read-again', 'contentString', [], 'raw'),
    ]),
  );
  for (const count of [0, 1, 2, 7, 16, 31]) {
    const children = Array.from({ length: count }, (_, i) => ({
      tag: i % 3 === 0 ? 'a' : `n${i}`,
      attrs: { index: String(i) },
      content: null,
    }));
    const probes: Probe[] = [
      call('has-cache', 'hasChildren', [], true),
      call('has-no-content', 'hasContent', [], false),
      call('has-a', 'hasChild', ['a'], count > 0),
    ];
    if (count)
      probes.push(
        {
          ...call('first-a', 'child', ['a'], 'a'),
          retain: { id: 'first', stage: 'call' },
          result: { method: 'tag' },
        },
        {
          ...call('includes-actual', 'getChildren', [], true),
          result: { method: 'includes', args: [ref('first')] },
        },
        { ...call('repeat-identity', 'child', ['a'], true), result: { identityWith: 'first' } },
      );
    else
      probes.push(call('empty-maybe', 'maybeChild', ['a'], null), {
        ...call('empty-membership', 'getChildren', [], false),
        result: { method: 'includes', args: [null] },
      });
    cases.push(plan(`generated-child-cache-${count}`, base({}, children), probes));
  }
  return cases;
}
