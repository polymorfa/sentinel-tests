import { validateFixtures } from '../support/fixtures.ts';
import { validateSuites } from '../support/suites.ts';
const entries = await validateFixtures();
const suites = await validateSuites();
console.log(
  JSON.stringify(
    {
      validated: entries.length,
      cases: entries.map((entry) => ({
        id: `${entry.testCase.id}@${entry.testCase.version}`,
        sha256: entry.sha256,
      })),
      runtimeExecution: false,
      suites: suites.map(({ id, version, file, capability, observations }) => ({
        id,
        version,
        file,
        capability,
        revisions: observations.map((item) => item.revision),
      })),
    },
    null,
    2,
  ),
);
