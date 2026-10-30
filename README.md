# Sentinel test repository

TypeScript tests for WhatsApp behavior and the libraries that implement it. They use the `node:test` API under Bun, ordinary assertions, setup/teardown and mocks. Reusable inputs and historical observation metadata live in JSON files under `fixtures/` and `metadata/`.

Run the artifact and subject-contract unit tests with Bun 1.4.4:

```sh
bun install --frozen-lockfile
bun check
bun lint
bun fmt --check
bun test
bun run validate
```

The implementation suites visibly skip without a selected capable subject. To execute them, explicitly provide a reviewed adapter module:

```sh
SENTINEL_SUBJECT_MODULE=/absolute/path/to/subject.ts bun test
```

The adapter exports `createSubject()` and returns the typed [Subject interface](support/types.ts). See [the test guide](docs/case-format.md). The selected module can call an archived client runtime or real library APIs. This repository supplies no default account, credentials, host path or executable vendor code.

Tests are TypeScript programs. They can add native library tests, unit mocks, integration setup and assertions without encoding that logic in a data language. The shared Subject contract is one optional way to reuse inputs across implementations. JSON fixtures describe reusable values and historical expectations; they are not the test framework.

Executable suites cover generated binary and hexadecimal inputs, byte packing/cursors, custom Base32, WAM encoding, ABProps parsing, exposure keys, padding/key representation, stateful retry backoff, address/media parsing and actual protobuf encoding/decoding. Their reviewed oracles, exact source observations, gate inventories and exclusions live under `metadata/suites/`. `bun run validate` checks these records as well as the historical fixtures; validation does not execute WhatsApp.

The [original enumeration suite](docs/fb-enumerate.md) additionally requires an explicitly configured private source cache. Its cases select a known producer hash; the reviewed adapter admits and executes the original fragment before its actual consumers. Public metadata stores source identities and coverage limits, never vendor source bytes. Missing cache configuration visibly skips that capability.

The eight existing fixtures retain their IDs, versions and exact bytes after moving out of `tests/`. Historical observations and remaining gaps are recorded in [coverage.json](coverage.json). A passing assertion covers its exact inputs, source, configuration and runtime. It does not establish whole-client or library compliance, server acceptance or cryptographic security.

Discovered using a monitor developed by @purpshell at polymorfa.com

Licensed under [MIT](LICENSE).
