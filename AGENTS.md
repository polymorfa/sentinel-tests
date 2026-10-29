# Test repository

- This public repository stores WhatsApp behavior tests and their metadata.
- Use Node 24. Run `npm test` before submitting changes.
- Keep case IDs stable and increase a case's version when assertions change.
- Add source revision, module, context, and coverage information for each test.
- Use synthetic fixtures. Never commit credentials, account data, captured sessions, or vendor bundles.
- Follow the JSON schema and keep descriptions brief. A pass covers only the asserted behavior.
