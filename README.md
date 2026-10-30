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

Current inventories use analyzer version 5, including reviewed literal loader
`.call` forms and explicit gaps for bound, dynamic, escaped or mutated loaders.
The default logical work limit remains 2,000,000. Inventory refreshes preserve case
plans and original source inputs; they create no execution evidence. Historical
results keep their original runtime and analyzer identities. Unknown gate domains,
budget-blocked graphs and original provider/bootstrap gaps remain unresolved.

The [original enumeration suite](docs/fb-enumerate.md) additionally requires an explicitly configured private source cache. Its cases select a known producer hash; the reviewed adapter admits and executes the original fragment before its actual consumers. Public metadata stores source identities and coverage limits, never vendor source bytes. Missing cache configuration visibly skips that capability.

The [group storage-input suite](docs/group-abprops-storage-input.md) tests the original row transformer and cache staging with synthetic storage-shaped inputs. It does not query storage or establish persistence or transaction behavior.

The [bundled NaCl suite](docs/bundled-nacl.md) runs fixed deterministic cryptographic primitive vectors in the source realm. WhatsApp provider binding and protocol use remain unproven, and the full AST inventory remains budget-blocked.

The [curve-key policy suite](docs/curve-key-policy.md) exercises original WA range, subgroup and point-arithmetic helpers. Its helper inventory is complete within that selected scope; caller, provider and protocol acceptance remain separate.

The [WAM event-state suite](docs/wam-event-state.md) executes original event classes with the separately admitted original Babel producer. It covers partial field updates, retries, timers and precommit validation; delivery and full bootstrap/configuration acceptance remain open.

The [original Wid-error suite](docs/wid-original-errors.md) exercises real error inheritance and malformed-string factory failures, with validator controls and retained cache identities. It excludes nonstring factory inputs, inherited cache keys and universal rejection claims.

The [WAM channel-state suite](docs/wam-channel-state.md) exercises the original singleton's independent maps, close/resume histories and retained identity. It supplies no channel or sink implementation and establishes no delivery or restart acceptance.

The [custom-error suite](docs/custom-error-state.md) constructs original classes and composes retained real errors into aggregates. A module probe can explicitly select `construct:true` with a result projection or error assertion. Construction returns its object synchronously; ordinary calls and projected methods keep their existing await behavior. Construction cannot share a probe with method or pending controls, and references retain their existing case-wide pending exclusion. This local transport extension does not add production suite execution.

The eight existing fixtures retain their IDs, versions and exact bytes after moving out of `tests/`. Historical observations and remaining gaps are recorded in [coverage.json](coverage.json). A passing assertion covers its exact inputs, source, configuration and runtime. It does not establish whole-client or library compliance, server acceptance or cryptographic security.

Discovered using a monitor developed by @purpshell at polymorfa.com

Licensed under [MIT](LICENSE).

The [history progress getter suite](docs/history-progress-getters.md) exercises original getter caches, repeated reads, clearing, failures and retry across eight established boolean assignments. Inputs remain explicit synthetic model-shaped records; actual model updates, persistence and the original ABProps resolver are separate gaps.

The [generic state-manager suite](docs/generic-state-manager.md) executes original state replacement and internal subscriptions through bounded pending controls. It covers waiter ordering, strict matches, skipped values, generated updates and returned-object identity; the original Promise-provider binding remains unresolved behind an explicit fallback fixture.

The separate [Baileys JID leaf suite](docs/baileys-jid.md) exercises one exact import-free implementation component through a reviewed local Subject. Its named-library metadata is outside the WA corpus importer; local source observations do not establish registered service execution, full-package behavior or protocol compliance.

The separate [whatsapp-web.js Reaction/Base suite](docs/wwebjs-reaction.md) exercises original constructors, patch/clone lifetimes and ID normalization at one exact commit. Both original CommonJS bodies remain unchanged; browser/client services and full-library compliance are outside this local component scope.

The [Semaphore reservation suite](docs/semaphore-state.md) executes original acquisition counters, one immediate real release and held-object distinction across bounded capacities. Separate pending-only cases inspect unresolved waits; later release, FIFO, repeated release and fairness remain unsupported lifecycle observations.

The [byte-buffer suite](docs/byte-buffer.md) covers original Latin-1 conversions, chunk boundaries, offset views, error recovery and returned-buffer identities. The complementary [byte-array suite](docs/byte-array.md) covers integer bytes, sliced views and byte equality with independent generated oracles. Private cursor APIs and unobserved ownership remain outside scope.

The [original knob-provider suite](docs/knob-provider-state.md) executes real raw reads, first-write cache state, source-returned metrics mutation, failed insertion and retry. No knob fixture replaces the provider. Staged keys and values do not establish backend assignments or close unknown consumer domains.

The [original gkx-provider suite](docs/gkx-provider-state.md) executes real first-write and logged-read state, no-op reset-named methods, source-returned metrics and failed updates. Raw results remain uncoerced; full environment/bootstrap diagnostics and unknown assignment domains remain explicit.

The [original qex-provider suite](docs/qex-provider-state.md) observes first-read exposure ordering through the real in-memory queue, flush lifetimes and failed-update recovery. The [SimpleHook suite](docs/simple-hook-state.md) covers malformed-data registration, membership, removal and recovery through actual public methods. Queue transport, valid callbacks and once wrappers remain unaccepted.

Selected GKX Boolean fixtures define modeled input products. Original GKX assignment domains remain unknown; recognized Boolean fixture types do not establish closed server domains.

The [Comet cache suite](docs/comet-lru-state.md) characterizes positive-capacity `new create(...)`, clock-driven TTL boundaries, lazy expiry and read recency. The [insertion-occurrence cache suite](docs/fifo-cache-state.md) characterizes the original `LRUCache` constructor's FIFO eviction and duplicate-key lifetimes. Capacity, TTL, key and history domains remain unbounded.

Boolean knob fixture hints also do not close original assignment domains. Reviewed explicit domains are required for planning; original typed-knob failures and raw unknown domains remain separate observations.

The [SmallQueue suite](docs/small-queue-state.md) executes FIFO, peek/removal and real object lifetimes, native array/typed-view list insertion, malformed-list recovery and bounded generated histories. The 2,048-item case observes five prefix values and counts only.

Gate planning requires explicit reviewed finite domains for every provider kind. Genuine Boolean definition/parser facts remain useful evidence for scoped models; method/type hints alone do not close initialized provider or raw server domains.
