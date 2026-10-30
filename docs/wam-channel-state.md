# Original WAM channel-manager state

This suite invokes the actual `WAWamChannelManager` singleton and its two independent realm-native Maps. Seven histories contain 372 probes per source revision, with at most 90 probes per case. No Babel producer, fixture, channel, sink, callback or provider is supplied.

Cases observe initial false values, per-key isolation, initialized-versus-busy independence, close before first access, close/resume cycles and repeated closes. Actual retained-reference identity proves that exported `closeChannelManager` and direct `close` retain the same singleton. A separate history uses that real manager object as a Map key. Close resets stored values; these observations do not establish entry deletion, disposal, memory cleanup or worker/process restart.

Selected primitive keys include numbers, strings, booleans, null, undefined, NaN, Unicode and control characters. Repeated NaN inputs exercise Map key equivalence. Signed zero is not represented distinctly by the existing JSON number transport and is not claimed as a tested boundary.

Busy-value cases characterize the original stored-value-or-false expression with selected truthy/falsy numbers, strings, arrays, plain data objects and BigInts. This is a loose API characterization, not a boolean-only validation contract. Two generated 18-operation histories use an independent ordered-record host model to check both maps for the selected key and its neighbor after every update or close. Model code never enters the worker.

Both source revisions pin the same single no-dependency module. Its complete supported static gate inventory has no gate reads or unresolved diagnostics, yielding one empty finite gate assignment within this helper scope. Keys, values and operation histories remain unbounded.

No WAM channel/sink implementation, queue, transport, commit/flush, storage, provider, network/account, browser bootstrap, container isolation, production suite scheduling, named-library parity or security proof is accepted by these state tests.

Run portable checks with `bun test tests/wam-channel-state.test.ts`. Actual source execution requires a reviewed adapter advertising `wa-internal:wam-channel-state`. Diagnostic process runs report `isolated:false`.
