# Writing and running tests

Tests are authored TypeScript in `tests/*.test.ts`. Bun 1.4.4 runs them through the `node:test` API with `node:assert/strict` and ordinary setup, teardown, loops and mocks. A library-specific test can use that library's native APIs. The shared Subject interface supports cases where several implementations can consume the same synthetic inputs.

## Select an implementation explicitly

Set `SENTINEL_SUBJECT_MODULE` to a reviewed local module path or file URL. It must export:

```ts
import type { Subject } from './support/types.ts';

export async function createSubject(): Promise<Subject> {
  // Create an isolated runtime or real library instance here.
  return {
    id: 'exact-implementation-and-source-identity',
    capabilities: [],
    async runCase(testCase) {
      // Call the actual implementation and return actual probe observations.
      return { status: 'unsupported' };
    },
    async close() {
      // Await owned resource teardown here.
    },
  };
}
```

The import above is relative to this repository root. An adapter elsewhere imports the same exported types using its chosen project layout. A capability is a precise operation claim. The `wa-internal:pq-gating` capability admits the actual archived PQ selector suite; a library that does not expose that operation leaves the suite visibly skipped. Do not invent support or pass data through a replacement implementation.

Each `runCase` starts a fresh scenario, retaining state only across that case's own probes. This keeps module caches and stores from leaking between tests.

For a real class, set `construct:{args:[…]}` and name a `method` on each probe. The subject constructs one instance and preserves its state through the ordered methods. Without construction, a probe can select another module `export`, allowing setter/getter sequences. A subject that cannot execute that operation reports unsupported; it must not substitute a passing implementation.

Optional per-probe `clock` timestamps advance or rewind scenario Date values. Actual applied timestamps return in `clockUpdates`; wall time and timers remain separate. Typed Uint8Array inputs can include `byteOffset` and `byteLength`, with `value` containing the full backing bytes. Snapshots compare logical bytes and cannot prove alias identity.

`runCase` returns a status and actual `{id, actual}` or `{id, thrown}` observations. Tests recompute their assertions from those observations. A bare `pass` flag is insufficient. Return `unsupported` for an unavailable operation; unexpected load/runtime failures fail the test.

An optional `compareCase(testCase)` runs a comparable source pair and returns `{status, baseline, candidate}`. The fixture suite checks the recorded expected comparison, including the intentional explicit-date mismatch. It never rewrites an expected value because a new revision differs. `close()` releases the subject's owned resources after each suite file.

No subject module loads when the environment variable is absent. The default `bun test` command runs artifact and adapter-contract unit tests and visibly skips reference suites. It does not establish WhatsApp execution or library compliance.

Executable suite metadata lives under `metadata/suites/`. Each record names its TS file and capability, reviewed oracle, trial domain, source hashes/citations, AST gate inventory and exclusions. Source observations are revision-specific. A complete finite gate assignment does not make an unbounded input generator exhaustive. The metadata validator rejects unresolved inventories that claim completeness.

## Reusable fixture data

The eight existing `.case.json` files now live under `fixtures/`. Their exact bytes, IDs and versions are unchanged. The schema is [case.schema.json](../schemas/case.schema.json); [types.ts](../support/types.ts) defines the shared TypeScript input/output types. Fixtures carry module/export selectors, named inputs, fixed context and expected observations. Suite logic remains in TypeScript.

Typed values use these descriptors:

| Value                          | Descriptor                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Undefined                      | `{"$type":"undefined"}`                                                                                               |
| Date                           | `{"$type":"Date","value":"2026-01-01T00:00:00.000Z"}`                                                                 |
| Bytes                          | `{"$type":"Uint8Array","value":[0,1,255]}`                                                                            |
| Array buffer                   | `{"$type":"ArrayBuffer","value":[0,1,255]}`                                                                           |
| Big integer                    | `{"$type":"BigInt","value":"123"}`                                                                                    |
| Non-finite number              | `{"$type":"number","value":"NaN"}`                                                                                    |
| Fixed external dependency stub | `{"$type":"function","returns":<JSON value>}` or `{"$type":"function","throws":{"name":"Error","message":"fixture"}}` |

A declared stub supplies an explicit external input. It cannot calculate the answer being tested. Record whether it shadows a real dependency. Missing dependencies stay load failures.

`context` records clock, timezone, seed and injected gate fixtures. `gateUpdates` can apply a stated overlay before a named probe. The PQ TypeScript suite runs all four boolean assignments and both cached-decision update directions. Cache tests also require the applied-update trace and confirm that the selector did not reread after its first probe. It tests the selector under synthetic gate inputs; it does not test the original ABProps resolver, key exchange, live cohort assignment or server availability.

The UTF-8 property suite compares 2,048 seeded Unicode strings with an independent `TextEncoder` oracle and checks odd size boundaries through 65,537 bytes. It requires `wa-internal:binary-utf8`. These generated inputs extend the historical fixtures; they do not exhaust all possible strings.

Consumers that import only fixture JSON must not execute repository scripts, tests or adapter modules. Running the authored suites is a separate explicit action. Keep vendor source, original captures and credentials out of this repository.
