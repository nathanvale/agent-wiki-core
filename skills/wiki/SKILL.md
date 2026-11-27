---
name: wiki
description: Work in a consumer wiki through its command-line tool. Use when creating, importing, moving, reading, changing, filing, or checking notes or records.
---

# Wiki

Work in a consumer wiki through its command-line tool so every note meets the note contract.

1. **Discover with `--help`.** Run the consumer wiki's command-line tool with `--help` to list the mounted routes, then run the chosen route with `--help` to read its options and wiki root option. Done when you have the exact command route and options for the task, or have confirmed from `--help` that no mounted route fits.
2. **Act through the route.** Create, import, move, read, and change notes through the matching mounted route using the options from `--help`. When `--help` lists no mounted route for the task, stop and report the missing route instead of writing, copying, or moving note files by hand. Done when the route completes and its command result confirms the outcome, or you have stopped and reported the missing route.
3. **Check before filing.** Run `note check --wiki <wiki root>` before treating any note as filed, and apply each finding's repair until `note check` exits 0 with zero findings. Done when `note check` passes on the current wiki root with zero findings.
