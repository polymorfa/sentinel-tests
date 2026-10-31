import type { BehaviorCase, JsonValue, Probe } from './types.ts';
export const webpMetadataBabelSha256 =
  'd87819406e3accc642307f2a1da84ff09c7541b6ee5724b1e66d86e1e77ee606';
const absent: JsonValue = { $type: 'undefined' };
export function webpMetadataDefaults(): Record<string, JsonValue> {
  return {
    isFirstParty: false,
    isFromStickerMaker: false,
    emojis: [],
    stickerPackId: null,
    stickerPackName: null,
    stickerPackPublisher: null,
    stickerPackPlayStoreLink: null,
    stickerPackAppleStoreLink: null,
    isAvatar: false,
    stickerPremiumStatus: 0,
    isAiSticker: false,
    stickerMakerSourceType: null,
    accessibilityLabel: null,
  };
}
const call = (id: string, api: string, arg: JsonValue, expected: JsonValue): Probe => ({
  id,
  export: api,
  args: [arg],
  expected,
});
export function webpMetadataCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  const add = (family: string, probes: Probe[]) => {
    let page: Probe[] = [],
      index = 0;
    const flush = () => {
      if (!page.length) return;
      cases.push({
        schemaVersion: 1,
        id: `webp-metadata-${family}-${index++}-v1`,
        version: 1,
        module: 'WAWebWebpMetadata',
        export: 'toRawWebpMetadata',
        context: { bootstrap: { 'babel-helpers': webpMetadataBabelSha256 } },
        probes: page,
      });
      page = [];
    };
    for (let i = 0; i < probes.length; i++) {
      const group = [probes[i]!];
      if (probes[i + 1]?.id === `${probes[i]!.id}-retry`) group.push(probes[++i]!);
      if (
        page.length + group.length > 64 ||
        Buffer.byteLength(JSON.stringify([...page, ...group])) > 220_000
      )
        flush();
      page.push(...group);
    }
    flush();
  };
  const flags = [
    ['isFirstParty', 'is-first-party-sticker'],
    ['isFromStickerMaker', 'is-from-sticker-maker'],
    ['isAvatar', 'is-avatar-sticker'],
    ['isAiSticker', 'is-ai-sticker'],
  ] as const;
  const model: Probe[] = [];
  for (let mask = 0; mask < 16; mask++) {
    const input: Record<string, JsonValue> = {},
      wire: Record<string, JsonValue> = {},
      expected = webpMetadataDefaults();
    for (let bit = 0; bit < 4; bit++) {
      const [name, key] = flags[bit]!,
        value = Boolean(mask & (1 << bit));
      input[name] = value;
      wire[key] = value ? 1 : 0;
      expected[name] = value;
    }
    model.push(
      call(`mask-${mask}-serialize`, 'toRawWebpMetadata', input, wire),
      call(`mask-${mask}-parse`, 'toWebpMetadata', wire, expected),
    );
  }
  add('complete-four-flag-input-model', model);
  const coercions: [string, JsonValue, number | null, boolean][] = [
    ['undefined', absent, null, false],
    ['null', null, null, false],
    ['zero', 0, 0, false],
    ['one', 1, 1, true],
    ['two', 2, 1, false],
    ['negative', -1, 1, false],
    ['false', false, 0, false],
    ['true', true, 1, false],
    ['empty', '', 0, false],
    ['string-one', '1', 1, false],
    ['string-zero', '0', 1, false],
    ['array', [], 1, false],
    ['record', {}, 1, false],
    ['nan', { $type: 'number', value: 'NaN' }, 0, false],
  ];
  const flagCoercion: Probe[] = [];
  for (const [name, key] of flags)
    for (const [label, value, encoded, decoded] of coercions) {
      flagCoercion.push(
        call(
          `${name}-${label}-serialize`,
          'toRawWebpMetadata',
          { [name]: value },
          encoded === null ? {} : { [key]: encoded },
        ),
        call(
          `${name}-${label}-parse`,
          'toWebpMetadata',
          { [key]: value },
          { ...webpMetadataDefaults(), [name]: decoded },
        ),
      );
    }
  add('flag-coercions', flagCoercion);
  const fields = [
    ['emojis', 'emojis'],
    ['stickerPackId', 'sticker-pack-id'],
    ['stickerPackName', 'sticker-pack-name'],
    ['stickerPackPublisher', 'sticker-pack-publisher'],
    ['stickerPackPlayStoreLink', 'android-app-store-link'],
    ['stickerPackAppleStoreLink', 'ios-app-store-link'],
    ['stickerMakerSourceType', 'sticker-maker-source-type'],
    ['accessibilityLabel', 'accessibility-text'],
  ] as const;
  const values: [string, JsonValue][] = [
    ['undefined', absent],
    ['null', null],
    ['empty', ''],
    ['false', false],
    ['zero', 0],
    ['one', 1],
    ['array', []],
    ['array-text', ['x', '👩🏽‍💻']],
    ['record', { odd: 'e\u0301' }],
    ['unicode', ' <&>\n👩🏽‍💻 '],
  ];
  const fieldProbes: Probe[] = [];
  for (const [name, key] of fields)
    for (const [label, value] of values) {
      const omitted = label === 'undefined' || label === 'null';
      let parsed: JsonValue = value;
      if (name === 'emojis' && !Array.isArray(value)) parsed = [];
      if (name === 'stickerMakerSourceType') parsed = label === 'one' ? 1 : null;
      const expected = webpMetadataDefaults();
      if (!omitted) expected[name] = parsed;
      fieldProbes.push(
        call(
          `${name}-${label}-serialize`,
          'toRawWebpMetadata',
          { [name]: value },
          omitted ? {} : { [key]: value },
        ),
        call(`${name}-${label}-parse`, 'toWebpMetadata', { [key]: value }, expected),
      );
    }
  add('literal-field-tables', fieldProbes);
  const enumProbes: Probe[] = [];
  for (let value = 1; value <= 6; value++)
    enumProbes.push(
      call(`member-${value}`, 'getStickerMakerSourceType', value, value),
      call(
        `member-${value}-raw`,
        'toRawWebpMetadata',
        { stickerMakerSourceType: value },
        { 'sticker-maker-source-type': value },
      ),
      call(
        `member-${value}-parse`,
        'toWebpMetadata',
        { 'sticker-maker-source-type': value },
        { ...webpMetadataDefaults(), stickerMakerSourceType: value },
      ),
    );
  const unknowns: [string, JsonValue, string | null][] = [
    ['undefined', absent, null],
    ['null', null, null],
    ['zero', 0, '0'],
    ['negative', -1, '-1'],
    ['seven', 7, '7'],
    ['fraction', 1.5, '1.5'],
    ['false', false, 'false'],
    ['true', true, 'true'],
    ['string', '1', '1'],
    ['empty', '', ''],
    ['array', [], ''],
    ['record', {}, '[object Object]'],
  ];
  for (const [label, value, text] of unknowns) {
    enumProbes.push(
      call(
        `unknown-${label}-parse`,
        'toWebpMetadata',
        { 'sticker-maker-source-type': value },
        webpMetadataDefaults(),
      ),
    );
    if (text === null)
      enumProbes.push(call(`unknown-${label}-lookup`, 'getStickerMakerSourceType', value, null));
    else {
      const id = `unknown-${label}-lookup`;
      enumProbes.push(
        {
          id,
          export: 'getStickerMakerSourceType',
          args: [value],
          throws: {
            name: 'Error',
            message: `Match: No case succesfully matched. Make exhaustive or add a wildcard case using '_'. Argument: ${text}`,
          },
        },
        call(`${id}-retry`, 'getStickerMakerSourceType', 1, 1),
      );
    }
  }
  add('source-type-enum', enumProbes);
  const premium: Probe[] = [];
  for (const [label, value] of values) {
    premium.push(
      call(
        `${label}-premium-parse`,
        'toWebpMetadata',
        { premium: value },
        { ...webpMetadataDefaults(), stickerPremiumStatus: label === 'one' ? 1 : 0 },
      ),
      call(
        `${label}-premium-not-serialized`,
        'toRawWebpMetadata',
        { stickerPremiumStatus: value },
        {},
      ),
    );
  }
  add('premium-domain', premium);
  const basics: Probe[] = [
    call('empty-serialize', 'toRawWebpMetadata', {}, {}),
    call('empty-parse', 'toWebpMetadata', {}, webpMetadataDefaults()),
    call('unknown-serialize', 'toRawWebpMetadata', { unknown: 'ignored', premium: 1 }, {}),
    call(
      'unknown-parse',
      'toWebpMetadata',
      { unknown: 'ignored', isFirstParty: true },
      webpMetadataDefaults(),
    ),
  ];
  for (const api of ['toRawWebpMetadata', 'toWebpMetadata'])
    for (const [label, value] of [
      ['null', null],
      ['undefined', absent],
    ] as const) {
      const id = `${api}-${label}`;
      basics.push(
        { id, export: api, args: [value], throws: { name: 'TypeError' } },
        call(`${id}-retry`, api, {}, api === 'toRawWebpMetadata' ? {} : webpMetadataDefaults()),
      );
    }
  for (const [label, value] of [
    ['number', 0],
    ['bool', false],
    ['string', 'abc'],
    ['array', []],
  ] as [string, JsonValue][])
    basics.push(
      call(`${label}-serialize`, 'toRawWebpMetadata', value, {}),
      call(`${label}-parse`, 'toWebpMetadata', value, webpMetadataDefaults()),
    );
  add('defaults-and-recovery', basics);
  const generated: Probe[] = [];
  for (let i = 0; i < 32; i++) {
    const text = `${i}:e\u0301\n👩🏽‍💻<&>${'x'.repeat(i * 13)}`,
      emoji = ['🙂', text],
      source = (i % 6) + 1;
    const input: JsonValue = {
      isFirstParty: i % 2 === 0,
      isFromStickerMaker: i % 3 === 0,
      isAvatar: i % 5 === 0,
      isAiSticker: i % 7 === 0,
      emojis: emoji,
      stickerPackId: `id-${i}`,
      stickerPackName: text,
      stickerPackPublisher: 'publisher',
      stickerPackPlayStoreLink: `android:${i}`,
      stickerPackAppleStoreLink: `ios:${i}`,
      stickerMakerSourceType: source,
      accessibilityLabel: text,
    };
    const raw: JsonValue = {
      'is-first-party-sticker': i % 2 === 0 ? 1 : 0,
      'is-from-sticker-maker': i % 3 === 0 ? 1 : 0,
      emojis: emoji,
      'sticker-pack-id': `id-${i}`,
      'sticker-pack-name': text,
      'sticker-pack-publisher': 'publisher',
      'android-app-store-link': `android:${i}`,
      'ios-app-store-link': `ios:${i}`,
      'is-avatar-sticker': i % 5 === 0 ? 1 : 0,
      'is-ai-sticker': i % 7 === 0 ? 1 : 0,
      'sticker-maker-source-type': source,
      'accessibility-text': text,
    };
    generated.push(
      call(`record-${i}-serialize`, 'toRawWebpMetadata', input, raw),
      call(`record-${i}-parse`, 'toWebpMetadata', raw, {
        ...(input as object),
        stickerPremiumStatus: 0,
      } as JsonValue),
    );
  }
  add('generated-unicode-records', generated);
  const original: JsonValue = {
    isFirstParty: true,
    isFromStickerMaker: false,
    emojis: ['🙂'],
    stickerPackId: 'literal',
    stickerPackName: 'name',
    stickerPackPublisher: 'publisher',
    stickerPackPlayStoreLink: 'android',
    stickerPackAppleStoreLink: 'ios',
    isAvatar: false,
    isAiSticker: true,
    stickerMakerSourceType: 6,
    accessibilityLabel: 'label',
  };
  const raw: JsonValue = {
    'is-first-party-sticker': 1,
    'is-from-sticker-maker': 0,
    emojis: ['🙂'],
    'sticker-pack-id': 'literal',
    'sticker-pack-name': 'name',
    'sticker-pack-publisher': 'publisher',
    'android-app-store-link': 'android',
    'ios-app-store-link': 'ios',
    'is-avatar-sticker': 0,
    'is-ai-sticker': 1,
    'sticker-maker-source-type': 6,
    'accessibility-text': 'label',
  };
  add('natural-returned-record-composition', [
    {
      ...call('serialize-retain', 'toRawWebpMetadata', original, raw),
      retain: { id: 'raw', stage: 'call' },
    },
    {
      ...call('parse-actual-raw', 'toWebpMetadata', { $type: 'reference', value: 'raw' }, {
        ...(original as object),
        stickerPremiumStatus: 0,
      } as JsonValue),
      retain: { id: 'parsed', stage: 'call' },
    },
    {
      ...call('serialize-distinct', 'toRawWebpMetadata', original, false),
      result: { identityWith: 'raw' },
    },
    {
      ...call('parse-distinct', 'toWebpMetadata', { $type: 'reference', value: 'raw' }, false),
      result: { identityWith: 'parsed' },
    },
  ]);
  return cases;
}
