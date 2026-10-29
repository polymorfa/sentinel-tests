import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSubject, assertCaseObservations } from '../support/subject.ts';
import type { BehaviorCase, GateConfig } from '../support/types.ts';

const subject = await loadSubject();
after(async () => {
  await subject?.close?.();
});
const capability = 'wa-internal:pq-gating';
if (!subject) test.skip('PQ selector suite requires an explicit SENTINEL_SUBJECT_MODULE', () => {});
else if (!subject.capabilities?.includes(capability))
  test.skip(`PQ selector suite unsupported: ${subject.id} lacks ${capability}`, () => {});
const gates = (upload: boolean, messages: boolean): GateConfig => ({
  abprops: { pq_keys_upload: upload, pq_1on1_message_enabled: messages },
});
function selectorCase(
  id: string,
  upload: boolean,
  messages: boolean,
  expected: string,
): BehaviorCase {
  return {
    schemaVersion: 1,
    id,
    version: 1,
    title: 'PQ session scope under explicit gate inputs',
    module: 'WAWebPQGatingUtils',
    export: 'getOneToOneChatSessionScope',
    context: {
      clock: '2026-10-26T00:00:00.000Z',
      timezone: 'UTC',
      randomSeed: 1,
      gates: gates(upload, messages),
    },
    probes: [{ id: 'initial', args: [], expected }],
  };
}
describe(
  'PQ selector assignments and cache lifetime',
  {
    skip: !subject
      ? 'Set SENTINEL_SUBJECT_MODULE to a reviewed subject adapter'
      : !subject.capabilities?.includes(capability)
        ? `${subject.id} lacks ${capability}`
        : false,
  },
  () => {
    for (const upload of [false, true])
      for (const messages of [false, true])
        test(`upload=${upload}, messages=${messages}`, async () => {
          assert.ok(subject);
          const expected = upload && messages ? 'pq' : 'default';
          const testCase = selectorCase(`pq-${upload}-${messages}`, upload, messages, expected);
          const result = await subject.runCase(testCase);
          assertCaseObservations(testCase, result);
          assert.equal(result.probes?.[0].actual, expected);
        });
    for (const initial of [false, true])
      test(`cached ${initial ? 'enabled' : 'disabled'} decision survives a later fixture update`, async () => {
        assert.ok(subject);
        const expected = initial ? 'pq' : 'default';
        const testCase = selectorCase(`pq-cached-${initial}`, initial, initial, expected);
        testCase.context!.gateUpdates = [
          { beforeProbe: 'after-update', gates: gates(!initial, !initial) },
        ];
        testCase.probes.push({ id: 'after-update', args: [], expected });
        const result = await subject.runCase(testCase);
        assertCaseObservations(testCase, result);
        assert.deepEqual(
          result.probes?.map((probe) => probe.actual),
          [expected, expected],
        );
        assert.equal(
          result.gateUpdates?.length,
          1,
          'The subject must record the applied update, not ignore the timeline',
        );
        assert.equal(result.gateUpdates[0].beforeProbe, 'after-update');
        assert.equal(result.gateUpdates[0].epoch, 1);
        assert.deepEqual(result.gateUpdates[0].gates, gates(!initial, !initial));
        assert.ok(
          Array.isArray(result.gateObservations),
          'Cached-reader observations are required',
        );
        assert.ok(result.gateObservations.length > 0);
        assert.ok(
          result.gateObservations.every((read) => read.probeId === 'initial'),
          'The cached selector should not reread updated fixture values',
        );
      });
  },
);
