import type { BehaviorCase, JsonValue, Probe } from './types.ts';

export const historyProgressBabelSha256 =
  'd87819406e3accc642307f2a1da84ff09c7541b6ee5724b1e66d86e1e77ee606';
const getters = 'WAWebHistorySyncProgressGetters';
const factory = 'WAWebGetters';
const absent: JsonValue = { $type: 'undefined' };
const nan: JsonValue = { $type: 'number', value: 'NaN' };
const ref = (value: string): JsonValue => ({ $type: 'reference', value });
const record = (id: JsonValue, patch: Record<string, JsonValue> = {}): JsonValue => ({
  id,
  revisionNumber: 1,
  realProgress: 10,
  fakeProgress: 3,
  incomplete: true,
  remainingPausedSeconds: null,
  ...patch,
});
const read = (id: string, exported: string, value: JsonValue, expected: JsonValue): Probe => ({
  id,
  export: exported,
  args: [value],
  expected,
});
const clear = (id: string, expected: number): Probe => ({
  id,
  module: factory,
  export: 'clearAllGetterCaches',
  args: [],
  expected,
});
const fail = (id: string, args: JsonValue[], name = 'Error'): Probe => ({
  id,
  export: 'getProgress',
  args,
  throws: { name },
});

/** Actual history getter functions and their own cache; records are synthetic model-shaped inputs. */
export function historyProgressGettersCases(): BehaviorCase[] {
  const cases: BehaviorCase[] = [];
  for (const lazy of [false, true])
    for (const gkx16539 of [false, true])
      for (const gkx26256 of [false, true]) {
        const suffix = `${Number(lazy)}${Number(gkx16539)}${Number(gkx26256)}`;
        const make = (name: string, probes: Probe[]) =>
          cases.push({
            schemaVersion: 1,
            id: `history-progress-getters-${name}-${suffix}-v1`,
            version: 1,
            module: getters,
            export: 'getProgress',
            context: {
              bootstrap: { 'babel-helpers': historyProgressBabelSha256 },
              gates: {
                abprops: { web_getters_lazy_slot_allocation: lazy },
                gkx: { '16539': gkx16539, '26256': gkx26256 },
              },
            },
            stubs: [{ module: 'cr:6640', exports: null }],
            probes,
          });
        const original = record('retained-history');
        make('same-record-clear-repopulate', [
          clear('empty', 0),
          {
            id: 'original-identity-return',
            module: factory,
            export: 'createGetterFactories',
            args: [{}],
            result: { method: 'unsafeIdentityGetter', args: [original] },
            retain: { id: 'record', stage: 'result' },
            expected: original,
          },
          read('progress', 'getProgress', ref('record'), 13),
          read('paused', 'getPaused', ref('record'), false),
          read('in-progress', 'getInProgress', ref('record'), true),
          read('same-record-again', 'getProgress', ref('record'), 13),
          clear('identity-and-history-maps', 2),
          clear('second-clear', 0),
          read('retained-record-survives-clear', 'getProgress', ref('record'), 13),
          clear('history-map-repopulated', 1),
          read('paused-after-clear', 'getPaused', ref('record'), false),
          clear('paused-repopulates', 1),
        ]);
        const literals: [Record<string, JsonValue>, JsonValue, boolean, JsonValue][] = [
          [{ realProgress: null }, null, false, true],
          [{ realProgress: 100, fakeProgress: 0 }, 100, false, false],
          [{ realProgress: 99, fakeProgress: 10 }, 100, false, true],
          [{ remainingPausedSeconds: 0 }, 13, true, false],
          [{ remainingPausedSeconds: -1 }, 13, true, false],
          [{ remainingPausedSeconds: 1 }, 13, true, true],
          [{ realProgress: -10, fakeProgress: -2 }, -12, false, true],
          [{ realProgress: 150, fakeProgress: 5 }, 100, false, false],
          [{ fakeProgress: -20 }, -10, false, true],
          [{ incomplete: false }, 13, false, false],
          [{ incomplete: null }, 13, false, null],
          [{ incomplete: 0 }, 13, false, 0],
          [{ incomplete: '' }, 13, false, ''],
          [{ incomplete: 'yes' }, 13, false, true],
          [{ realProgress: absent }, null, false, true],
          [{ fakeProgress: absent }, nan, false, true],
          [{ realProgress: nan }, nan, false, false],
          [{ remainingPausedSeconds: '0' }, 13, true, false],
          [{ remainingPausedSeconds: '1' }, 13, true, true],
        ];
        const literalProbes: Probe[] = [clear('initial', 0)];
        literals.forEach(([patch, progress, paused, inProgress], index) => {
          const input = record(`literal-${index}`, patch);
          literalProbes.push(
            read(`progress-${index}`, 'getProgress', input, progress),
            read(`paused-${index}`, 'getPaused', input, paused),
            read(`in-progress-${index}`, 'getInProgress', input, inProgress),
          );
        });
        literalProbes.push(clear('one-entry-per-id', literals.length), clear('empty-again', 0));
        make('literal-boundaries-and-truthiness', literalProbes);
        make('failed-input-and-arithmetic-recovery', [
          clear('initial', 0),
          fail('missing-argument', []),
          fail('null-data', [null]),
          fail('missing-id', [{ realProgress: 2, fakeProgress: 3 }]),
          fail('null-id', [record(null)]),
          clear('invalid-key-does-not-allocate', 0),
          fail(
            'bigint-mixed-arithmetic',
            [
              record('arithmetic', {
                realProgress: { $type: 'BigInt', value: '1' },
                fakeProgress: 2,
              }),
            ],
            'TypeError',
          ),
          clear('failed-computation-retains-cache-entry', 1),
          read('retry', 'getProgress', record('arithmetic'), 13),
          read('retry-paused', 'getPaused', record('arithmetic'), false),
          clear('retry-entry', 1),
          read(
            'clean-new-input',
            'getProgress',
            record('new', { realProgress: 20, fakeProgress: 5 }),
            25,
          ),
          clear('new-entry', 1),
        ]);
        for (const page of [0, 1]) {
          const generated: Probe[] = [clear('initial', 0)];
          for (let index = 0; index < 32; index++) {
            const real = ((index * 37 + page * 19) % 241) - 60;
            const fake = ((index * 11 + page * 7) % 81) - 20;
            const sum = real + fake;
            generated.push(
              read(
                `sum-${index}`,
                'getProgress',
                record(`generated-${index}`, { realProgress: real, fakeProgress: fake }),
                sum > 100 ? 100 : sum,
              ),
            );
          }
          generated.push(clear('generated-entries', 32), clear('empty', 0));
          make(`generated-arithmetic-${page}`, generated);
        }
        const ids: JsonValue[] = [1, '1', 0, false, '', 'odd\0\n🌍', 'x'.repeat(16384)];
        const keyed: Probe[] = [clear('initial', 0)];
        ids.forEach((id, index) =>
          keyed.push(
            read(
              `id-${index}`,
              'getProgress',
              record(id, { realProgress: index, fakeProgress: 1 }),
              index + 1,
            ),
          ),
        );
        keyed.push(clear('stringified-id-collision', ids.length - 1), clear('second-clear', 0));
        make('fresh-record-id-keying-and-large-ids', keyed);
      }
  return cases;
}
