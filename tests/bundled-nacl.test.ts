import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bundledNaclCases } from '../support/bundled-nacl-cases.ts';
import { validateProbeControls } from '../support/probe-controls.ts';
import { assertCaseObservations, loadSubject } from '../support/subject.ts';
import metadata from '../metadata/suites/bundled-nacl.json';

const cases = bundledNaclCases();
test('bundled primitive plans are deterministic, bounded and retain incomplete inventory', () => {
  assert.deepEqual(bundledNaclCases(), cases);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  assert.equal(cases.length, metadata.trials.cases);
  assert.equal(
    cases.reduce((sum, item) => sum + item.probes.length, 0),
    metadata.trials.probesPerRevision,
  );
  assert.equal(cases.length, 51);
  assert.equal(
    createHash('sha256')
      .update(JSON.stringify(cases.slice(0, 14), null, 2) + '\n')
      .digest('hex'),
    'd6d675cbae27fad5120f09e38824dcf75579c3c719c59ad22e60b2e8516b2618',
  );
  const extensions = cases.slice(14, 18);
  assert.deepEqual(
    extensions.map((item) => [item.id, item.probes.length]),
    [
      ['bundled-nacl-sha512-padding-cutoffs-v1', 33],
      ['bundled-nacl-sha512-visible-views-v1', 28],
      ['bundled-nacl-sha512-type-recovery-v1', 14],
      ['bundled-nacl-sha512-larger-block-neighbors-v1', 3],
    ],
  );
  const byteInput = (value: unknown) =>
    value as { $type: string; value: number[]; byteOffset?: number; byteLength?: number };
  assert.deepEqual(
    [...new Set(extensions[0]!.probes.map((probe) => byteInput(probe.args[0]).value.length))],
    [110, 111, 112, 113, 114, 239, 240, 241, 367, 368, 369],
  );
  for (const probe of extensions[1]!.probes) {
    const input = byteInput(probe.args[0]);
    assert.equal(input.$type, 'Uint8Array');
    assert.ok([1, 7].includes(input.byteOffset!));
    assert.equal(input.value.length, input.byteOffset! + input.byteLength! + 2);
    assert.deepEqual(
      input.value.slice(0, input.byteOffset),
      Array<number>(input.byteOffset!).fill(238),
    );
    assert.deepEqual(input.value.slice(-2), [221, 220]);
    if (input.byteLength === 0) assert.ok(input.value.length > 0);
  }
  assert.deepEqual(
    [...new Set(extensions[1]!.probes.map((probe) => byteInput(probe.args[0]).byteLength))],
    [0, 1, 111, 112, 113, 127, 128, 129, 239, 240, 241, 255, 256, 257],
  );
  for (let index = 0; index < 14; index += 2) {
    assert.deepEqual(extensions[2]!.probes[index]!.throws, {
      name: 'TypeError',
      message: 'unexpected type, use Uint8Array',
    });
    assert.deepEqual(extensions[2]!.probes[index + 1]!.args, cases[0]!.probes[0]!.args);
    assert.deepEqual(extensions[2]!.probes[index + 1]!.expected, cases[0]!.probes[0]!.expected);
  }
  assert.deepEqual(
    extensions[3]!.probes.map((probe) => byteInput(probe.args[0]).value.length),
    [16383, 16384, 16385],
  );
  for (const probe of extensions[3]!.probes)
    assert.ok(
      byteInput(probe.args[0]).value.every((byte, index) => byte === (index % 2 === 0 ? 165 : 90)),
    );
  assert.equal(
    createHash('sha256')
      .update(JSON.stringify(cases.slice(0, 18), null, 2) + '\n')
      .digest('hex'),
    'c10f43cf466dcbde9ef31106f204b8e92f2914d99c78f81143a30be93fcf1461',
  );
  const signatureCases = cases.slice(18, 21);
  assert.deepEqual(
    signatureCases.map((item) => [item.id, item.probes.length]),
    [
      ['bundled-nacl-ed25519-message-prefixes-0-v1', 40],
      ['bundled-nacl-ed25519-message-prefixes-1-v1', 36],
      ['bundled-nacl-ed25519-visible-views-v1', 26],
    ],
  );
  const signatureProbes = signatureCases.slice(0, 2).flatMap((item) => item.probes);
  assert.deepEqual(
    signatureProbes
      .filter((_, index) => index % 4 === 0)
      .map((probe) => byteInput(probe.args[0]).value.length),
    [1, 47, 48, 49, 63, 64, 65, 79, 80, 81, 95, 96, 97, 175, 176, 177, 207, 208, 209],
  );
  for (let index = 0; index < signatureProbes.length; index += 4) {
    const [detached, signed, verify, open] = signatureProbes.slice(index, index + 4);
    assert.deepEqual(
      [detached!.export, signed!.export, verify!.export, open!.export],
      ['sign.detached', 'sign', 'sign.detached.verify', 'sign.open'],
    );
    const message = byteInput(detached!.args[0]).value,
      signature = byteInput(detached!.expected).value;
    assert.equal(signature.length, 64);
    assert.deepEqual(byteInput(signed!.expected).value, [...signature, ...message]);
    assert.deepEqual(verify!.args[1], detached!.expected);
    assert.equal(verify!.expected, true);
    assert.deepEqual(open!.args[0], signed!.expected);
    assert.deepEqual(byteInput(open!.expected).value, message);
  }
  const signatureViews = signatureCases[2]!.probes;
  assert.deepEqual(
    signatureViews
      .filter((_, index) => index < 24 && index % 4 === 0)
      .map((probe) => byteInput(probe.args[0]).byteLength),
    [1, 47, 48, 79, 80, 81],
  );
  for (const probe of signatureViews)
    for (const argument of probe.args) {
      const input = byteInput(argument);
      assert.equal(input.$type, 'Uint8Array');
      assert.ok([1, 7].includes(input.byteOffset!));
      assert.equal(input.value.length, input.byteOffset! + input.byteLength! + 2);
      assert.deepEqual(
        input.value.slice(0, input.byteOffset),
        Array<number>(input.byteOffset!).fill(238),
      );
      assert.deepEqual(input.value.slice(-2), [221, 220]);
    }
  const seedKat = cases
    .slice(0, 18)
    .flatMap((item) => item.probes)
    .find((probe) => probe.export === 'sign.keyPair.fromSeed' && !probe.throws)!;
  for (const probe of signatureViews.slice(24)) {
    const input = byteInput(probe.args[0]);
    assert.equal(probe.export, 'sign.keyPair.fromSeed');
    assert.equal(input.byteLength, 32);
    assert.deepEqual(
      input.value.slice(input.byteOffset, input.byteOffset! + input.byteLength!),
      byteInput(seedKat.args[0]).value,
    );
    assert.deepEqual(probe.expected, seedKat.expected);
  }
  assert.equal(
    createHash('sha256')
      .update(JSON.stringify(cases.slice(0, 21), null, 2) + '\n')
      .digest('hex'),
    'd3805081e7e6ab9e4cccaf564c45071cc0e9bca3bcac9e28d56154c1487d7583',
  );
  const jointCases = cases.slice(21, 45);
  assert.equal(jointCases.length, 24);
  assert.deepEqual(
    jointCases.map((item) => item.probes.length),
    [...Array<number>(23).fill(64), 58],
  );
  const originalProbe = (caseId: string, probeId: string) =>
    cases
      .slice(0, 21)
      .find((item) => item.id === caseId)!
      .probes.find((probe) => probe.id === probeId)!;
  const rfcCase = 'bundled-nacl-x25519-rfc7748-v1',
    boxCase = 'bundled-nacl-box-primary-agreement-v1';
  const anchors = ['alice', 'bob'].map((label) => ({
    label,
    direction: label === 'alice' ? 'alice-to-bob' : 'bob-to-alice',
    base: originalProbe(rfcCase, `${label}-public`),
    shared: originalProbe(rfcCase, `${label}-shared`),
    keypair: originalProbe(boxCase, `${label}-keypair`),
  }));
  const visible = (value: unknown) => {
    const input = byteInput(value);
    assert.equal(input.$type, 'Uint8Array');
    if (input.byteOffset === undefined) {
      assert.deepEqual(Object.keys(input).sort(), ['$type', 'value']);
      assert.equal(input.value.length, 32);
      return { bytes: input.value, offset: 0 };
    }
    assert.deepEqual(Object.keys(input).sort(), ['$type', 'byteLength', 'byteOffset', 'value']);
    assert.ok([1, 7].includes(input.byteOffset));
    assert.equal(input.byteLength, 32);
    assert.equal(input.value.length, input.byteOffset + 34);
    assert.deepEqual(
      input.value.slice(0, input.byteOffset),
      Array<number>(input.byteOffset).fill(238),
    );
    assert.deepEqual(input.value.slice(-2), [221, 220]);
    return {
      bytes: input.value.slice(input.byteOffset, input.byteOffset + 32),
      offset: input.byteOffset,
    };
  };
  const clamped = (input: number[]) =>
    input.map((byte, index) =>
      index === 0 ? byte & 248 : index === 31 ? (byte & 127) | 64 : byte,
    );
  const modelProbes = [
    ...anchors.flatMap((anchor) => [anchor.base, anchor.keypair, anchor.shared]),
    ...jointCases.flatMap((item) => item.probes),
  ];
  const actualCells = new Set<string>();
  let baseCells = 0,
    keypairCells = 0,
    sharedCells = 0;
  for (const probe of modelProbes) {
    const api = probe.export;
    assert.ok(['scalarMult.base', 'box.keyPair.fromSecretKey', 'scalarMult'].includes(api!));
    const scalar = visible(probe.args[0]);
    const anchor = anchors.find(
      (candidate) =>
        JSON.stringify(clamped(scalar.bytes)) ===
        JSON.stringify(clamped(byteInput(candidate.base.args[0]).value)),
    );
    assert.ok(anchor, 'Every unselected scalar bit must retain the fixed RFC background');
    const mask = (scalar.bytes[0]! & 7) | (((scalar.bytes[31]! >>> 6) & 3) << 3);
    let peerBit: number | null = null,
      peerOffset: number | null = null;
    if (api === 'scalarMult') {
      assert.equal(probe.args.length, 2);
      const peer = visible(probe.args[1]);
      const normalized = peer.bytes.map((byte, index) => (index === 31 ? byte & 127 : byte));
      assert.deepEqual(normalized, byteInput(anchor.shared.args[1]).value);
      peerBit = peer.bytes[31]! >>> 7;
      peerOffset = peer.offset;
      assert.deepEqual(probe.expected, anchor.shared.expected);
      sharedCells++;
    } else {
      assert.equal(probe.args.length, 1);
      if (api === 'scalarMult.base') {
        assert.deepEqual(probe.expected, anchor.base.expected);
        baseCells++;
      } else {
        assert.deepEqual(probe.expected, {
          publicKey: anchor.base.expected,
          secretKey: { $type: 'Uint8Array', value: scalar.bytes },
        });
        keypairCells++;
      }
    }
    const cell = JSON.stringify([anchor.direction, api, mask, scalar.offset, peerBit, peerOffset]);
    assert.ok(!actualCells.has(cell), `Duplicated selected model cell: ${cell}`);
    actualCells.add(cell);
  }
  const expectedCells = new Set<string>();
  for (const direction of ['alice-to-bob', 'bob-to-alice']) {
    for (const api of ['scalarMult.base', 'box.keyPair.fromSecretKey'])
      for (let mask = 0; mask < 32; mask++)
        for (const offset of [0, 1, 7])
          expectedCells.add(JSON.stringify([direction, api, mask, offset, null, null]));
    for (let mask = 0; mask < 32; mask++)
      for (const bit of [0, 1])
        for (const so of [0, 1, 7])
          for (const po of [0, 1, 7])
            expectedCells.add(JSON.stringify([direction, 'scalarMult', mask, so, bit, po]));
  }
  assert.equal(modelProbes.length, 1536);
  assert.equal(baseCells, 192);
  assert.equal(keypairCells, 192);
  assert.equal(sharedCells, 1152);
  assert.deepEqual([...actualCells].sort(), [...expectedCells].sort());
  assert.equal(
    createHash('sha256')
      .update(JSON.stringify(cases.slice(0, 45), null, 2) + '\n')
      .digest('hex'),
    'bb95c26a00214d605549b3fafaeba0ac8b2c46352ec0228e02b23264ba56c7ab',
  );
  const guards = cases.slice(45);
  assert.deepEqual(
    guards.map((item) => [item.id, item.probes.length]),
    [
      ['bundled-nacl-x25519-base-guards-v1', 26],
      ['bundled-nacl-x25519-keypair-guards-v1', 26],
      ['bundled-nacl-x25519-binary-type-order-v1', 38],
      ['bundled-nacl-x25519-binary-sizes-v1', 20],
      ['bundled-nacl-x25519-visible-size-guards-v1', 48],
      ['bundled-nacl-x25519-returned-public-composition-v1', 8],
    ],
  );
  for (const item of guards.slice(0, 5))
    for (let i = 0; i < item.probes.length; i += 2) {
      assert.ok(item.probes[i]!.throws);
      assert.equal(item.probes[i + 1]!.throws, undefined);
      assert.ok(item.probes[i + 1]!.id.endsWith('-retry'));
      const retry = item.probes[i + 1]!;
      const baseline =
        retry.export === 'box.keyPair.fromSecretKey'
          ? cases
              .find((c) => c.id === 'bundled-nacl-box-primary-agreement-v1')!
              .probes.find((p) => p.id === 'alice-keypair')!
          : cases[1]!.probes.find(
              (p) =>
                p.id === (retry.export === 'scalarMult.base' ? 'alice-public' : 'alice-shared'),
            )!;
      assert.deepEqual(retry.args, baseline.args);
      assert.deepEqual(retry.expected, baseline.expected);
    }
  const precedence = guards[2]!.probes.slice(-6).filter((p) => p.throws);
  assert.deepEqual(
    precedence.map((p) => p.throws),
    [
      { name: 'TypeError', message: 'unexpected type, use Uint8Array' },
      { name: 'TypeError', message: 'unexpected type, use Uint8Array' },
      { name: 'Error', message: 'bad n size' },
    ],
  );
  const visibleFailures = guards[4]!.probes.filter((p) => p.throws);
  assert.equal(visibleFailures.length, 24);
  for (const p of visibleFailures) {
    const views = p.args.map(byteInput).filter((v) => v?.byteOffset !== undefined);
    assert.equal(views.length, 1);
    const v = views[0]!;
    assert.ok([1, 7].includes(v.byteOffset!));
    assert.ok([0, 31, 33].includes(v.byteLength!));
    assert.equal(v.value.length, v.byteOffset! + v.byteLength! + 2);
    assert.deepEqual(v.value.slice(0, v.byteOffset), Array(v.byteOffset).fill(238));
    assert.deepEqual(v.value.slice(-2), [221, 220]);
  }
  const composition = guards[5]!.probes;
  assert.deepEqual(
    composition.slice(0, 4).map((p) => p.retain?.stage),
    ['call', 'call', 'call', 'call'],
  );
  assert.deepEqual(
    composition.slice(4).map((p) => p.expected),
    [false, false, false, false],
  );
  assert.ok(composition.slice(4).every((p) => p.result && 'identityWith' in p.result));
  assert.deepEqual(composition[2]!.args[1], { $type: 'reference', value: 'bob-public' });
  assert.deepEqual(composition[3]!.args[1], { $type: 'reference', value: 'alice-public' });
  for (const item of cases) {
    validateProbeControls(item);
    assert.ok(item.probes.length <= 64);
    assert.ok(Buffer.byteLength(JSON.stringify(item)) <= 256 * 1024);
    assert.equal(item.module, 'tweetnacl');
    assert.equal(item.context, undefined);
    assert.equal(item.stubs, undefined);
    for (const probe of item.probes)
      assert.ok(
        !['randomBytes', 'setPRNG', 'sign.keyPair', 'box.keyPair'].includes(
          probe.export || item.export,
        ),
      );
  }
  for (const observed of metadata.observations) {
    assert.equal(observed.modules.length, 2);
    assert.equal(observed.staticCoverage.complete, false);
    assert.equal(observed.staticCoverage.workBudget.limit, 2_000_000);
    assert.equal(observed.staticCoverage.workBudget.exhausted, true);
    assert.ok(observed.unresolved.some((item) => item.code === 'work-budget'));
  }
});
const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const reason = !subject
  ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
  : !subject.capabilities?.includes('wa-bundle:tweetnacl-deterministic')
    ? `${subject.id} lacks wa-bundle:tweetnacl-deterministic`
    : false;
if (reason) test.skip(`Bundled NaCl suite skipped: ${reason}`, () => {});
for (const item of reason ? [] : cases)
  test(item.id, async () => {
    assert.ok(subject);
    assertCaseObservations(item, await subject.runCase(item));
    if (subject.compareCase) {
      const pair = await subject.compareCase(item);
      assert.equal(pair.status, 'unchanged');
      assertCaseObservations(item, pair.baseline);
      assert.ok(pair.candidate);
      assertCaseObservations(item, pair.candidate);
    }
  });
