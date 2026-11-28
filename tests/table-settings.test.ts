import { describe, expect, test } from "bun:test";
import {
  familyWikiFixture,
  readFamilyCheckRun,
  runCoreCli,
} from "./support/family-wiki.ts";
import type { ObservedFinding } from "./support/family-wiki.ts";

const baseTable = {
  families: [
    {
      family: "project",
      folder: "wiki/projects/",
      headings: [{ name: "Purpose", optional: false }],
    },
  ],
};

type NoteOptions = {
  readonly family?: string | null;
  readonly summary?: string | null;
  readonly created?: string | null;
  readonly tags?: readonly string[];
  readonly purpose?: string | null;
};

function projectNote(overrides: NoteOptions = {}): string {
  const family = overrides.family === undefined ? "project" : overrides.family;
  const summary =
    overrides.summary === undefined ? "Deliver the widget." : overrides.summary;
  const created =
    overrides.created === undefined ? "2026-11-28" : overrides.created;
  const tags = overrides.tags ?? [];
  const purpose =
    overrides.purpose === undefined
      ? "Ship the first version."
      : overrides.purpose;
  const lines = ["---"];
  if (family !== null) lines.push(`family: ${family}`);
  if (summary !== null) lines.push(`summary: "${summary}"`);
  if (created !== null) lines.push(`created: ${created}`);
  lines.push(`tags: [${tags.join(", ")}]`, "---", "", "# Sample Project");
  if (purpose !== null) lines.push("", "## Purpose", "", purpose);
  return `${lines.join("\n")}\n`;
}

function checkKinds(
  table: Record<string, unknown>,
  notes: Readonly<Record<string, string>>,
): readonly string[] {
  const wiki = familyWikiFixture({ table, notes });
  const run = readFamilyCheckRun(
    runCoreCli(["family", "check", "--wiki", wiki], 10_000),
  );
  expect(run.exitCode).toBe(0);
  expect(run.causeCode).toBe("SUCCESS_UNCHANGED");
  return run.findings.map(
    (finding: ObservedFinding) => `${finding.path}|${finding.kind}`,
  );
}

