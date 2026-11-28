---
"agent-wiki-core": minor
---

Move the note-name check (`name-mismatch`, `note-in-subfolder`, `shared-note-name`, and `replaced-by-unresolved`) into the wiki core as `check: "note-name"` in `checkNote` and `family check`, and add the `agent-wiki-core/note-name` entry exporting `noteTitle`, `firstHeading`, `slugFromTitle`, and `expectedNotePath`.
