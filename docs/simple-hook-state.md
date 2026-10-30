# SimpleHook malformed-data state

This suite executes 14 cases with 219 probes per revision against original `SimpleHook.SimpleHook` at WhatsApp revisions 1051710191 and 1051908825. The selected actual-source run passed 15 tests and produced 14 unchanged comparisons. A private observer retained 28 full content-addressed records before assertions; all 28 frozen files and all oracles stayed unchanged. Fresh workers used explicit diagnostic process mode (`isolated:false`). Inputs are deliberately noncallable data: these are partial malformed-data lifecycle observations, not valid callback delivery or container acceptance.

Each case constructs the actual class and invokes only public `add`, `hasCallback`, `remove`, `removeLast`, `clear` and the constructor's own source `call` method. That `call` is not Function.prototype.call. Actual `add` and `removeLast` returns provide object-retention boundaries without argument retention or property access helpers.

Source-derived literals cover empty calls, strict same-object versus equal-data membership, removal of every duplicate, LIFO identity, nullish queries meaning any entry, null-stored order-dependent errors and repair, NaN strict equality, persistent malformed-call failures and recovery. Plain data `$1` matching is characterized separately from genuine once wrappers. Bounded generated token histories retain an independent ordered-list oracle alongside literal cases.

The full one-module declared source closure has zero gate descriptors or unresolved AST diagnostics under the default budget. This does not establish exhaustive payload/options/history coverage. There are no provider, environment, Babel, timer or network fixtures.

`once:true` is excluded: it returns a function that current data snapshots/references do not admit. No function retention, opaque discard, native/meta projection, private `$2`, callback fixture or new authority is used. Valid callbacks, once delivery, reentrancy, async behavior and Banzai/qex integration remain unaccepted. Container execution, service registration and production authored-suite scheduling are also unproven.