describe("table settings toggle their policy rule kinds", () => {
  test("familyHeader toggles family-missing while keeping folder headings and family-mismatch", () => {
    const notes = {
      "wiki/projects/no-family.md": projectNote({ family: null }),
    };

    expect(
      checkKinds({ ...baseTable, familyHeader: "required" }, notes),
    ).toEqual(["wiki/projects/no-family.md|family-missing"]);
    expect(
      checkKinds({ ...baseTable, familyHeader: "from-folder" }, notes),
    ).toEqual([]);

    const missingHeading = {
      "wiki/projects/no-heading.md": projectNote({
        family: null,
        purpose: null,
      }),
    };
    expect(
      checkKinds({ ...baseTable, familyHeader: "from-folder" }, missingHeading),
    ).toEqual(["wiki/projects/no-heading.md|required-section-empty"]);

    const wrongFamily = {
      "wiki/projects/wrong.md": projectNote({ family: "area" }),
    };
    expect(
      checkKinds(
        {
          ...baseTable,
          reservedFamilies: { "wiki/areas/": "area" },
          familyHeader: "from-folder",
        },
        wrongFamily,
      ),
    ).toEqual(["wiki/projects/wrong.md|family-mismatch"]);
  });

  test("undeclaredFolders toggles unknown-folder only", () => {
    const notes = {
      "wiki/misc/loose.md": projectNote(),
    };

    expect(
      checkKinds({ ...baseTable, undeclaredFolders: "finding" }, notes),
    ).toEqual(["wiki/misc/loose.md|unknown-folder"]);
    expect(
      checkKinds({ ...baseTable, undeclaredFolders: "family-free" }, notes),
    ).toEqual([]);
  });

  test("baseTag toggles base-tag-missing only", () => {
    const notes = {
      "wiki/projects/untagged.md": projectNote({ tags: [] }),
    };

    expect(
      checkKinds({ ...baseTable, baseTag: "example-wiki" }, notes),
    ).toEqual(["wiki/projects/untagged.md|base-tag-missing"]);
    expect(checkKinds({ ...baseTable, baseTag: null }, notes)).toEqual([]);
  });

  test("discoveryTags toggles unapproved-tag only", () => {
    const notes = {
      "wiki/projects/extra-tag.md": projectNote({ tags: ["unlisted"] }),
    };

    expect(
      checkKinds({ ...baseTable, discoveryTags: ["home"] }, notes),
    ).toEqual(["wiki/projects/extra-tag.md|unapproved-tag"]);
    expect(checkKinds({ ...baseTable, discoveryTags: null }, notes)).toEqual(
      [],
    );
  });

  test("tagLimit toggles too-many-tags only", () => {
    const notes = {
      "wiki/projects/many-tags.md": projectNote({ tags: ["a", "b", "c"] }),
    };

    expect(checkKinds({ ...baseTable, tagLimit: 2 }, notes)).toEqual([
      "wiki/projects/many-tags.md|too-many-tags",
    ]);
    expect(checkKinds({ ...baseTable, tagLimit: null }, notes)).toEqual([]);
  });

  test("summaryRequired toggles summary-missing without disabling summary-too-long", () => {
    const missingSummary = {
      "wiki/projects/no-summary.md": projectNote({ summary: null }),
    };

    expect(
      checkKinds({ ...baseTable, summaryRequired: true }, missingSummary),
    ).toEqual(["wiki/projects/no-summary.md|summary-missing"]);
    expect(
      checkKinds({ ...baseTable, summaryRequired: false }, missingSummary),
    ).toEqual([]);

    const longSummary = {
      "wiki/projects/long-summary.md": projectNote({
        summary: "a".repeat(25),
      }),
    };
    expect(
      checkKinds(
        { ...baseTable, summaryRequired: false, summaryMaxLength: 20 },
        longSummary,
      ),
    ).toEqual(["wiki/projects/long-summary.md|summary-too-long"]);
  });

  test("summaryMaxLength toggles summary-too-long only", () => {
    const notes = {
      "wiki/projects/long-summary.md": projectNote({
        summary: "a".repeat(25),
      }),
    };

    expect(checkKinds({ ...baseTable, summaryMaxLength: 20 }, notes)).toEqual([
      "wiki/projects/long-summary.md|summary-too-long",
    ]);
    expect(checkKinds({ ...baseTable, summaryMaxLength: null }, notes)).toEqual(
      [],
    );
  });

  test("createdRequired toggles created-missing only", () => {
    const notes = {
      "wiki/projects/no-created.md": projectNote({ created: null }),
    };

    expect(checkKinds({ ...baseTable, createdRequired: true }, notes)).toEqual([
      "wiki/projects/no-created.md|created-missing",
    ]);
    expect(checkKinds({ ...baseTable, createdRequired: false }, notes)).toEqual(
      [],
    );
  });
});

describe("hard rules and null-safe unfiled placement", () => {
  test("a note with family directly under wiki/ gives outside-family-folder under every setting", () => {
    const notes = {
      "wiki/stray.md": projectNote({
        summary: null,
        created: null,
        tags: [],
      }),
    };

    const relaxedTable = {
      ...baseTable,
      familyHeader: "from-folder",
      undeclaredFolders: "family-free",
      baseTag: null,
      discoveryTags: null,
      tagLimit: null,
      summaryRequired: false,
      summaryMaxLength: null,
      createdRequired: false,
      noteNames: "any",
      uniqueNoteNames: false,
      unfiledFolder: null,
    };

    expect(checkKinds(relaxedTable, notes)).toEqual([
      "wiki/stray.md|outside-family-folder",
    ]);

    const strictTable = {
      ...baseTable,
      familyHeader: "required",
      undeclaredFolders: "finding",
      summaryRequired: true,
      createdRequired: true,
      unfiledFolder: "wiki/inbox/",
    };

    expect(checkKinds(strictTable, notes)).toEqual([
      "wiki/stray.md|outside-family-folder",
      "wiki/stray.md|created-missing",
      "wiki/stray.md|summary-missing",
    ]);
  });

  test("unfiled placement is null-safe when unfiledFolder is null", () => {
    const notes = {
      "wiki/stray.md": projectNote(),
      "wiki/inbox/draft.md": projectNote({ family: null }),
    };

    expect(checkKinds({ ...baseTable, unfiledFolder: null }, notes)).toEqual([
      "wiki/inbox/draft.md|unknown-folder",
      "wiki/stray.md|outside-family-folder",
    ]);
  });
});
