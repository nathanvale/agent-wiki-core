---
"agent-wiki-core": major
---

Replace the `./note/*` and `./shared/*` wildcard exports with three task-named entries (`./commands`, `./consumer-guard`, and `./notes`) and mount core commands through `wikiCoreFor(cli, { repoRoot, environment })`.

Action: Update imports from `agent-wiki-core/note/*` and `agent-wiki-core/shared/*` to `agent-wiki-core/commands` and `agent-wiki-core/notes`, mount core commands with `wikiCoreFor(cli, { repoRoot, environment })` instead of `noteCheckFor` and `useNoteCheckEnvironment`, and keep local copies of `shared/values` helpers and consumer-specific route names.
