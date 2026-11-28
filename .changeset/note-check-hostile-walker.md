---
"agent-wiki-core": patch
---

Harden `note check` with a shared `lstat`-based walker (`walkWikiFiles`) and wiki-root check (`wikiRootRefusal`) so pipes, sockets, and devices with Markdown names are refused with `DOMAIN_PRECONDITION_UNMET` without opening them, and a symbolic-link `wiki/` or `templates/` folder names the link.
