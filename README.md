# Sentinel test repository

Versioned tests and information about WhatsApp Web behavior. Polymorfa Sentinel and library adapters can run the same fixtures to compare observations across client revisions and implementations.

This repository stores declarative test cases, their JSON schema, source references, and coverage notes. Sentinel's monitoring service and execution runtime live separately. WhatsApp source bundles, credentials, accounts, and captures are not stored here.

Run `npm test` with Node 24 to validate the test repository. Validation checks the corpus; it does not execute WhatsApp or certify a library's compliance.

Each case records a fixed clock, timezone, random seed, gate fixtures, explicit dependency stubs, probes, and expected observations. Consumers must record the exact case hash, source revision, dependency variants, runtime, and outcome. Missing dependencies and unsupported browser/WASM capabilities must not be reported as behavior changes.

The initial cases cover linking-code encoding and a date-range argument change. A source change can preserve every existing assertion. New paths still need new probes, and server behavior requires separate evidence.

Discovered using a monitor developed by @purpshell at polymorfa.com
