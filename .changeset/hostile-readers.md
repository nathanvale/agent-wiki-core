---
"agent-wiki-core": major
---

Hardened every core wiki reader to walk folders with `walkWikiFiles`, open files with `readRootedFile` at a bounded size limit, decode strict UTF-8, copy returned byte buffers, and throw `WikiReadRefusal` (exported from `agent-wiki-core/notes`) instead of hanging or silently skipping hostile entries. Updated `wikiReadCommand` to check `wikiRootRefusal` and map `WikiReadRefusal` to `DOMAIN_PRECONDITION_UNMET` naming the path.

Action: catch `WikiReadRefusal` in any consumer command that calls core readers directly, or build read commands with `wikiReadCommand`.
