import type { BehaviorCase, JsonValue, Probe } from './types.ts';

const suites: BehaviorCase[] = [];
const value = (id: string, args: JsonValue[], expected: JsonValue): Probe => ({
  id,
  args,
  expected,
});
function add(module: string, exported: string, probes: Probe[]) {
  for (let at = 0; at < probes.length; at += 128)
    suites.push({
      schemaVersion: 1,
      id: `address-media-${module}-${exported}-${suites.length}-${at}`,
      version: 1,
      module,
      export: exported,
      probes: probes.slice(at, at + 128),
    });
}
// Reviewed literal sets are contract fixtures; no archived implementation is imported.
export const serverTypes = [
  'image',
  'sticker',
  'ptt',
  'audio',
  'document',
  'video',
  'gif',
  'ppic',
  'md-app-state',
  'md-msg-hist',
  'kyc-id',
  'template',
  'thumbnail-image',
  'thumbnail-video',
  'thumbnail-gif',
  'thumbnail-document',
  'thumbnail-link',
  'payment-bg-image',
  'novi-video',
  'novi-image',
  'xma-image',
  'biz-cover-photo',
  'preview',
  'newsletter-music-artwork',
  'newsletter-audio',
  'newsletter-document',
  'newsletter-image',
  'newsletter-gif',
  'newsletter-ptt',
  'newsletter-sticker',
  'newsletter-thumbnail-link',
  'newsletter-video',
  'sticker-pack',
  'thumbnail-sticker-pack',
  'music-artwork',
  'group-history',
  'maiba-file',
];
const protocolTypes = ['image', 'sticker', 'gif', 'video', 'ptt', 'audio', 'document'];
const malformed: JsonValue[] = [
  null,
  false,
  true,
  0,
  1,
  -1,
  {},
  [],
  ['image'],
  { value: 'image' },
  { $type: 'undefined' },
  { $type: 'number', value: 'NaN' },
  '',
  'unknown',
  'Image',
  'text/plain',
];
const mutations = serverTypes.flatMap((type) => [
  type.toUpperCase(),
  ` ${type}`,
  `${type} `,
  `${type}\u0000`,
  `${type}/`,
  `${type}x`,
  `x${type}`,
]);
for (const [module, exported, accepted] of [
  ['WAServerMediaType', 'castToServerMediaType', serverTypes],
  ['WAProtocolMediaType', 'castToProtocolMediaType', protocolTypes],
] as const)
  add(
    module,
    exported,
    [...serverTypes, ...mutations, ...malformed].map((input, i) =>
      value(
        `type-${i}`,
        [input],
        typeof input === 'string' && accepted.includes(input)
          ? input
          : module === 'WAProtocolMediaType' && input === 'xma-image'
            ? 'document'
            : null,
      ),
    ),
  );
const mapped: Record<string, string> = {
  Image: 'image',
  Video: 'video',
  Ptt: 'ptt',
  Gif: 'gif',
  Sticker: 'sticker',
  DocumentFile: 'document',
};
const nonMedia = [
  'Text',
  'Futureproof',
  'Ciphertext',
  'Unavailable',
  'ExpiredEphemeral',
  'Admin',
  'Revoked',
  'DeleteForMe',
  'EphemeralSettingAdmin',
  'EphemeralSyncResponse',
  'EphemeralSettingChangeFromCurrentDevice',
  'GroupInvite',
  'SenderKeyDistribution',
  'Reaction',
  'EditAction',
  'ReceiverFetch',
  'Raven',
  'GroupPollCreate',
  'GroupPollUpdate',
];
add('WAServerMediaType', 'getMediaType', [
  ...Object.entries(mapped).map(([input, output]) => value(input, [input], output)),
  ...nonMedia.map((input) => value(input, [input], null)),
  ...['Audio', 'Document', 'image', 'IMAGE', 'Image ', '', 'unknown', null, 0, false, {}, []].map(
    (input, i): Probe => ({ id: `unmatched-${i}`, args: [input], throws: { name: 'Error' } }),
  ),
]);

