import assert from 'node:assert/strict';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value: object, key: string) => Object.hasOwn(value, key);
const label = (value: unknown, max = 256): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= max &&
  ![...value].some((character) => character.charCodeAt(0) < 32);
const ordinary = (value: unknown): value is string =>
  label(value) &&
  /^[A-Za-z_$][\w$]*$/.test(value) &&
  !['constructor', 'prototype', '__proto__'].includes(value);
const referenceId = (value: unknown): value is string =>
  label(value, 128) && !['constructor', 'prototype', '__proto__'].includes(value);
const exportPath = (value: unknown) => label(value) && value.split('.').every(ordinary);
const keys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));

function references(root: unknown, retained: ReadonlySet<string>, allowed = false): boolean {
  const stack = [{ value: root, allowed, depth: 0 }];
  let found = false,
    nodes = 0;
  while (stack.length) {
    const current = stack.pop()!;
    assert.ok(++nodes <= 1_000_000 && current.depth <= 512, 'Reference tree exceeds its budget');
    const value = current.value;
    if (value === null || typeof value !== 'object') continue;
    if (record(value) && value.$type === 'reference') {
      assert.ok(current.allowed, 'References are only allowed in probe arguments');
      assert.ok(
        keys(value, ['$type', 'value']) &&
          Object.keys(value).length === 2 &&
          referenceId(value.value),
        'Invalid reference marker',
      );
      assert.ok(retained.has(value.value), 'References require an earlier retained probe');
      found = true;
      continue;
    }
    const childAllowed = current.allowed && !(record(value) && value.$type === 'function');
    for (const item of Object.values(value))
      stack.push({ value: item, allowed: childAllowed, depth: current.depth + 1 });
  }
  return found;
}

