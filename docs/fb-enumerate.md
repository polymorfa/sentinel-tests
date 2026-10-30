# Original enumeration asset and iterable consumers

The `fb-enumerate` suite executes the pinned original `FB_enumerate` producer before the original `enumerate`, `equalsIterable` and selected `WAIterableOperators` modules. The producer is a 2,930-byte source slice, identified by its source hash and a verified raw-parent revision, hash, size and byte range. Public metadata contains those identities, never the source bytes or local paths.

The adapter requires an explicit private cache root:

```sh
SENTINEL_BOOTSTRAP_SOURCE_ROOT=/absolute/private/bootstrap-root \
SENTINEL_SUBJECT_MODULE=../sentinel/examples/core-subject.ts \
SENTINEL_DIAGNOSTIC_PROCESS=enabled \
bun test tests/fb-enumerate.test.ts
```

Each selected raw member lives at `ROOT/REVISION/RAW_SHA256.js`. The adapter checks the declared filename, containment, bounded size, raw hash and registered source span. The case selects only a known asset kind and source hash. It cannot provide code, paths or URLs. Missing root configuration leaves this suite's capability unadvertised; invalid configured bytes fail explicitly. Existing suites do not acquire a bootstrap requirement.

The selected source observations cover arrays, strings, byte views and ordinary object fallback ordering. Direct string iteration observes code points; generic string fallback observes UTF-16 indexed entries. The generic fallback captures keys when created but reads values lazily. Array `push` and `shift` on actual retained values expose those two properties without adding a custom iterator or callback. This does not cover arbitrary plain-object accessors or property mutation.

`equalsIterable` observations describe the original strict comparator and its identity fast path. Two distinct nonempty objects produce distinct entry tuples, so equal-looking objects can compare false. A string's UTF-16 length can also differ from an equivalent array of code points before iteration begins. These are source characterizations, not a general deep-equality contract.

Actual retained iterators are advanced through fresh original `WAIterableOperators.iteratorFromArray` consumers. Remaining-stream equality and an early mismatch's effect on iterator state are observed directly. This is a chosen diagnostic consumer, not evidence about a production caller or scheduler.

Both revisions retain all eight Metro source modules and the separate asset in analyzer v4 inventories. No supported gate reads or unresolved dependencies appear in this selected scope, so the established finite gate assignment is empty. Numeric, string, object and sequence domains remain unbounded; the authored cases are bounded observations.

This does not execute the whole raw bundle, admit original Babel helper execution, or establish browser, provider, account, container, scheduling or named-library acceptance. Diagnostic process runs report `isolated:false`. Legacy Babel compatibility helpers remain separate fixtures and are never relabelled as original source assets.
