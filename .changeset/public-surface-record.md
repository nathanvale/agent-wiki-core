---
"agent-wiki-core": minor
---

Record the declared public surface in `public-surface.json`, add `bun run surface:record` and `tests/public-surface.test.ts` to detect unrecorded surface changes, and gate changes to `public-surface.json` and `skills/` with changesets.
