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
  assert.equal(cases.length, 18);
  assert.equal(
    createHash('sha256')
      .update(JSON.stringify(cases.slice(0, 14), null, 2) + '\n')
      .digest('hex'),
    'd6d675cbae27fad5120f09e38824dcf75579c3c719c59ad22e60b2e8516b2618',
  );
  const extensions = cases.slice(14);
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
  for (const item of cases) {
    validateProbeControls(item);
    assert.ok(item.probes.length <= 96);
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
