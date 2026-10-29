# Contributing tests

Add a synthetic case under `tests/` and its information under `metadata/cases.json`. Follow `schemas/case.schema.json`, give probes stable IDs, and record the source module, revisions, exact line references, context, and limits of the assertion.

Keep old case versions when behavior changes. Increase the version rather than silently changing its expected outputs. An intentional client change and a regression are different conclusions; describe the observed difference before judging it.

Run `npm test`. A runtime report must identify the exact test repository commit, case hash, source/dependency hashes, gate context, runtime image/version, and isolation mode. Keep assertion mismatches, load errors, timeouts, unsupported capabilities and real-service acceptance separate.

Keep issues and pull requests brief. Explain the changed behavior and include a small useful example or evidence link. Follow the target library's style when adapting a test. Do not commit vendor bundles, accounts, credentials, private findings, or session captures.
