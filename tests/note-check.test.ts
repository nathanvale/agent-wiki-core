import { expect, test } from "bun:test";
import { join } from "node:path";
import { commonCauses, contractFor, runInProcess } from "agent-cli-kernel";
import { diagnosticsAddon } from "agent-cli-kernel/addons/diagnostics";
import { programsAddon } from "agent-cli-kernel/addons/programs";
import { notesCauses } from "../src/note/causes.ts";
import { noteCheckFor } from "../src/note/check.ts";
import { groupFindings } from "../src/note/rules.ts";
import {
  parseJson,
  parseJsonRecord,
  readOptionalRecord,
  readRecordArray,
  readString,
  readStringArray,
} from "./support/json.ts";
import {
  cleanTargetNote,
  readDiagnosticsEvents,
  runNoteCheck,
} from "./support/note-check.ts";
import {
  fingerprint,
  personTemplate,
  root,
  wikiFixture,
} from "./support/wiki.ts";

const cleanSourceNote = `---
type: entity
title: "Charles Babbage"
status: active
created: "2026-11-23"
updated: "2026-11-23"
tags: [vault-pilot]
record_id: person_charles
family: person
aliases: []
contact_sources: []
---

# Charles Babbage

## Context

Collaborated with [Ada Lovelace](./ada-lovelace.md).
`;

test("passes on clean notes with long prose, valid relative links, and records diagnostics", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
    "wiki/people/charles-babbage.md": cleanSourceNote,
  });
  const before = fingerprint(folder);
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(0);
  expect(envelope.result.commandIdentity).toBe("agent-wiki-core.note.check");
  expect(envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
  expect(envelope.result.data).toMatchObject({
    rumdlVersion: "0.3.5",
    filesChecked: 2,
    findingCount: 0,
    findings: [],
  });
  expect(typeof envelope.result.data?.["durationMilliseconds"]).toBe("number");
  expect(fingerprint(folder)).toBe(before);

  const events = readDiagnosticsEvents(envelope);
  const completed = events.find(
    (entry) => entry["event"] === "notes.check.completed",
  );
  expect(completed).toBeDefined();
  expect(completed?.["facts"]).toMatchObject({
    rumdlVersion: "0.3.5",
    filesChecked: 2,
    findingCount: 0,
  });
  const completedFacts = readOptionalRecord(
    completed?.["facts"],
    "completed.facts",
  );
  expect(typeof completedFacts?.["durationMilliseconds"]).toBe("number");
});

