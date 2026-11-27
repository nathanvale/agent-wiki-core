---
name: wiki
description: Work in a consumer wiki through its command-line tool. Use when reading, changing, filing, or checking notes in a wiki.
---

# Wiki

Work in a consumer wiki through its command-line tool so every note meets the note contract.

1. **Discover with `--help`.** Run the consumer wiki's command-line tool with `--help` to list the mounted routes, then run the chosen route with `--help` to read its options and wiki root option. Done when you have the exact command route and options for the task.
2. **Act through the route.** Run the mounted route for every read or change a route covers, using the options from `--help`. Done when the route completes and its command result confirms the outcome.
3. **Check before filing.** Run `note check` against the wiki root before treating any note as filed, and apply each finding's repair until `note check` exits 0 with zero findings. Done when `note check` passes on the current wiki root with zero findings.
