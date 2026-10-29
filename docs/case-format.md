# Case format

A case is JSON, with a stable `id`, a positive `version`, a WhatsApp source `module`, an exported function, and named probes. The schema lives in `schemas/case.schema.json`.

Each probe has JSON `args` and either `expected` or `throws: {name?, message?}`. Typed values use these descriptors:

| Value | Descriptor |
| --- | --- |
| Undefined | `{"$type":"undefined"}` |
| Date | `{"$type":"Date","value":"2026-01-01T00:00:00.000Z"}` |
| Bytes | `{"$type":"Uint8Array","value":[0,1,255]}` |
| Array buffer | `{"$type":"ArrayBuffer","value":[0,1,255]}` |
| Big integer | `{"$type":"BigInt","value":"123"}` |
| Non-finite number | `{"$type":"number","value":"NaN"}` (also `Infinity`, `-Infinity`) |
| Explicit dependency function stub | `{"$type":"function","returns":<JSON value>}` or `{"$type":"function","throws":{"name":"Error","message":"fixture"}}` |

Stubs are data descriptors, not JavaScript source. Record every stub and whether it replaces an actual dependency. An unknown dependency fails loading. It must not silently become a stub.

`context` fixes the clock, timezone, random seed and gate fixtures. Gate defaults extracted from a client bundle and assignments observed for an account are different facts. Compare runs under the same context; do not infer a global rollout from one fixture.

`sourceExpectation` records source references and the expected comparison scope. A case preserving a baseline can intentionally detect a later additive change. Do not rewrite its expectation to erase the history. Add a new version when documenting the new contract.

A portable adapter accepts `{schemaVersion:1,testCase,caseSha256,contextSha256}` and returns actual probe observations with the same identity, exact implementation commit and runtime version. Recompute assertions from the observations. Do not trust a bare `pass` returned by an adapter.

Outcomes distinguish assertions preserved, assertion mismatch, missing dependency, unsupported capability, runtime failure and timeout. A mismatch becomes revision evidence only after the baseline passes with the same test/context/runtime. Tests do not establish server acceptance, complete feature support or security certification.