interface Address {
  input: string;
  kind: string;
  field: string;
  normalized?: string;
}
const addresses: Address[] = [
  { input: 'status@broadcast', kind: 'status', field: 'statusJid' },
  { input: 'call', kind: 'call', field: 'callJid' },
  { input: 'location@broadcast', kind: 'broadcast', field: 'broadcastJid' },
  { input: '0@s.whatsapp.net', kind: 'phoneUser', field: 'userJid' },
];
for (let i = 0; i < 128; i++) {
  const id = String(20000 + i * 37),
    lid = String(i + 1),
    device = i % 100;
  addresses.push(
    { input: `${id}@s.whatsapp.net`, kind: 'phoneUser', field: 'userJid' },
    { input: `${id}:${device}@s.whatsapp.net`, kind: 'phoneDevice', field: 'deviceJid' },
    { input: `${lid}@lid`, kind: 'lidUser', field: 'userJid' },
    { input: `${lid}:${device}@lid`, kind: 'lidDevice', field: 'deviceJid' },
    { input: `${lid}@g.us`, kind: 'group', field: 'groupJid' },
    { input: `${lid}@newsletter`, kind: 'newsletter', field: 'newsletterJid' },
    { input: `${lid}@msgr`, kind: 'msgrUser', field: 'userJid' },
    { input: `${lid}:0@msgr`, kind: 'msgrUser', field: 'userJid', normalized: `${lid}@msgr` },
    { input: `${lid}:${(i % 999) + 1}@msgr`, kind: 'msgrDevice', field: 'deviceJid' },
    { input: `${id}:99@hosted`, kind: 'hosted', field: 'hostedDeviceJid' },
    { input: `${lid}:99@hosted.lid`, kind: 'hostedLid', field: 'hostedLidDeviceJid' },
    { input: `${lid}@bot`, kind: 'bot', field: 'botJid' },
    { input: `${lid}@broadcast`, kind: 'broadcast', field: 'broadcastJid' },
  );
}
addresses.push(
  { input: '123-456:0@interop', kind: 'interopUser', field: 'userJid' },
  { input: '12345678901234567890@g.us', kind: 'group', field: 'groupJid' },
  { input: '999999999999999@lid', kind: 'lidUser', field: 'userJid' },
  { input: 'abcdef0123456789AB@call', kind: 'call', field: 'callJid' },
  { input: 'f'.repeat(32) + '@call', kind: 'call', field: 'callJid' },
  { input: '20000-1234567890@g.us', kind: 'group', field: 'groupJid' },
);
add(
  'WAJids',
  'interpretAndValidateJid',
  addresses.map(({ input, kind, field, normalized }, i) =>
    value(`valid-${i}`, [input], { jidType: kind, [field]: normalized || input }),
  ),
);
const invalid = [
  '',
  '@',
  'x',
  '@me',
  '@system',
  '0@lid',
  '01@lid',
  '-1@lid',
  '1:100@lid',
  '1'.repeat(16) + '@lid',
  '0@g.us',
  '1'.repeat(21) + '@g.us',
  '10000@s.whatsapp.net',
  '2000@s.whatsapp.net',
  '0:1@s.whatsapp.net',
  '20000:100@s.whatsapp.net',
  '0@msgr',
  '1:1000@msgr',
  '1:01@msgr',
  '1@hosted',
  '20000:98@hosted',
  '0:99@hosted.lid',
  '1:1@bot',
  '0@newsletter',
  '01@newsletter',
  'a'.repeat(17) + '@call',
  'a'.repeat(33) + '@call',
  'g'.repeat(18) + '@call',
  '1@unknown',
  'STATUS@broadcast',
];
add(
  'WAJids',
  'interpretAndValidateJid',
  invalid.map((input, i) => value(`invalid-${i}`, [input], { jidType: 'unknown' })),
);
for (const [exported, kinds] of [
  ['validateLidUserJid', ['lidUser']],
  ['validateGroupJid', ['group']],
  ['validateNewsletterJid', ['newsletter']],
  ['validateHostedDeviceJid', ['hosted']],
  ['validateHostedLidDeviceJid', ['hostedLid']],
  ['validateCallJid', ['call']],
  ['validateBroadcastJid', ['broadcast', 'status']],
  ['validateChatJid', ['phoneUser', 'lidUser', 'msgrUser', 'interopUser', 'group', 'bot']],
] as [string, string[]][]) {
  const selected = [...addresses.slice(0, 69), ...addresses.slice(-6)];
  add(
    'WAJids',
    exported,
    selected.map(({ input, kind, normalized }, i) =>
      value(
        `family-${i}`,
        [input],
        kinds.includes(kind) && input !== 'call' ? normalized || input : null,
      ),
    ),
  );
}
for (const [exported, suffix] of [
  ['toPhoneUserJid', '@s.whatsapp.net'],
  ['toLidUserJid', '@lid'],
  ['toMsgrUserJid', '@msgr'],
  ['toGroupJid', '@g.us'],
  ['toNewsletterJid', '@newsletter'],
] as const)
  add(
    'WAJids',
    exported,
    Array.from({ length: 128 }, (_, i) => {
      const id = String(20000 + i * 37);
      return value(`constructed-${i}`, [id], id + suffix);
    }),
  );
