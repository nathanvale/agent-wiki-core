import { describe, expect, test } from "bun:test";
import {
  familyWikiFixture,
  readFamilyCheckRun,
  runConsumerCli,
} from "./support/family-wiki.ts";

const fixtureTable = {
  baseTag: "example-wiki",
  discoveryTags: ["travel", "home"],
  tagLimit: 2,
  summaryMaxLength: 80,
  unfiledFolder: "wiki/inbox/",
  familyFreeFolders: ["wiki/inbox/", "wiki/archive/"],
  reservedFamilies: { "wiki/areas/": "area" },
  families: [
    {
      family: "decision",
      folder: "wiki/decisions/",
      headings: [
        { name: "Answer", hint: "State the decision.", optional: false },
        { name: "Evidence", hint: "Link the evidence.", optional: false },
      ],
    },
    {
      family: "project",
      folder: "wiki/projects/",
      headings: [
        { name: "Purpose", hint: "Why this project matters.", optional: false },
      ],
    },
  ],
};

function runConsumerFamilyCheck(wiki: string) {
  return readFamilyCheckRun(
    runConsumerCli(["family", "check", "--wiki", wiki]),
  );
}

describe("consumer wiki rules through wikiCoreFor mount", () => {
  test("per-note rule reports findings with check wiki-rule after core checks and skips unfiled notes", () => {
    const wiki = familyWikiFixture({
      table: fixtureTable,
      notes: {
        "wiki/decisions/flagged.md": `---
family: decision
summary: "Pick an option."
tags: [example-wiki]
---

# Flagged Decision

## Answer

Choose option A with WIKI_RULE_MARKER.

## Evidence

Measured locally.
`,
        "wiki/archive/loose.md": `---
summary: "Archived note without a family."
created: 2026-11-28
tags: [example-wiki]
---

# Loose Note

Carries WIKI_RULE_MARKER without a family.
`,
        "wiki/inbox/unfiled.md": `---
title: "Unfiled draft"
---

# Unfiled Draft

Carries WIKI_RULE_MARKER inside the unfiled folder.
`,
      },
    });

    const run = runConsumerFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.commandIdentity).toBe("fixture-wiki.family.check");
    expect(run.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.notes).toBe(3);
    expect(
      run.findings.map(
        (finding) => `${finding.path}|${finding.check}|${finding.kind}`,
      ),
    ).toEqual([
      "wiki/archive/loose.md|wiki-rule|fixture-note-rule",
      "wiki/decisions/flagged.md|base-fields|created-missing",
      "wiki/decisions/flagged.md|wiki-rule|fixture-note-rule",
    ]);
    expect(run.findings[0]?.detail).toBe(
      "Marker found in family=none baseTag=example-wiki.",
    );
    expect(run.findings[2]?.detail).toBe(
      "Marker found in family=decision baseTag=example-wiki.",
    );
  });

  test("cross-record rule runs once per check with every record including unfiled notes", () => {
    const wiki = familyWikiFixture({
      table: fixtureTable,
      notes: {
        "wiki/decisions/one.md": `---
family: decision
summary: "Decision one."
created: 2026-11-28
tags: [example-wiki]
record_id: "shared-id"
---

# Decision One

## Answer

Option A.

## Evidence

Verified.
`,
        "wiki/projects/two.md": `---
family: project
summary: "Project two."
created: 2026-11-28
tags: [example-wiki]
record_id: "unique-id"
---

# Project Two

## Purpose

Ship the feature.
`,
        "wiki/archive/three.md": `---
summary: "Archived three."
created: 2026-11-28
tags: [example-wiki]
record_id: "shared-id"
---

# Archived Three
`,
        "wiki/inbox/four.md": `---
record_id: "shared-id"
---

# Unfiled Four
`,
        "wiki/index.md": `---
title: "Wiki Index"
---

# Wiki Index
`,
      },
    });

    const run = runConsumerFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(4);
    expect(run.findings).toEqual([
      {
        path: "wiki/archive/three.md",
        check: "wiki-rule",
        kind: "duplicate-record-id",
        detail:
          'Duplicate record_id "shared-id" across wiki/archive/three.md, wiki/decisions/one.md, wiki/inbox/four.md (records=4, unique=4, families=2).',
      },
    ]);
  });

  test("clean wiki produces zero wiki-rule findings through the fixture consumer CLI", () => {
    const wiki = familyWikiFixture({
      table: fixtureTable,
      notes: {
        "wiki/projects/clean.md": `---
family: project
summary: "Clean project."
created: 2026-11-28
tags: [example-wiki]
record_id: "clean-1"
---

# Clean Project

## Purpose

Deliver cleanly.
`,
      },
    });

    const run = runConsumerFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(1);
    expect(run.findings).toEqual([]);
  });
});
