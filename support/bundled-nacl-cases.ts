import { createHash } from 'node:crypto';
import type { BehaviorCase, Probe, JsonValue } from './types.ts';
const bytes = (hex: string): JsonValue => ({
  $type: 'Uint8Array',
  value: Array.from(Buffer.from(hex, 'hex')),
});
const call = (id: string, exp: string, args: JsonValue[], expected: JsonValue): Probe => ({
  id,
  export: exp,
  args,
  expected,
});
const malformed = (
  id: string,
  exp: string,
  args: JsonValue[],
  name: string,
  message: string,
): Probe => ({ id, export: exp, args, throws: { name, message } });
const alice = '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a';
const apub = '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a';
const bob = '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb';
const bpub = 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f';
const shared = '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742';
const seed = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const publicKey = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const signature =
  'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';
export function bundledNaclCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [
    {
      schemaVersion: 1,
      id: 'bundled-nacl-sha512-abc-v1',
      version: 1,
      module: 'tweetnacl',
      export: 'hash',
      probes: [
        call(
          'nist-abc',
          'hash',
          [bytes('616263')],
          bytes(
            'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
          ),
        ),
        malformed(
          'raw-array-rejected',
          'hash',
          [[97, 98, 99]],
          'TypeError',
          'unexpected type, use Uint8Array',
        ),
      ],
    },
    {
      schemaVersion: 1,
      id: 'bundled-nacl-x25519-rfc7748-v1',
      version: 1,
      module: 'tweetnacl',
      export: 'scalarMult',
      probes: [
        call('alice-public', 'scalarMult.base', [bytes(alice)], bytes(apub)),
        call('bob-public', 'scalarMult.base', [bytes(bob)], bytes(bpub)),
        call('alice-shared', 'scalarMult', [bytes(alice), bytes(bpub)], bytes(shared)),
        call('bob-shared', 'scalarMult', [bytes(bob), bytes(apub)], bytes(shared)),
        malformed('short-scalar', 'scalarMult', [bytes('00'), bytes(bpub)], 'Error', 'bad n size'),
        malformed('short-point', 'scalarMult', [bytes(alice), bytes('00')], 'Error', 'bad p size'),
      ],
    },
    {
      schemaVersion: 1,
      id: 'bundled-nacl-ed25519-rfc8032-test1-v1',
      version: 1,
      module: 'tweetnacl',
      export: 'sign.detached',
      probes: [
        call('seed-keypair', 'sign.keyPair.fromSeed', [bytes(seed)], {
          publicKey: bytes(publicKey),
          secretKey: bytes(seed + publicKey),
        }),
        call('sign-empty', 'sign.detached', [bytes(''), bytes(seed + publicKey)], bytes(signature)),
        call(
          'verify-empty',
          'sign.detached.verify',
          [bytes(''), bytes(signature), bytes(publicKey)],
          true,
        ),
        call(
          'changed-signature',
          'sign.detached.verify',
          [bytes(''), bytes('e4' + signature.slice(2)), bytes(publicKey)],
          false,
        ),
        call(
          'changed-message',
          'sign.detached.verify',
          [bytes('00'), bytes(signature), bytes(publicKey)],
          false,
        ),
        malformed(
          'short-signature',
          'sign.detached.verify',
          [bytes(''), bytes('00'), bytes(publicKey)],
          'Error',
          'bad signature size',
        ),
      ],
    },
  ];
  const firstkey = '1b27556473e985d462cd51197a9a46c76009549eac6474f206c4ee0844f68389';
  const nonce = '69696ee955b62b73cd62bda875fc73d68219e0036b7a0b37';
  const messageHex =
    'be075fc53c81f2d5cf141316ebeb0c7b5228c52a4c62cbd44b66849b64244ffce5ecbaaf33bd751a1ac728d45e6c61296cdc3c01233561f41db66cce314adb310e3be8250c46f06dceea3a7fa1348057e2f6556ad6b1318a024a838f21af1fde048977eb48f59ffd4924ca1c60902e52f0a089bc76897040e082f937763848645e0705';
  const ciphertext =
    'f3ffc7703f9400e52a7dfb4b3d3305d98e993b9f48681273c29650ba32fc76ce48332ea7164d96a4476fb8c531a1186ac0dfc17c98dce87b4da7f011ec48c97271d2c20f9b928fe2270d6fb863d51738b48eeee314a7cc8ab932164548e526ae90224368517acfeabd6bb3732bc0e9da99832b61ca01b6de56244a9e88d5f9b37973f622a43d14a6599b1f654cb45a74e355a5';

  const message = bytes(messageHex),
    cipher = bytes(ciphertext),
    nonceBytes = bytes(nonce),
    key = bytes(firstkey);
  const make = (name: string, probes: Probe[]) =>
    cases.push({
      schemaVersion: 1,
      id: `bundled-nacl-${name}-v1`,
      version: 1,
      module: 'tweetnacl',
      export: 'hash',
      probes,
    });
  const flip = (hex: string, index: number) =>
    bytes(
      hex.slice(0, index * 2) +
        (parseInt(hex.slice(index * 2, index * 2 + 2), 16) ^ 1).toString(16).padStart(2, '0') +
        hex.slice(index * 2 + 2),
    );
  const view = (hex: string): JsonValue => ({
    $type: 'Uint8Array',
    value: [91, 92, ...Array.from(Buffer.from(hex, 'hex')), 93],
    byteOffset: 2,
    byteLength: hex.length / 2,
  });
  make('secretbox-primary', [
    call('encrypt', 'secretbox', [message, nonceBytes, key], cipher),
    call('open', 'secretbox.open', [cipher, nonceBytes, key], message),
    call('offset-encrypt', 'secretbox', [view(messageHex), view(nonce), view(firstkey)], cipher),
    call('offset-open', 'secretbox.open', [view(ciphertext), view(nonce), view(firstkey)], message),
    ...Array.from({ length: 16 }, (_, n) =>
      call(`short-cipher-${n}`, 'secretbox.open', [bytes('00'.repeat(n)), nonceBytes, key], null),
    ),
    ...[0, 1, 31, 33].map((n) =>
      malformed(
        `bad-key-${n}`,
        'secretbox',
        [message, nonceBytes, bytes('00'.repeat(n))],
        'Error',
        'bad key size',
      ),
    ),
    ...[0, 1, 23, 25].map((n) =>
      malformed(
        `bad-nonce-${n}`,
        'secretbox',
        [message, bytes('00'.repeat(n)), key],
        'Error',
        'bad nonce size',
      ),
    ),
  ]);
  for (let page = 0; page < 3; page++)
    make(
      `secretbox-cipher-byte-tamper-${page}`,
      Array.from({ length: Math.min(64, 147 - page * 64) }, (_, n) =>
        call(
          `flip-${page * 64 + n}`,
          'secretbox.open',
          [flip(ciphertext, page * 64 + n), nonceBytes, key],
          null,
        ),
      ),
    );
  make('secretbox-key-nonce-byte-tamper', [
    ...Array.from({ length: 32 }, (_, n) =>
      call(`key-${n}`, 'secretbox.open', [cipher, nonceBytes, flip(firstkey, n)], null),
    ),
    ...Array.from({ length: 24 }, (_, n) =>
      call(`nonce-${n}`, 'secretbox.open', [cipher, flip(nonce, n), key], null),
    ),
  ]);
  make(
    'signature-byte-tamper',
    Array.from({ length: 64 }, (_, n) =>
      call(
        `signature-${n}`,
        'sign.detached.verify',
        [bytes(''), flip(signature, n), bytes(publicKey)],
        false,
      ),
    ),
  );
  make('public-key-byte-tamper', [
    ...Array.from({ length: 32 }, (_, n) =>
      call(
        `public-key-${n}`,
        'sign.detached.verify',
        [bytes(''), bytes(signature), flip(publicKey, n)],
        false,
      ),
    ),
    malformed(
      'short-public-key',
      'sign.detached.verify',
      [bytes(''), bytes(signature), bytes('00')],
      'Error',
      'bad public key size',
    ),
    malformed('short-seed', 'sign.keyPair.fromSeed', [bytes('00')], 'Error', 'bad seed size'),
    malformed(
      'short-secret',
      'sign.detached',
      [bytes(''), bytes(seed)],
      'Error',
      'bad secret key size',
    ),
    call('offset-sign', 'sign.detached', [view(''), view(seed + publicKey)], bytes(signature)),
    call(
      'offset-verify',
      'sign.detached.verify',
      [view(''), view(signature), view(publicKey)],
      true,
    ),
  ]);
  // The pinned primary box.c/box.exp use the same message/nonce and RFC7748 keys.
  // This is a known ciphertext oracle, not an encrypt/decrypt-only round trip.
  make('box-primary-agreement', [
    call('alice-keypair', 'box.keyPair.fromSecretKey', [bytes(alice)], {
      publicKey: bytes(apub),
      secretKey: bytes(alice),
    }),
    call('bob-keypair', 'box.keyPair.fromSecretKey', [bytes(bob)], {
      publicKey: bytes(bpub),
      secretKey: bytes(bob),
    }),
    call('encrypt-alice', 'box', [message, nonceBytes, bytes(bpub), bytes(alice)], cipher),
    call('encrypt-bob', 'box', [message, nonceBytes, bytes(apub), bytes(bob)], cipher),
    call('open-bob', 'box.open', [cipher, nonceBytes, bytes(apub), bytes(bob)], message),
    call('open-alice', 'box.open', [cipher, nonceBytes, bytes(bpub), bytes(alice)], message),
    call('alice-before', 'box.before', [bytes(bpub), bytes(alice)], key),
    call('bob-before', 'box.before', [bytes(apub), bytes(bob)], key),
    call('offset-scalar', 'scalarMult', [view(alice), view(bpub)], bytes(shared)),
    call('offset-box', 'box', [view(messageHex), view(nonce), view(bpub), view(alice)], cipher),
    malformed(
      'short-box-public',
      'box.before',
      [bytes('00'), bytes(alice)],
      'Error',
      'bad public key size',
    ),
    malformed(
      'short-box-secret',
      'box.before',
      [bytes(bpub), bytes('00')],
      'Error',
      'bad secret key size',
    ),
  ]);
  for (const profile of ['zero', 'ff', 'sequence'] as const) {
    const probes: Probe[] = [];
    for (const length of [
      0,
      1,
      31,
      32,
      63,
      64,
      65,
      127,
      128,
      129,
      1024,
      8193,
      profile === 'zero' ? 65537 : 32769,
    ]) {
      const input = Uint8Array.from({ length }, (_, n) =>
        profile === 'zero' ? 0 : profile === 'ff' ? 255 : (n * 37 + 11) % 256,
      );
      // This oracle executes in the test host, never as a provider inside the worker.
      const digest = createHash('sha512').update(input).digest();
      probes.push(
        call(`length-${length}`, 'hash', [{ $type: 'Uint8Array', value: Array.from(input) }], {
          $type: 'Uint8Array',
          value: Array.from(digest),
        }),
      );
    }
    make(`sha512-generated-${profile}`, probes);
  }
  // Version2 appends hash dimensions; all preceding case inputs/oracles stay intact.
  const hashExpected = (input: Uint8Array): JsonValue => ({
    $type: 'Uint8Array',
    value: Array.from(createHash('sha512').update(input).digest()),
  });
  const cutoffProbes: Probe[] = [];
  for (const profile of ['zero', 'ff', 'sequence'] as const)
    for (const length of [110, 111, 112, 113, 114, 239, 240, 241, 367, 368, 369]) {
      const input = Uint8Array.from({ length }, (_, index) =>
        profile === 'zero' ? 0 : profile === 'ff' ? 255 : (index * 37 + 11) % 256,
      );
      cutoffProbes.push(
        call(
          `${profile}-length-${length}`,
          'hash',
          [{ $type: 'Uint8Array', value: Array.from(input) }],
          hashExpected(input),
        ),
      );
    }
  make('sha512-padding-cutoffs', cutoffProbes);
  const viewProbes: Probe[] = [];
  for (const length of [0, 1, 111, 112, 113, 127, 128, 129, 239, 240, 241, 255, 256, 257])
    for (const offset of [1, 7]) {
      const visible = Uint8Array.from({ length }, (_, index) => (index * 53 + length * 11) % 256);
      viewProbes.push(
        call(
          `length-${length}-offset-${offset}`,
          'hash',
          [
            {
              $type: 'Uint8Array',
              value: [...Array<number>(offset).fill(238), ...visible, 221, 220],
              byteOffset: offset,
              byteLength: length,
            },
          ],
          hashExpected(visible),
        ),
      );
    }
  make('sha512-visible-views', viewProbes);
  const retryProbes: Probe[] = [];
  const abcDigest =
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f';
  const invalidInputs: [string, JsonValue][] = [
    ['undefined', { $type: 'undefined' }],
    ['null', null],
    ['string', 'abc'],
    ['number', 7],
    ['boolean', false],
    ['buffer', { $type: 'ArrayBuffer', value: [97, 98, 99] }],
    ['array-like', { length: 3, '0': 97, '1': 98, '2': 99 }],
  ];
  for (const [name, input] of invalidInputs)
    retryProbes.push(
      malformed(`invalid-${name}`, 'hash', [input], 'TypeError', 'unexpected type, use Uint8Array'),
      call(`valid-abc-after-${name}`, 'hash', [bytes('616263')], bytes(abcDigest)),
    );
  make('sha512-type-recovery', retryProbes);
  make(
    'sha512-larger-block-neighbors',
    [16383, 16384, 16385].map((length) => {
      const input = Uint8Array.from({ length }, (_, index) => (index % 2 === 0 ? 165 : 90));
      return call(
        `alternating-length-${length}`,
        'hash',
        [{ $type: 'Uint8Array', value: Array.from(input) }],
        hashExpected(input),
      );
    }),
  );
  return cases;
}
