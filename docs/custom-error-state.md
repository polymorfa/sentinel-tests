# Original custom error construction and composition

This suite genuinely constructs the original `WACustomError` classes: CustomError, AggregateError, TimeoutError and UnimplementedMethod. It selects the pinned original Babel producer and uses the worker's realm-native construction control. Exported classes are never plain-called. Ten cases contain 74 probes per source revision, with at most 27 probes per case.

Four cases use direct case construction for default values. Other cases construct real error objects during a sequential plan, retain the actual returned instances and pass those earlier references inside new AggregateError arrays. Ordered, duplicate and nested genuine errors exercise the original formatter. Literal expectations follow the source's names, default/nullish rules, explicit-message selection and ordinary inherited Error.toString conversion. No JSON record or replacement formatter is counted as a genuine error instance.

Selected malformed arrays and null elements produce constructor-body TypeErrors; exact engine-specific messages are not asserted. Explicit nonempty aggregate messages skip default formatting, including selected invalid array/element inputs. These are source characterizations, not a general error-array validation guarantee. A failed construction is followed by a valid aggregate using a previously retained original error, then a new real-error retry.

The original constructor stores the caller's error array directly, but this suite does not observe later array or data-property mutations. Aliasing and mutation of errors, message and taalOpcodes remain blocked by the current method-based observation surface. No Object.prototype selector, generic property getter, proxy formatter or synthetic factory is used to claim those lifecycles.

The native-super wrapper and inherited toString observations do not establish native Error internal branding, stack capture or stack formatting. The suite calls no reporting, logger, sink, provider, timer, cancellation, persistence or application workflow.

Metadata pins all five Metro dependencies and the separate original Babel asset for both revisions. The full bounded AST inventory retains two dynamic-code/import diagnostics for original Function.bind references. Zero discovered gate descriptors therefore does not establish an exhaustive empty assignment or full configuration proof. No fixture, compatibility helper or raised analysis budget is used.

Original-source Babel execution uses the protected realm namespace: outward unknown, inherited and symbol reads and mutations are guarded, while ownKeys/getOwnPropertyDescriptor/has reflection forwards to the original target. This does not establish transparent whole-browser bootstrap behavior. Arbitrary messages, arrays and error graphs, containers, production suite scheduling, accounts/network, cryptography, Signal, named-library parity and security proof remain unaccepted.

Run portable checks with `bun test tests/custom-error-state.test.ts`. Actual source execution requires a reviewed adapter advertising `wa-internal:custom-error-state`, the genuine construction control and an explicitly configured registered bootstrap source cache. Process diagnostic runs report `isolated:false`.
