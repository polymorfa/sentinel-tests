# Behavior cases

## Executable core suites

The authored TS suites extend the eight historical fixtures below. The metadata in `metadata/suites/` records each selected source closure, hashes, gate inventory, independent oracle, trials and exclusions.

| Suite                 | Assertion scope                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Binary core           | Signed/unsigned safe-integer conversion, endian packing/read cursors, failed writes, growth, varints, hex and custom Base32.         |
| ABProps               | Typed parsing, nullish defaults, malformed coercion, bounded signed decimals and exposure-key order.                                 |
| WAM buffer            | Actual headers/records, channels, signed widths, strings, event flags, admission and finalization.                                   |
| Crypto representation | All padding tail bytes across selected sizes/offsets, fixed-width integer encoding, little-endian decoding and hex characterization. |
| Backoff state         | Ordered per-key retry/expiry/reset behavior, exact time boundaries, exhausted intervals and backward clocks.                         |

These assertions run actual archived implementations when a capable subject is explicitly selected. They do not cover original provider resolution, live server behavior or complete library compliance. Binary/WAM/error closures retain the unresolved analyzer diagnostic recorded in their metadata. Large WAM strings verify size transitions where full byte expectations exceed the retained payload bound.

## Historical fixture observations

These versioned fixtures describe assertions for selected functions from privately supplied WhatsApp Web archives. This repository contains synthetic inputs, assertions and observation metadata. It contains no WhatsApp source bundles or session data.

A passing assertion covers its exact input and recorded context. It does not establish whole-client behavior, a library's compliance, server acceptance or cryptographic security. The full list of uncovered domains is in [coverage.json](../coverage.json).

| Case                                 | Archived function                                                                 | Assertion scope                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `linking-base32@1`                   | `WAWebAltDeviceLinkingBase32Encode.bytesToCrockford`                              | Five pairing-code byte vectors                                                                           |
| `customer-range-date-argument@1`     | `WAWebCustomerManagerLastMessageRangeSecondsBounds.lastMessageRangeSecondsBounds` | Default and explicit reference dates; the latter intentionally detects the recorded revision change      |
| `binary-utf8-byte-length@1`          | `WABinary.numUtf8Bytes`                                                           | Fifteen counts across UTF-8 boundaries, surrogate pairs/lone surrogates and a repeated-input cache probe |
| `binary-uint64-safe-integer@1`       | `WABinary.parseUint64OrThrow`                                                     | Seven high/low word probes through the maximum safe integer and actual Error rejection above it          |
| `message-padding-tail-length@1`      | `WACryptoPkcs7.unpadPkcs7`                                                        | Seven uniform tail-padding and empty/overrun guard probes                                                |
| `protocol-media-type-cast@1`         | `WAProtocolMediaType.castToProtocolMediaType`                                     | Twelve media literals, alias and unsupported-value probes                                                |
| `aea-account-state-classification@1` | `WAWebAeaAccountState.isAeaNonE2eeAccountState`                                   | Seven state-string classifications using the actual archived `$InternalEnum` dependency                  |
| `appstate-star-index-shape@1`        | `WAWebSyncdIndexUtils.getMsgKeyFromStarActionIndex`                               | Four malformed JSON or incomplete tuple guards; valid index decoding remains uncovered                   |

The six additional backend cases passed on both archived revisions `1051710191` and `1051908825`: twelve executions and 104 assertions. Their tested target sources were unchanged across that pair. The date-range case remains a separate deliberate drift example. Do not replace a failed expectation automatically when a later revision changes behavior.

[metadata/cases.json](../metadata/cases.json) records each exact source archive URL/hash, module source hash, relevant lines, supplied closure, modules actually required, stubs, outcomes and runtime/context/test digests. Source hashes identify the archived pretty-printed text supplied to the runtime; they are not presented as hashes of the original served module bytes.

The historical observations used Node `v24.15.0`, with a fixed UTC clock, explicit random seed, no gate fixtures, a five-second case deadline and a 128 MiB heap limit. This record describes the earlier diagnostic process executions with `isolated:false`. Container isolation, live accounts, browser workers, calling WASM and cross-library adapters were not exercised.

The binary cases and their error paths use real archived `err`/`fb-error` dependencies. Padding's crypto dependency is a fail-closed fixture that is never called: random padding generation and encryption are outside that case. Account classification supplies empty fixtures for unused ADV/attestation schema dependencies. The rejected star-index probes supply empty fixtures for unused JID, message-key, identity, metrics, logging and Promise dependencies. Supplied source and actually required modules are recorded separately, so an unused dependency is not counted as executed behavior.

Cases were drafted using `gpt-6.1-sol`; authorship is recorded in their metadata. Keep IDs stable and increase a case version when its assertions change.

Run `bun test` with Bun 1.4.4. Without an explicit `SENTINEL_SUBJECT_MODULE`, reference suites visibly skip and only fixture/subject-contract unit tests execute. `bun run validate` validates data fixtures and metadata without running an archive.
