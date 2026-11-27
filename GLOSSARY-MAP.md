# Glossary map

Each word has one owner. Find the glossary that owns the word you need, and
use its word.

This repository's `GLOSSARY.md` is the source of truth for every word it
defines. Where another glossary shows one of them, `GLOSSARY.md` is right.

| Glossary           | Owns                                                                                                                                                                                                                                                              | Where                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This repository    | Every word that `GLOSSARY.md` defines: the wiki core and its consumer wikis, a wiki and what it holds, families, the note contract, contacts, and what a check reports                                                                                            | [GLOSSARY.md](GLOSSARY.md)                                                                                                                                                  |
| Kernel             | The kernel's own words: Kernel repository, Pin, Pinned commit, Installed kernel, Kernel package, Add-on, Add-on selection, State add-on, Programs add-on, Approval add-on, Diagnostics add-on, Menu add-on, Repair action, Kernel station and verify-cli          | [GLOSSARY.md in agent-cli-kernel](https://github.com/nathanvale/agent-cli-kernel/blob/main/GLOSSARY.md) (installed locally at `node_modules/agent-cli-kernel/GLOSSARY.md`) |
| Template           | The template's own words that this repository uses: Template, Bootstrap, Source packet, Generated repository, Pointer skill, Template upgrade, Pin move, and the shared tool words (Check command, Hosted check, Gate, Recorded hit, Refusal, Repair, Doctor, Lint rule, Changeset) | [GLOSSARY.md in bun-typescript-template](https://github.com/nathanvale/bun-typescript-template/blob/main/GLOSSARY.md)                                                       |
| Command Contract 3 | The frozen CLI contract words: Application CLI, Command, Command identity, Command route, Station, Cause code, Envelope, Effect class, Inspect, Changing command, Outcome, Transaction state, Guidance, Next step and Handoff                                     | [CLI kernel authority](https://github.com/nathanvale/agent-cli-kernel/blob/main/docs/agents/cli-kernel.md)                                                                  |
| Design words       | Module, Interface, Seam and Adapter, with Implementation, Depth, Leverage and Locality                                                                                                                                                                            | The `codebase-design` skill, under "Glossary" in its `SKILL.md`                                                                                                             |
| A consumer wiki    | Its own families, its wiki rules, and the tools only it uses. This repository names no consumer wiki and defines none of its words                                                                                                                                | That wiki's own `GLOSSARY.md`                                                                                                                                               |

Three pairs are easy to cross:

- **Pin** is the kernel's: the kernel commit a repository names. **Core pin**
  is the wiki core commit a consumer wiki names.
- **Pin move** is the template's, for the kernel Pin. **Core pin move** is
  for the core pin.
- **Pointer skill** is the template's word for any thin skill that points at
  a full one inside an installed package. **Shipped pointer** and **installed
  pointer** are the two places the wiki skill's pointer skill lives.

A consumer wiki that takes a word from here points its own glossary map at
this repository and stops defining the word itself.

## Names in code

A file, folder, exported symbol, command route, cause code or test title that
stands for a glossary term uses that term's words, in the term's order. A
word on a term's `_Avoid_` line is never used to name that term, within the
limits its note in parentheses gives; the same word stays free for another
term that owns it, as `template` does in `FamilyTemplate`.

| Term                | Folder or file                | Symbols, routes and causes                            |
| ------------------- | ----------------------------- | ----------------------------------------------------- |
| Note check          | `src/note/`                   | route `note check`, `noteCheckFor`, `DOMAIN_NOTES_*`  |
| Consumer guard      | `src/consumer-guard/`         | `installFindings`                                     |
| Install finding     | inside `src/consumer-guard/`  | type `InstallFinding`, kind `nested-kernel`           |
| Wiki skill          | `skills/wiki/`                | skill name `wiki`                                     |
| Shipped pointer     | `skills/wiki/pointer/`        |                                                       |
| Maintainer skill    | `.agents/skills/`             | never under `skills/`                                 |
| Note contract       | `src/note-contract/`          | `BaseField`, `FamilyField`, kind `created-missing`    |
| Note name           | `src/note-name/`              | routes `note-name plan`, `note-name apply`            |
| Record family       | `src/family/`                 | `FamilyTable`, routes `family check`, `family drift`  |
| Contacts capability | `src/contacts/`               | capability name `contacts`                            |
| Contact adapter     | `src/contacts/adapters/`      | one file per adapter prefix; type `ContactAdapter`    |
| Resolution          | inside `src/contacts/`        | type `Resolution`: `found`, `missing`, `unavailable`  |
| Header fields       | inside `src/shared/`          | `headerFields` on a note                              |

A row whose folder does not exist yet fixes the name for the work that
creates it. When a change needs a name for something no term covers, add the
term to `GLOSSARY.md` in the same pull request, then name the code after it.