const parts: Probe[] = [],
  full: Probe[] = [],
  normalized: Probe[] = [],
  stripped: Probe[] = [];
for (let i = 0; i < 128; i++) {
  const user = String(20000 + i * 37),
    agent = String(i % 100),
    device = String((i * 7) % 100),
    input = `${user}.${agent}:${device}@s.whatsapp.net`;
  parts.push(value(`parts-${i}`, [input], { user, agent, device, server: 's.whatsapp.net' }));
  full.push(value(`full-${i}`, [`${user}@s.whatsapp.net`], `${user}.0:0@s.whatsapp.net`));
  normalized.push(value(`normalize-${i}`, [input], `${user}@s.whatsapp.net`));
  stripped.push(value(`strip-${i}`, [input], `${user}:${device}@s.whatsapp.net`));
  normalized.push(
    value(`hosted-${i}`, [`${user}:99@hosted`], `${user}@s.whatsapp.net`),
    value(`hosted-lid-${i}`, [`${user}:99@hosted.lid`], `${user}@lid`),
  );
}
add('WAJids', 'parseJidParts', parts);
add('WAJids', 'fullFormDeviceJidString', full);
add('WAJids', 'extractUserJid', normalized);
add('WAJids', 'stripAgentIdFromPhoneDeviceJid', stripped);
add(
  'WAJids',
  'interpretAndValidateJid',
  malformed
    .filter((input) => typeof input !== 'string')
    .map((input, i) => value(`non-string-${i}`, [input], { jidType: 'unknown' })),
);
// These fixtures retain observed parser tolerance; they are not recommended address formats.
add('WAJids', 'interpretAndValidateJid', [
  value('group-unescaped-domain-separator', ['1@gXus'], {
    jidType: 'group',
    groupJid: '1@gXus@g.us',
  }),
  value('phone-unescaped-domain-separators', ['20000@sXwhatsappYnet'], {
    jidType: 'phoneUser',
    userJid: '20000@sXwhatsappYnet',
  }),
]);
const masked = Array.from({ length: 128 }, (_, i) => {
  const id = String(20000 + i * 37);
  return value(`mask-${i}`, [`${id}@s.whatsapp.net`], `...${id.slice(-4)}@s.whatsapp.net`);
});
add('WAJids', 'sanitizeJidForLogging', [
  ...masked,
  value('status-preserved', ['status@broadcast'], 'status@broadcast'),
  value('unknown-preserved', ['synthetic@unknown'], 'synthetic@unknown'),
]);
export const addressingMediaCases = suites;