/** Validate transport controls only; this never executes code or proves retained runtime types. */
export function validateProbeControls(value: unknown): void {
  assert.ok(
    record(value) && label(value.module) && exportPath(value.export),
    'Invalid module/export selector',
  );
  if (value.context !== undefined) {
    assert.ok(record(value.context), 'Invalid context');
    if (value.context.bootstrap !== undefined)
      assert.ok(
        record(value.context.bootstrap) &&
          Object.entries(value.context.bootstrap).every(
            ([kind, hash]) =>
              ['babel-helpers', 'fb-enumerate'].includes(kind) &&
              typeof hash === 'string' &&
              /^[a-f0-9]{64}$/.test(hash),
          ),
        'Bootstrap selectors require known kinds and exact source hashes',
      );
  }
  if (value.construct !== undefined)
    assert.ok(
      record(value.construct) &&
        Array.isArray(value.construct.args) &&
        keys(value.construct, ['args']),
      'Invalid constructor arguments',
    );
  assert.ok(
    Array.isArray(value.probes) && value.probes.length > 0 && value.probes.length <= 128,
    'Case requires 1..128 probes',
  );
  const probeIds = new Set<string>(),
    pendingIds = new Set<string>(),
    retained = new Set<string>();
  const { probes: _probes, ...outsideProbes } = value;
  references(outsideProbes, retained);
  let usesReferences = false;
  for (const probe of value.probes) {
    assert.ok(
      record(probe) && label(probe.id) && !probeIds.has(probe.id) && Array.isArray(probe.args),
      'Each probe needs unique id and args',
    );
    assert.ok(
      keys(probe, [
        'id',
        'args',
        'module',
        'export',
        'method',
        'clock',
        'result',
        'pending',
        'retain',
        'expected',
        'throws',
      ]),
      'Unknown probe control',
    );
    probeIds.add(probe.id);
    const { args, result, ...outsideArgs } = probe;
    references(outsideArgs, retained);
    usesReferences = references(args, retained, true) || usesReferences;
    if (result !== undefined && record(result)) {
      const { args: resultArgs, ...outsideResultArgs } = result;
      references(outsideResultArgs, retained);
      usesReferences = references(resultArgs, retained, true) || usesReferences;
    }
    assert.notEqual(
      own(probe, 'expected'),
      own(probe, 'throws'),
      'Probe requires expected or throws',
    );
    if (own(probe, 'throws'))
      assert.ok(
        record(probe.throws) &&
          Object.keys(probe.throws).length > 0 &&
          Object.entries(probe.throws).every(
            ([key, item]) => ['name', 'message'].includes(key) && typeof item === 'string',
          ),
        'Invalid expected error',
      );
    if (probe.export !== undefined)
      assert.ok(
        value.construct === undefined && exportPath(probe.export) && probe.method === undefined,
        'Export probe requires an unconstructed module',
      );
    if (probe.module !== undefined)
      assert.ok(
        label(probe.module) &&
          probe.export !== undefined &&
          value.construct === undefined &&
          probe.method === undefined,
        'Module requires explicit export and no constructor',
      );
    if (probe.method !== undefined)
      assert.ok(
        value.construct !== undefined && ordinary(probe.method),
        'Method requires constructed instance and ordinary name',
      );
    if (probe.clock !== undefined)
      assert.ok(
        typeof probe.clock === 'string' &&
          /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(probe.clock) &&
          Number.isFinite(Date.parse(probe.clock)),
        'Invalid probe clock',
      );
    if (probe.result !== undefined) {
      assert.ok(record(probe.result), 'Invalid result projection');
      if (own(probe.result, 'identityWith')) {
        assert.ok(
          Object.keys(probe.result).length === 1 &&
            referenceId(probe.result.identityWith) &&
            retained.has(probe.result.identityWith),
          'Identity requires an earlier retained probe',
        );
        usesReferences = true;
      } else {
        assert.ok(
          ordinary(probe.result.method) &&
            (probe.result.args === undefined || Array.isArray(probe.result.args)) &&
            keys(probe.result, ['method', 'args']),
          'Invalid result method',
        );
      }
    }
    if (probe.retain !== undefined) {
      assert.ok(
        record(probe.retain) &&
          referenceId(probe.retain.id) &&
          typeof probe.retain.stage === 'string' &&
          ['call', 'result'].includes(probe.retain.stage) &&
          keys(probe.retain, ['id', 'stage']) &&
          Object.keys(probe.retain).length === 2 &&
          !retained.has(probe.retain.id) &&
          retained.size < 128 &&
          !own(probe, 'throws'),
        'Invalid retained reference',
      );
      if (probe.retain.stage === 'result')
        assert.ok(
          record(probe.result) && ordinary(probe.result.method),
          'Result retention requires a method projection',
        );
      usesReferences = true;
    }
    if (probe.pending !== undefined) {
      assert.ok(
        record(probe.pending) &&
          label(probe.pending.id, 128) &&
          typeof probe.pending.action === 'string' &&
          ['start', 'inspect', 'await'].includes(probe.pending.action) &&
          keys(probe.pending, ['id', 'action', 'property']),
        'Invalid pending operation',
      );
      if (probe.pending.property !== undefined)
        assert.ok(
          probe.pending.action === 'start' &&
            value.construct !== undefined &&
            ordinary(probe.pending.property) &&
            probe.args.length === 0 &&
            probe.method === undefined &&
            probe.export === undefined &&
            probe.module === undefined &&
            probe.result === undefined,
          'Pending property requires a constructed own Promise field',
        );
      if (probe.pending.action === 'start') {
        assert.ok(!pendingIds.has(probe.pending.id), 'Duplicate pending handle');
        pendingIds.add(probe.pending.id);
      } else {
        assert.ok(pendingIds.has(probe.pending.id), 'Pending handle requires earlier start');
        assert.ok(
          probe.args.length === 0 &&
            probe.module === undefined &&
            probe.export === undefined &&
            probe.method === undefined &&
            probe.result === undefined,
          'Pending read has no callable selectors',
        );
      }
    }
    if (
      value.construct !== undefined &&
      !(
        record(probe.pending) &&
        (probe.pending.action !== 'start' || probe.pending.property !== undefined)
      )
    )
      assert.ok(probe.method !== undefined, 'Constructed scenarios require explicit method');
    // Current-probe retention cannot satisfy a current-probe reference/identity.
    if (record(probe.retain)) retained.add(String(probe.retain.id));
  }
  assert.ok(
    !usesReferences || pendingIds.size === 0,
    'Pending operations cannot share a reference case',
  );
}
