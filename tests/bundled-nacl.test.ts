import { after, test } from 'node:test';
import assert from 'node:assert/strict';
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
  for (const item of cases) {
    validateProbeControls(item);
    assert.ok(item.probes.length <= 96);
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
