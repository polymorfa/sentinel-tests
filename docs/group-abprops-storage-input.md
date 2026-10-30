# Group ABProps storage-shaped inputs

This suite invokes the original `WAWebGroupABPropsUpdateFromStorage.updateSingleGroupABPropsCache(group, rows)` export. Synthetic storage-shaped rows flow through the original config lookup, parser, cache and public group reader. It never calls the full storage updater or acquires rows from a database.

The 14 cases contain 332 probes per source revision, using two selected `gkx16539` fixture contexts. Literal expectations cover boolean spellings, decimal integer prefixes, nullish defaults and overrides, code coercion, duplicate ordering, unknown-code filtering, malformed rows, retries, clear/reinitialization and two group keys. The transformer stages every converted row before calling the cache. A malformed later row preserves prior cache state; this establishes staging behavior, not a storage transaction or rollback guarantee.

One history deliberately creates a hidden prefix by failing the actual direct cache bulk method. It then shows that a malformed transformer update leaves that prefix hidden, while an empty update in another group resolves shared readiness and makes the prefix visible through the original reader. The direct cache call is explicit setup, not storage acquisition.

The complete selected dependency graphs retain 160/159 available module pins across revisions 1051710191/1051908825. Their bounded AST inventories retain all 27 unresolved diagnostics per revision. The nine established boolean GKX domains form 512 assignments, exceeding the standing 256-assignment execution budget; that subset is not executed. Five knob domains remain unknown, so total configuration cardinality is unknown. The two executed contexts are characterization only.

Missing providers use explicit throwing fixture boundaries, with `cr:6640 = null` selecting the original Promise fallback. The parser, cache, reader and readiness are actual archived implementations. Selected Babel helpers remain compatibility fixtures. Exposure delivery, resolver/server assignments, Dexie/IndexedDB, persistence, accounts, network, containers, production scheduling and library parity remain unproven. Numeric inputs, group keys and operation sequences are unbounded; the finite examples do not establish exhaustive input coverage.

Run portable checks with `bun test tests/group-abprops-storage-input.test.ts`. A reviewed subject adapter advertising `wa-internal:group-abprops-storage-input` is required for implementation tests. Diagnostic process execution reports no container isolation.

At both pins, the updater's printed source lines 10–25 select the configuration
and convert each row, while lines 49–57 stage the list before the single cache
call. `WAWebABPropsParseConfigValue` lines 3–4 define the literal conversion
rules. The separate full storage path at updater lines 29–48 is not invoked.
