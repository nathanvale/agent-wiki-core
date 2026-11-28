import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { familyWikiFixture, runCoreCli } from "./support/family-wiki.ts";

const multiFamilyTable = {
  baseTag: "example-wiki",
  discoveryTags: ["travel", "home"],
  tagLimit: 2,
  summaryMaxLength: 200,
  unfiledFolder: "wiki/inbox/",
  familyFreeFolders: ["wiki/inbox/", "wiki/archive/"],
  reservedFamilies: { "wiki/areas/": "area" },
  renames: [],
  families: [
    {
      family: "project",
      folder: "wiki/projects/",
      familyFields: [
        { name: "status", value: "seed" },
        { name: "updated", value: '"{{date}}"' },
      ],
      headings: [
        {
          name: "Purpose",
          hint: "Why this project matters.",
          optional: false,
        },
        {
          name: "Notes",
          optional: true,
        },
      ],
    },
    {
      family: "topic",
      folder: "wiki/topics/",
      familyFields: [{ name: "scope", value: "general" }],
      headings: [
        {
          name: "Summary",
          hint: "Key points for this topic.",
          optional: false,
        },
      ],
    },
  ],
};

const expectedProjectTemplate = `---
family: project
title: "{{title}}"
summary: ""
created: "{{date}}"
tags: [example-wiki]
status: seed
updated: "{{date}}"
---

# {{title}}

## Purpose

<!-- Why this project matters. -->

## Notes
`;

const expectedTopicTemplate = `---
family: topic
title: "{{title}}"
summary: ""
created: "{{date}}"
tags: [example-wiki]
scope: general
---

# {{title}}

## Summary

<!-- Key points for this topic. -->
`;

const nullBaseTagTable = {
  families: [
    {
      family: "note",
      folder: "wiki/notes/",
      headings: [{ name: "Overview", optional: false }],
    },
  ],
};

const expectedNullBaseTagTemplate = `---
family: note
title: "{{title}}"
summary: ""
created: "{{date}}"
tags: []
---

# {{title}}

## Overview
`;

describe("family render --wiki", () => {
  test("prints one template per defined family with exact header order, no type:, family fields as given, and hints only when present", () => {
    const wiki = familyWikiFixture({ table: multiFamilyTable });
    const run = runCoreCli(["family", "render", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.commandIdentity).toBe(
      "agent-wiki-core.family.render",
    );
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).not.toBeNull();
    if (run.envelope.result.data === null) return;

    expect(Object.keys(run.envelope.result.data)).toEqual(["familyTemplates"]);
    expect(run.envelope.result.data).toEqual({
      familyTemplates: {
        "templates/project.md": expectedProjectTemplate,
        "templates/topic.md": expectedTopicTemplate,
      },
    });
    expect(expectedProjectTemplate).not.toContain("type:");
    expect(expectedTopicTemplate).not.toContain("type:");
  });

  test("renders tags: [] when baseTag is null", () => {
    const wiki = familyWikiFixture({ table: nullBaseTagTable });
    const run = runCoreCli(["family", "render", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({
      familyTemplates: {
        "templates/note.md": expectedNullBaseTagTemplate,
      },
    });
  });

  test("refuses with exit 3 and DOMAIN_PRECONDITION_UNMET when family-table.json is missing", () => {
    const wiki = familyWikiFixture({});
    const run = runCoreCli(["family", "render", "--wiki", wiki]);

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.commandIdentity).toBe(
      "agent-wiki-core.family.render",
    );
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
  });
});

describe("family drift --wiki", () => {
  test("reports zero findings when installed templates match the render", () => {
    const wiki = familyWikiFixture({
      table: multiFamilyTable,
      templates: {
        "templates/project.md": expectedProjectTemplate,
        "templates/topic.md": expectedTopicTemplate,
      },
    });
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.commandIdentity).toBe(
      "agent-wiki-core.family.drift",
    );
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({ findings: [] });
  });

  test("reports template-missing when an installed template does not exist", () => {
    const wiki = familyWikiFixture({
      table: multiFamilyTable,
      templates: {
        "templates/topic.md": expectedTopicTemplate,
      },
    });
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({
      findings: [
        {
          path: "templates/project.md",
          kind: "template-missing",
          detail: "Installed family template is missing.",
        },
      ],
    });
  });

  test("reports template-differs when an installed template has been edited", () => {
    const wiki = familyWikiFixture({
      table: multiFamilyTable,
      templates: {
        "templates/project.md": `${expectedProjectTemplate}\n## Extra\n`,
        "templates/topic.md": expectedTopicTemplate,
      },
    });
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({
      findings: [
        {
          path: "templates/project.md",
          kind: "template-differs",
          detail:
            "Installed family template differs from the rendered template.",
        },
      ],
    });
  });

  test("reports template-differs with 'the path is not a file' when a folder is named like a template", () => {
    const wiki = familyWikiFixture({
      table: multiFamilyTable,
      templates: {
        "templates/topic.md": expectedTopicTemplate,
      },
    });
    mkdirSync(join(wiki, "templates/project.md"), { recursive: true });
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({
      findings: [
        {
          path: "templates/project.md",
          kind: "template-differs",
          detail: "the path is not a file",
        },
      ],
    });
  });

  test("reports template-unexpected when an extra template exists under templates/", () => {
    const wiki = familyWikiFixture({
      table: multiFamilyTable,
      templates: {
        "templates/project.md": expectedProjectTemplate,
        "templates/topic.md": expectedTopicTemplate,
        "templates/stray.md": "# Stray\n",
      },
    });
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({
      findings: [
        {
          path: "templates/stray.md",
          kind: "template-unexpected",
          detail: "Installed template is not declared in family-table.json.",
        },
      ],
    });
  });

  test("refuses with exit 3 and DOMAIN_PRECONDITION_UNMET when family-table.json is missing", () => {
    const wiki = familyWikiFixture({});
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.commandIdentity).toBe(
      "agent-wiki-core.family.drift",
    );
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
  });
});
