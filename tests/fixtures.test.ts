import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFixtures } from '../support/fixtures.ts';

test('versioned fixture bytes, schema fields and observation metadata agree', async () => {
  const fixtures = await validateFixtures();
  assert.equal(fixtures.length, 8);
  assert.equal(
    new Set(fixtures.map((entry) => `${entry.testCase.id}@${entry.testCase.version}`)).size,
    8,
  );
  for (const entry of fixtures) assert.match(entry.sha256, /^[a-f0-9]{64}$/);
});
