# Contributing tests

Write TypeScript suites under `tests/` using `node:test`. Use normal assertions, setup/teardown and mocks where they help test the actual behavior. Library-specific suites can import the library directly or use an explicitly selected adapter. Do not replace the behavior being tested with a mock and then claim implementation coverage.

Reusable synthetic data belongs under `fixtures/`; source references and historical observations belong under `metadata/`. Existing case IDs and versions are immutable. Moving a fixture does not change its assertions or justify increasing its version. Changed expectations require a new version and an explanation.

Record exact source revisions, dependency and variant hashes, gate contexts, runtime and isolation when reporting behavior. Gate matrices need AST-derived dependency inventories and every assignment of their established finite domains. A skipped or unsupported operation is an explicit coverage gap.

Run `bun check`, `bun lint`, `bun test` and `bun run validate` with Bun 1.4.4. Reference suites execute only after an explicit `SENTINEL_SUBJECT_MODULE` selection. Keep source-only evidence, assertion mismatch, runtime failure and actual service acceptance separate.

Keep issues and pull requests brief. Explain the changed behavior and link the evidence. Follow each library's style. Never commit vendor bundles, credentials, accounts, session captures, private findings or internal operator policy.