test("passes on a properties-block title paired with a # {{title}} heading and family templates with {{title}} values", () => {
  const folder = wikiFixture({
    "wiki/people/placeholder.md": `---
title: "{{title}}"
---

# {{title}}

## Context

Notes with a properties-block title and a top-level heading must pass.
`,
    "templates/person.md": personTemplate,
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(0);
  expect(envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
  expect(envelope.result.data).toMatchObject({
    rumdlVersion: "0.3.5",
    filesChecked: 2,
    findingCount: 0,
  });
});

test("refuses a broken relative link with DOMAIN_NOTES_BROKEN_LINKS, note and line, and wiki repair guidance without modifying the note", () => {
  const folder = wikiFixture({
    "wiki/people/broken-link.md": `---
title: "Broken Link"
---

# Broken Link

See [missing](./does-not-exist.md).
`,
  });
  const before = fingerprint(folder);
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(3);
  expect(envelope.result.outcome).toBe("refused");
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_BROKEN_LINKS");
  expect(envelope.result.data).toBeNull();
  expect(envelope.message).toContain("[note] wiki/people/broken-link.md:7");
  expect(envelope.message).toContain("MD057");
  expect(envelope.message).toContain("record find");
  expect(envelope.message).toContain("Repair:");
  expect(fingerprint(folder)).toBe(before);

  const events = readDiagnosticsEvents(envelope);
  const completed = events.find(
    (entry) => entry["event"] === "notes.check.completed",
  );
  expect(completed?.["facts"]).toMatchObject({
    rumdlVersion: "0.3.5",
    filesChecked: 1,
    findingCount: 1,
  });
});

test("refuses mixed list markers with DOMAIN_NOTES_LIST_AND_TABLE_FORMAT and never auto-fixes", () => {
  const folder = wikiFixture({
    "wiki/people/mixed-list.md": `---
title: "Mixed List"
---

# Mixed List

- first item
* second item
`,
  });
  const before = fingerprint(folder);
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LIST_AND_TABLE_FORMAT");
  expect(envelope.message).toContain("[note] wiki/people/mixed-list.md:8");
  expect(envelope.message).toContain("MD004");
  expect(envelope.message).toContain("Repair:");
  expect(fingerprint(folder)).toBe(before);
});

test("refuses skipped heading levels with DOMAIN_NOTES_HEADING_STRUCTURE", () => {
  const folder = wikiFixture({
    "wiki/people/skipped-heading.md": `---
title: "Skipped Heading"
---

# Skipped Heading

### Too Deep
`,
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_HEADING_STRUCTURE");
  expect(envelope.message).toContain("[note] wiki/people/skipped-heading.md:7");
  expect(envelope.message).toContain("MD001");
  expect(envelope.message).toContain("Repair:");
});

test("refuses fenced code blocks without a language with DOMAIN_NOTES_CODE_AND_INLINE_SYNTAX", () => {
  const folder = wikiFixture({
    "wiki/people/plain-fence.md": `---
title: "Plain Fence"
---

# Plain Fence

\`\`\`
plain code
\`\`\`
`,
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_CODE_AND_INLINE_SYNTAX");
  expect(envelope.message).toContain("[note] wiki/people/plain-fence.md:7");
  expect(envelope.message).toContain("MD040");
  expect(envelope.message).toContain("Repair:");
});

test("refuses trailing whitespace with DOMAIN_NOTES_WHITESPACE_AND_ENCODING", () => {
  const folder = wikiFixture({
    "wiki/people/trailing-space.md": `---
title: "Trailing Space"
---

# Trailing Space

Line with trailing space.   
`,
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe(
    "DOMAIN_NOTES_WHITESPACE_AND_ENCODING",
  );
  expect(envelope.message).toContain("[note] wiki/people/trailing-space.md:7");
  expect(envelope.message).toContain("MD009");
  expect(envelope.message).toContain("Repair:");
});

test("reports every finding group with its cause code and repair when a note breaks multiple groups", () => {
  const folder = wikiFixture({
    "wiki/people/multi.md": `---
title: "Multi"
---

# Multi

### Skipped

- dash
* star

See [broken](./missing.md).
`,
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_BROKEN_LINKS");
  expect(envelope.message).toContain("DOMAIN_NOTES_BROKEN_LINKS");
  expect(envelope.message).toContain("DOMAIN_NOTES_HEADING_STRUCTURE");
  expect(envelope.message).toContain("DOMAIN_NOTES_LIST_AND_TABLE_FORMAT");
  expect(envelope.message).toContain("MD057");
  expect(envelope.message).toContain("MD001");
  expect(envelope.message).toContain("MD004");
});

test("labels findings from templates/ as [template] and findings from wiki/ as [note]", () => {
  const folder = wikiFixture({
    "wiki/people/mixed.md": `---
title: "Mixed"
---

# Mixed

- dash
* star
`,
    "templates/person.md": `---
title: "{{title}}"
---

# {{title}}

- dash
* star
`,
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LIST_AND_TABLE_FORMAT");
  expect(envelope.message).toContain("[note] wiki/people/mixed.md:8");
  expect(envelope.message).toContain("[template] templates/person.md:8");

  const events = readDiagnosticsEvents(envelope);
  const completed = events.find(
    (entry) => entry["event"] === "notes.check.completed",
  );
  expect(completed?.["facts"]).toMatchObject({
    findingsByLabel: { note: 1, template: 1 },
  });
});

test("skips relative links escaping outside the wiki root (sibling source vaults) while reporting them in data and diagnostics", () => {
  const folder = wikiFixture({
    "wiki/people/filed.md": `---
title: "Filed Person"
---

# Filed Person

Filed from [old note](../../../old-vault/people/filed.md).
`,
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(0);
  expect(envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
  expect(envelope.result.data).toMatchObject({
    findingCount: 0,
    externalLinksSkipped: [
      {
        path: "wiki/people/filed.md",
        line: 7,
        target: "../../../old-vault/people/filed.md",
      },
    ],
  });
});

test("ignores unfiled notes under wiki/inbox/ while catching the same planted problem once filed elsewhere", () => {
  const brokenNote = `---
title: "Copied Draft"
---

# Copied Draft

- dash
* star
`;
  const inboxFolder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
    "wiki/inbox/copied-draft.md": brokenNote,
  });
  const inboxRun = runNoteCheck(["--wiki", inboxFolder]);
  expect(inboxRun.exitCode).toBe(0);
  expect(inboxRun.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
  expect(inboxRun.envelope.result.data).toMatchObject({
    filesChecked: 1,
    findingCount: 0,
    findings: [],
  });

  const filedFolder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
    "wiki/people/copied-draft.md": brokenNote,
  });
  const filedRun = runNoteCheck(["--wiki", filedFolder]);
  expect(filedRun.exitCode).toBe(3);
  expect(filedRun.envelope.result.causeCode).toBe(
    "DOMAIN_NOTES_LIST_AND_TABLE_FORMAT",
  );
  expect(filedRun.envelope.message).toContain(
    "[note] wiki/people/copied-draft.md:8",
  );
  expect(filedRun.envelope.message).toContain("MD004");
});

test("refuses through real rumdl when settings enable an unknown rule", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
    "unknown-rule.toml": '[global]\nenable = ["MD001", "MD999"]\n',
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_CONFIG_PATH: join(folder, "unknown-rule.toml"),
  });
  expect(exitCode).toBe(3);
  expect(envelope.result.outcome).toBe("refused");
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_FAILED");
  expect(envelope.message).toContain("MD999");
  expect(envelope.message).toMatch(/Repair:.*MD999/);
});

test("every rule enabled in the effective rumdl configuration is known to rumdl and has a repair mapping in src/note/rules.ts", () => {
  const rumdl = join(root, "node_modules/.bin/rumdl");
  const configRun = Bun.spawnSync(
    [
      rumdl,
      "config",
      "--config",
      join(root, ".rumdl.toml"),
      "--output",
      "json",
    ],
    { cwd: root, env: process.env, stdout: "pipe", stderr: "pipe" },
  );
  expect(configRun.exitCode).toBe(0);
  expect(configRun.stderr.toString().trim()).toBe("");
  const effectiveConfig = parseJsonRecord(
    configRun.stdout.toString(),
    "rumdl.config",
  );
  const globalConfig = readOptionalRecord(
    effectiveConfig["global"],
    "rumdl.config.global",
  );
  const enable =
    globalConfig?.["enable"] === undefined
      ? []
      : readStringArray(globalConfig["enable"], "rumdl.config.global.enable");
  const extendEnable =
    globalConfig?.["extend-enable"] === undefined
      ? []
      : readStringArray(
          globalConfig["extend-enable"],
          "rumdl.config.global.extend-enable",
        );
  const enabledRules = [...new Set([...enable, ...extendEnable])];
  expect(enabledRules.length).toBeGreaterThan(0);

  const rulesRun = Bun.spawnSync([rumdl, "rule", "--output-format", "json"], {
    cwd: root,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(rulesRun.exitCode).toBe(0);
  expect(rulesRun.stderr.toString().trim()).toBe("");
  const knownRules = new Set(
    readRecordArray(
      parseJson(rulesRun.stdout.toString(), "rumdl.rules"),
      "rumdl.rules",
      (entry, path) => readString(entry["code"], `${path}.code`),
    ),
  );
  const unknownEnabled = enabledRules.filter((code) => !knownRules.has(code));
  expect(unknownEnabled).toEqual([]);

  const grouped = groupFindings(
    enabledRules.map((rule) => ({
      file: "wiki/people/ada-lovelace.md",
      line: 1,
      column: 1,
      rule,
      message: "probe",
      severity: "warning",
      fixable: false,
    })),
    root,
  );
  const unmapped = grouped
    .flatMap((group) => group.findings)
    .filter(
      (item) =>
        !item.mapped ||
        item.group === "DOMAIN_NOTES_UNMAPPED_RULE" ||
        item.repair.trim() === "",
    )
    .map((item) => item.rule);
  expect(unmapped).toEqual([]);
});

test("noteCheckFor builds a command whose identity and stations use the given CLI name", async () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const contract = contractFor({
    cli: "example-wiki",
    commands: [noteCheckFor("example-wiki", folder)],
    causes: { ...commonCauses, ...notesCauses },
    installedAddons: ["programs", "diagnostics"],
  });
  const argv = ["--discover-command", "example-wiki.note.check"];
  const ran = await runInProcess(contract, {
    addons: {
      programs: programsAddon(),
      diagnostics: diagnosticsAddon({
        cli: "example-wiki",
        environment: {},
        argv,
      }),
    },
  })(argv);
  expect(ran.kind).toBe("envelope");
  if (ran.kind !== "envelope") return;
  expect(ran.envelope.result.exitCode).toBe(0);
  expect(ran.envelope.availablePaths).toContain("example-wiki.note.check");
  expect(ran.envelope.result.data).toMatchObject({
    command: {
      commandIdentity: "example-wiki.note.check",
      route: ["note", "check"],
    },
  });
});
