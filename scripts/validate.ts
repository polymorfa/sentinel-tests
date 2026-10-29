import { validateFixtures } from '../support/fixtures.ts';
const entries = await validateFixtures();
console.log(
  JSON.stringify(
    {
      validated: entries.length,
      cases: entries.map((entry) => ({
        id: `${entry.testCase.id}@${entry.testCase.version}`,
        sha256: entry.sha256,
      })),
      runtimeExecution: false,
    },
    null,
    2,
  ),
);
