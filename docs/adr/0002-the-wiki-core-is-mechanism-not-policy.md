---
status: accepted
---

# The wiki core is mechanism, not policy

Recorded from [spec #18](https://github.com/nathanvale/agent-wiki-core/issues/18).

The wiki core enforces only the base fields its own commands read (`family`,
`summary`, `created` and `tags` required; `title`, `aliases`, `record_id` and
`replaced_by` understood when present) and whatever each consumer wiki's
`family-table.json` declares. Every record family, heading rule and variant
the wiki core ships is an example, never a rule imposed on consumer wikis.
Consumer-specific checks run beside the core's as wiki rules passed into
`wikiCoreFor`.

## Considered options

- **A core with fixed families.** Compile one set of families, folders, family
  fields and heading rules into the wiki core so every consumer wiki shares
  them. Rejected because it would put one consumer wiki's policy into every
  consumer wiki, forcing unrelated wikis to accept families and fields they do
  not use or to work around the core.

## Consequences

- Each consumer wiki owns its `family-table.json` in its wiki root and passes
  any consumer-specific checks through `noteRules` and `crossRecordRules`.
- Shared family commands (`family check`, `family drift`, `family list` and
  `family render`) take `--wiki <root>` and read that wiki's family table
  rather than reading compiled-in rules.
- Agents learn a consumer wiki's families by running `family list --wiki <root>`
  instead of reading a fixed list in the wiki skill.
