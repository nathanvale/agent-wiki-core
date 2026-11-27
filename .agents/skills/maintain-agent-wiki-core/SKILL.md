---
name: maintain-agent-wiki-core
description: Maintain the public wiki core. Use when changing this repository to check the public boundary before pushing, expose a module to consumer wikis, keep the kernel Pin aligned, or change the shipped pointer.
---

# Maintaining the wiki core

Project-only maintainer skill. Keep it under `.agents/skills/` and linked from `.claude/skills/`, outside `skills/`, so consumer wikis never install it.

## 1. Public boundary before every push

Run a public pattern search across the branch diff against `origin/main` (`git diff origin/main...HEAD`), commit messages, `.changeset/` entries, and pull request text before pushing.

Search for private repository names, consumer wiki names, personal names, home-directory paths, employer names, and credentials.

Done when zero private matches remain outside dependency URLs.

## 2. Exposing a module to consumer wikis

Expose a module to consumer wikis only through a `package.json` `exports` subpath entry, and keep internal modules unexported.

Leave `.fallowrc.json` unchanged: Fallow already treats every `package.json` `exports` target as a dead-code entry point, and duplicating it in `.fallowrc.json` `entry` raises `entry-pattern-redundant`.

Done when every consumer-facing module is declared under `package.json` `exports` and `bun run check` exits 0 with no unused-export finding and no `entry-pattern-redundant` diagnostic.

## 3. Kernel Pin alignment

Keep `package.json`'s `agent-cli-kernel` Pin equal to the kernel Pin consumer wikis use. A different Pin installs a nested kernel, which consumer guard reports as an install finding.

Pin a full 40-character commit SHA in `package.json`, refresh `bun.lock` with `bun install`, and match every pointer skill's `Pinned commit` line.

Done when `package.json`, `bun.lock`, the installed kernel, and every pointer skill carry the same 40-character Pin and consumer wikis can move to it without a nested kernel.

## 4. Shipped pointer changes

Any change to the shipped pointer under `skills/wiki/pointer/` alters the installed pointer in consumer wikis and is consumer-visible.

Add a non-empty changeset with `bun run --bun changeset add` describing the consumer-visible change (`scripts/check-gated-paths.ts` only gates `src/` and `package.json`, so it will not catch a missing changeset here).

Done when `.changeset/` holds a non-empty changeset for the shipped pointer change and `bun run check:changesets` exits 0.
