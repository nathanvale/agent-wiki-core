---
"agent-wiki-core": minor
---

Render one family template per variant (`templates/<family>-<variant>.md`) with `variant: <name>` after `tags` and `afterVariants` headings placed after the variant's headings, and compare those paths in `family drift` so a left-over plain `templates/<family>.md` is reported as `template-unexpected`.
