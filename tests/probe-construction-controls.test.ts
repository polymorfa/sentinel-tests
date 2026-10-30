import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProbeControls } from '../support/probe-controls.ts';

const reference = (value: string) => ({ $type: 'reference', value });
const construction = (
  id = 'make',
  patch: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  args: [],
  construct: true,
  result: { method: 'read' },
  expected: null,
  ...patch,
});
const scenario = (probes: unknown[] = [construction()], patch: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  id: 'probe-construction-controls',
  version: 1,
  module: 'Example',
  export: 'Factory',
  probes,
  ...patch,
});
const reject = (value: unknown) => assert.throws(() => validateProbeControls(value));

test('per-probe construction admits default and explicit registered-module selectors', () => {
  validateProbeControls(scenario());
  validateProbeControls(
    scenario([
      construction('default'),
      construction('same-module', { export: 'Errors.CustomError' }),
      construction('other-module', { module: 'Other', export: 'CustomError' }),
      { id: 'ordinary-call', args: [], export: 'read', expected: 7 },
    ]),
  );
  // This validator admits transport controls, not JavaScript constructor/type behavior.
  validateProbeControls(scenario([construction('opaque-runtime-value', { expected: 1 })]));
});

test('construction composes with earlier reference arguments and explicit retention stages', () => {
  validateProbeControls(
    scenario([
      construction('original', {
        retain: { id: 'original', stage: 'call' },
        result: { method: 'toString' },
        expected: 'original',
      }),
      construction('copy', {
        module: 'Other',
        export: 'Wrapper',
        args: [{ cause: [reference('original')] }],
        result: { method: 'copy', args: [reference('original')] },
        retain: { id: 'copy', stage: 'result' },
      }),
      construction('compare', {
        args: [reference('copy')],
        result: { identityWith: 'original' },
        expected: false,
      }),
    ]),
  );
});

test('only the literal true construction flag is admitted', () => {
  for (const flag of [false, null, {}, [], 0, 1, 'true'])
    reject(scenario([construction('invalid', { construct: flag })]));
  validateProbeControls(scenario([{ id: 'call', args: [], expected: null }]));
});

test('case-level instances and method selectors cannot be combined with per-probe construction', () => {
  reject(scenario([construction()], { construct: { args: [] } }));
  reject(scenario([construction('method', { method: 'read' })]));
  reject(scenario([construction('method', { method: 'read' })], { construct: { args: [] } }));
});

test('pending starts, reads and case-wide reference exclusions retain their boundaries', () => {
  for (const action of ['start', 'inspect', 'await']) {
    const prefix =
      action === 'start'
        ? []
        : [
            {
              id: 'start',
              args: [],
              pending: { id: 'job', action: 'start' },
              expected: { $type: 'undefined' },
            },
          ];
    reject(scenario([...prefix, construction('pending', { pending: { id: 'job', action } })]));
  }
});

test('construction does not admit extra controls, malformed reference arguments or reserved selectors', () => {
  for (const patch of [
    { metadata: { construct: true } },
    { constructArgs: [] },
    { args: {} },
    { args: null },
    { module: 'Other' },
    { export: 'Factory.constructor' },
    { export: 'Factory.__proto__' },
    { export: 'prototype' },
    { result: { method: '__proto__' } },
    { result: { method: 'constructor' } },
    { args: [{ $type: 'reference', value: 'original', extra: true }] },
  ])
    reject(scenario([construction('invalid', patch)]));
});

test('constructor references require an earlier probe and cannot refer to current retention', () => {
  reject(
    scenario([
      construction('forward', { args: [reference('later')] }),
      construction('later', {
        retain: { id: 'later', stage: 'call' },
      }),
    ]),
  );
  reject(
    scenario([
      construction('self', {
        args: [reference('self')],
        retain: { id: 'self', stage: 'call' },
      }),
    ]),
  );
  reject(
    scenario([
      construction('self-projection', {
        result: { method: 'copy', args: [reference('self')] },
        retain: { id: 'self', stage: 'call' },
      }),
    ]),
  );
  reject(
    scenario([
      construction('self-identity', {
        result: { identityWith: 'self' },
        retain: { id: 'self', stage: 'call' },
      }),
    ]),
  );
});

test('construction preserves retention-stage, duplicate-ID and exception exclusions', () => {
  for (const retain of [
    { id: 'item' },
    { id: 'item', stage: 'later' },
    { id: 'item', stage: 'call', extra: true },
    { id: 'item', stage: 'result' },
    { id: 'constructor', stage: 'call' },
    { id: 'x'.repeat(129), stage: 'call' },
  ]) {
    const probe = construction('invalid', { retain });
    if (retain.stage === 'result') delete probe.result;
    reject(scenario([probe]));
  }
  reject(
    scenario([
      construction('one', { retain: { id: 'same', stage: 'call' } }),
      construction('two', { retain: { id: 'same', stage: 'call' } }),
    ]),
  );
  reject(
    scenario([
      {
        id: 'throws',
        construct: true,
        args: [],
        throws: { name: 'Error' },
        retain: { id: 'exception', stage: 'call' },
      },
    ]),
  );
  reject(
    scenario([
      construction('original', { retain: { id: 'original', stage: 'call' } }),
      construction('boolean-result', {
        result: { identityWith: 'original' },
        retain: { id: 'boolean', stage: 'result' },
      }),
    ]),
  );
});

test('construction cases remain limited to one through128 probes and case-local references', () => {
  reject(scenario([]));
  const maximum = Array.from({ length: 128 }, (_, index) =>
    construction(`make-${index}`, {
      retain: { id: `object-${index}`, stage: 'call' },
      ...(index ? { args: [reference(`object-${index - 1}`)] } : {}),
    }),
  );
  validateProbeControls(scenario(maximum));
  reject(scenario([...maximum, construction('overflow')]));
  reject(scenario([construction('separate-case', { args: [reference('object-127')] })]));
});

test('construction requires an explicit result projection unless an application throw is expected', () => {
  const opaque = construction('no-projection');
  delete opaque.result;
  reject(scenario([opaque]));
  validateProbeControls(
    scenario([
      {
        id: 'constructor-error',
        construct: true,
        args: [],
        throws: { name: 'TypeError' },
      },
    ]),
  );
});
