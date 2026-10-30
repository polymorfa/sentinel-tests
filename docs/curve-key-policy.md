# Original WA curve-key helpers

This suite executes `WACryptoCurveKeyCanonicalCheck`, `WACryptoCurveTransformations` and `WACryptoCurveEd25519PointOps` with their original dependencies. It uses no crypto provider, stub, host object or injected function. Ten bounded cases contain 137 probes per source revision.

The independent oracles are the prime, subgroup order, basepoint coordinates and birational map in [RFC7748 section 4.1](https://www.rfc-editor.org/rfc/rfc7748.html#section-4.1), the published keys in [section 6.1](https://www.rfc-editor.org/rfc/rfc7748.html#section-6.1), and ordinary integer/field arithmetic outside the worker. Only expected JSON data enters the worker. Actual subgroup checks run the original point scalar multiplication by order L, including its real addition and doubling operations.

Cases cover the base `u=9`, Alice/Bob public keys, low-order `u=0/1`, the undefined `u=p-1` map, field boundaries, byte offsets and lengths, and `u+k*p` for three fixed keys and `k=0..3`. The last relation separates reduction from range: a key can pass the torsion check after reduction while failing the helper's canonical range check. Point examples cover the published Edwards basepoint, identity, negative basepoint, nonzero projective scaling, scalar zero and an invalid curve equation.

Non-32-byte inputs are helper characterization. A one-byte `09` and a 33-byte zero-extended `09` both represent integer 9 and pass these helper predicates. No protocol-level length rejection is assumed. The ordinary Signal deserialization path checks a serialized 33-byte key and prefix 5 before the caller takes `subarray(1)`, but this suite does not execute that caller or establish every path's preconditions. `isIdentity` also does not establish point validity or guard degenerate projective coordinates.

Both revisions pin the complete ten-module helper closure. The selected union-root AST inventories complete within the existing work budget, with no supported gates or unresolved diagnostics. The one empty supported gate assignment is exercised within this helper scope. This does not establish Signal caller configurations, full semantic proof or exhaustive key/input coverage.

The suite does not test a whole RFC X25519 API: that API masks the high input bit and accepts noncanonical inputs after reduction. WhatsApp providers, native crypto, Signal/Noise/ratchet behavior, entropy, constant-time behavior, side channels, malleability, strict signatures, security proofs, containers, production scheduling and named-library compliance remain unproven. Numeric, byte, key, point and operation domains remain unbounded.

Run portable checks with `bun test tests/curve-key-policy.test.ts`. Actual source execution requires a reviewed adapter advertising `wa-internal:curve-key-policy`; process diagnostic runs report `isolated:false`.
