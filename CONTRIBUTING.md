# Contributing

Private Local Chat runs in the browser and supports local models and explicitly selected API providers. Keep changes focused, preserve existing chat/settings formats, and keep local mode free from silent API fallback.

For a feature request or bug report, use https://github.com/johnbenac/privatelocalchat/issues/new/choose. Submissions are public: exclude API keys, private conversations, and sensitive URL parameters.

Use Node.js 22 or later. Run `npm ci`, `npm test`, and `npm run build`; use `node scripts/serve.mjs` for a local preview. Add meaningful checks for changed behavior. Runtime changes need actual model-generation and offline checks, not only mocked replies.

Create a focused branch and pull request. Use Conventional Commit subjects and a body with lines no longer than 100 characters. Explain the behavior change and validation. See docs/OPERATIONS.md for branch deployment and rollback, docs/ACCEPTANCE.md for release gates, and docs/RUNTIMES.md for pinned model/runtime provenance.

Never commit credentials, local browser profiles, or user conversations. Production follows `main`; the separate development site follows `dev`. Model versions are immutable; publish new keys rather than replacing existing model objects.
