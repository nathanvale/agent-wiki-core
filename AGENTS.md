# Repository commands

The kernel's skills are installed under `.agents/skills/` (and linked under `.claude/skills/`). Read the matching skill before working:

- Write commands on the agent-cli-kernel package: read `.agents/skills/agent-cli-kernel/SKILL.md`.
- Prove that a CLI built on agent-cli-kernel really works, the way a user meets it: read `.agents/skills/verify-cli/SKILL.md`.

Maintainer skill (public boundary, subpath exports, kernel Pin, shipped pointer, glossary token count): read `.agents/skills/maintain-agent-wiki-core/SKILL.md`.

Use the existing repository CLI at src/cli.ts. Add commands through src/commands.ts.
Keep domain implementation in separate files and preserve one public application CLI.

Check command: bun run check
Smoke: bun run start --help
Source packet: https://github.com/nathanvale/agent-wiki-core

## Words

Before naming a file, folder, symbol, route or cause, read `GLOSSARY.md` for the word and `GLOSSARY-MAP.md`, "Names in code", for how it is spelled in code.
A new domain word goes into `GLOSSARY.md` in the same pull request that first uses it.

## Comments

Lint refuses a comment in code, so say it in a name, a type or a test title.
A comment that opens with `Platform:` or `Interface:` makes a claim that a reviewer checks. It is not a way to keep a comment.

The lint rule files in config/ are the template's. Change a lint rule in the template, not here.
