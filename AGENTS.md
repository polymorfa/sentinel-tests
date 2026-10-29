# Test repository

- Write TypeScript `node:test` suites; JSON is reusable fixture data and metadata.
- Use Bun 1.4.4. Run `bun check`, `bun lint`, `bun test` and `bun run validate`.
- Keep fixture IDs stable; increase versions when assertions change.
- Record exact source, gate context, runtime and coverage limits.
- Use synthetic data. Never commit credentials, accounts, sessions or vendor bundles.
- Mocks test the stated unit contract; they do not prove WhatsApp or library behavior.
