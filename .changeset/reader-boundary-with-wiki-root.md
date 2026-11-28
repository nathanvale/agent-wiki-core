---
"agent-wiki-core": major
---

Export `withWikiRoot(wikiRoot, read)` from `agent-wiki-core/commands` to run `wikiRootRefusal` and map `WikiReadRefusal` to `DOMAIN_PRECONDITION_UNMET` for both synchronous and asynchronous reads, update `wikiReadCommand` to delegate to it, and remove `noWikiRoot`.

Action: replace `isWikiRoot` / `noWikiRoot` checks in consumer command handlers with `withWikiRoot` from `agent-wiki-core/commands`, or build read-only commands with `wikiReadCommand`.
