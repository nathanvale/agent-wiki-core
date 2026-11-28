import { describe, expect, test } from "bun:test";
import { checkNote, readFamilyTable } from "agent-wiki-core/family";
import type { Check } from "agent-wiki-core/family";
import {
  expectedNotePath,
  firstHeading,
  noteTitle,
  slugFromTitle,
} from "agent-wiki-core/note-name";
import { parseNote } from "agent-wiki-core/notes";
import {
  familyWikiFixture,
  readFamilyCheckRun,
  runCoreCli,
} from "./support/family-wiki.ts";
import type { ObservedFinding } from "./support/family-wiki.ts";

const noteNameTable = {
  unfiledFolder: "wiki/inbox/",
  familyFreeFolders: ["wiki/archive/"],
  reservedFamilies: { "wiki/areas/": "area" },
  families: [
    {
      family: "project",
      folder: "wiki/projects/",
      headings: [{ name: "Purpose", optional: false }],
    },
    {
      family: "research",
      folder: "wiki/research/",
      headings: [{ name: "Findings", optional: false }],
    },
    {
      family: "meeting",
      folder: "wiki/meetings/",
      noteNames: "dated-title",
      headings: [{ name: "Notes", optional: false }],
    },
  ],
};

type NoteOptions = {
  readonly family?: string | null;
  readonly title?: string | null;
  readonly heading?: string | null;
  readonly summary?: string | null;
  readonly created?: string | null;
  readonly replacedBy?: string | null;
  readonly tags?: readonly string[];
  readonly sectionName?: string;
  readonly sectionBody?: string | null;
};

const defaultNoteOptions: Required<NoteOptions> = {
  family: "project",
  title: null,
  heading: "Sample Project",
  summary: "Summary text.",
  created: "2026-11-28",
  replacedBy: null,
  tags: [],
  sectionName: "Purpose",
  sectionBody: "Ship the first version.",
};

function makeNote(overrides: NoteOptions = {}): string {
  const options = { ...defaultNoteOptions, ...overrides };
  const headerEntries: readonly (readonly [string, string | null])[] = [
    ["family", options.family],
    ["title", options.title === null ? null : `"${options.title}"`],
    ["summary", options.summary === null ? null : `"${options.summary}"`],
    ["created", options.created],
    [
      "replaced_by",
      options.replacedBy === null ? null : `"${options.replacedBy}"`,
    ],
    ["tags", `[${options.tags.join(", ")}]`],
  ];
  const lines = [
    "---",
    ...headerEntries.flatMap(([key, value]) =>
      value === null ? [] : [`${key}: ${value}`],
    ),
    "---",
  ];
  if (options.heading !== null) lines.push("", `# ${options.heading}`);
  if (options.sectionBody !== null) {
    lines.push("", `## ${options.sectionName}`, "", options.sectionBody);
  }
  return `${lines.join("\n")}\n`;
}

function checkSummary(
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
    (finding: ObservedFinding) =>
      `${finding.path}|${finding.check}|${finding.kind}`,
  );
}

describe("note-name check (spec AC-02)", () => {
  test("name-mismatch checks file name against title header or first heading and respects noteNames", () => {
    const notes = {
      "wiki/projects/wrong-name.md": makeNote({
        title: "Alpha Plan",
        heading: "Different Heading",
      }),
      "wiki/projects/alpha-plan.md": makeNote({
        title: "Alpha Plan",
        heading: "Different Heading",
      }),
      "wiki/projects/from-heading.md": makeNote({
        heading: "From **Heading** &amp; More",
      }),
      "wiki/projects/from-heading-more.md": makeNote({
        heading: "From **Heading** &amp; More",
      }),
    };

    expect(checkSummary(noteNameTable, notes)).toEqual([
      "wiki/projects/from-heading.md|note-name|name-mismatch",
      "wiki/projects/wrong-name.md|note-name|name-mismatch",
    ]);

    expect(checkSummary({ ...noteNameTable, noteNames: "any" }, notes)).toEqual(
      [],
    );
  });

  test("dated-title accepts both <slug>.md and <created>-<slug>.md, and rejects mismatched dates or missing created", () => {
    const notes = {
      "wiki/meetings/2026-01-05-weekly-sync.md": makeNote({
        family: "meeting",
        heading: "Weekly Sync",
        created: "2026-01-05",
        sectionName: "Notes",
      }),
      "wiki/meetings/weekly-sync-undated.md": makeNote({
        family: "meeting",
        heading: "Weekly Sync Undated",
        created: "2026-01-05",
        sectionName: "Notes",
      }),
      "wiki/meetings/2026-01-06-wrong-date.md": makeNote({
        family: "meeting",
        heading: "Wrong Date",
        created: "2026-01-05",
        sectionName: "Notes",
      }),
      "wiki/meetings/2026-01-05-no-created.md": makeNote({
        family: "meeting",
        heading: "No Created",
        created: null,
        sectionName: "Notes",
      }),
      "wiki/projects/2026-01-05-project-dated.md": makeNote({
        family: "project",
        heading: "Project Dated",
        created: "2026-01-05",
      }),
    };

    expect(
      checkSummary({ ...noteNameTable, createdRequired: false }, notes),
    ).toEqual([
      "wiki/meetings/2026-01-05-no-created.md|note-name|name-mismatch",
      "wiki/meetings/2026-01-06-wrong-date.md|note-name|name-mismatch",
      "wiki/projects/2026-01-05-project-dated.md|note-name|name-mismatch",
    ]);
  });

  test("note-in-subfolder is a hard rule in family, reserved and family-free folders, never in the unfiled folder", () => {
    const notes = {
      "wiki/projects/sub/nested-project.md": makeNote({
        family: "project",
        heading: "Nested Project",
      }),
      "wiki/areas/2026/nested-area.md": makeNote({
        family: "area",
        heading: "Nested Area",
        sectionBody: null,
      }),
      "wiki/archive/2024/nested-archive.md": makeNote({
        family: null,
        heading: "Nested Archive",
        sectionBody: null,
      }),
      "wiki/inbox/2026/nested-draft.md": "# Rough Draft\n",
    };

    const relaxedTable = {
      ...noteNameTable,
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
    };

    expect(checkSummary(noteNameTable, notes)).toEqual([
      "wiki/archive/2024/nested-archive.md|note-name|note-in-subfolder",
      "wiki/areas/2026/nested-area.md|note-name|note-in-subfolder",
      "wiki/projects/sub/nested-project.md|note-name|note-in-subfolder",
    ]);

    expect(checkSummary(relaxedTable, notes)).toEqual([
      "wiki/archive/2024/nested-archive.md|note-name|note-in-subfolder",
      "wiki/areas/2026/nested-area.md|note-name|note-in-subfolder",
      "wiki/projects/sub/nested-project.md|note-name|note-in-subfolder",
    ]);
  });

  test("shared-note-name respects uniqueNoteNames except on a replaced_by target", () => {
    const plainDuplicate = {
      "wiki/projects/alpha.md": makeNote({
        family: "project",
        heading: "Alpha",
      }),
      "wiki/archive/alpha.md": makeNote({
        family: null,
        heading: "Alpha",
        sectionBody: null,
      }),
      "wiki/inbox/alpha.md": "# Alpha\n",
    };

    expect(
      checkSummary({ ...noteNameTable, uniqueNoteNames: true }, plainDuplicate),
    ).toEqual([
      "wiki/archive/alpha.md|note-name|shared-note-name",
      "wiki/projects/alpha.md|note-name|shared-note-name",
    ]);

    expect(
      checkSummary(
        { ...noteNameTable, uniqueNoteNames: false },
        plainDuplicate,
      ),
    ).toEqual([]);

    const targetedDuplicate = {
      ...plainDuplicate,
      "wiki/research/old-alpha.md": makeNote({
        family: "research",
        heading: "Old Alpha",
        created: "2026-01-01",
        replacedBy: "alpha.md",
        sectionName: "Findings",
      }),
    };

    expect(
      checkSummary(
        { ...noteNameTable, uniqueNoteNames: false },
        targetedDuplicate,
      ),
    ).toEqual([
      "wiki/archive/alpha.md|note-name|shared-note-name",
      "wiki/projects/alpha.md|note-name|shared-note-name",
      "wiki/research/old-alpha.md|note-name|replaced-by-unresolved",
    ]);
  });

  test("replaced_by resolves against any filed note including a research note pointing at a later project note", () => {
    const resolvedNotes = {
      "wiki/research/early-study.md": makeNote({
        family: "research",
        heading: "Early Study",
        created: "2026-01-01",
        replacedBy: "later-project.md",
        sectionName: "Findings",
      }),
      "wiki/projects/later-project.md": makeNote({
        family: "project",
        heading: "Later Project",
        created: "2026-02-01",
      }),
      "wiki/research/same-day-study.md": makeNote({
        family: "research",
        heading: "Same Day Study",
        created: "2026-02-01",
        replacedBy: "later-project.md",
        sectionName: "Findings",
      }),
    };

    expect(checkSummary(noteNameTable, resolvedNotes)).toEqual([]);
  });

  test("replaced-by-unresolved fires on missing, earlier, self or unfiled target, and pair without created still reports when createdRequired is false", () => {
    const unresolvedNotes = {
      "wiki/research/missing-target.md": makeNote({
        family: "research",
        heading: "Missing Target",
        created: "2026-02-01",
        replacedBy: "does-not-exist.md",
        sectionName: "Findings",
      }),
      "wiki/research/earlier-target.md": makeNote({
        family: "research",
        heading: "Earlier Target",
        created: "2026-02-01",
        replacedBy: "older-project.md",
        sectionName: "Findings",
      }),
      "wiki/projects/older-project.md": makeNote({
        family: "project",
        heading: "Older Project",
        created: "2026-01-01",
      }),
      "wiki/research/self-target.md": makeNote({
        family: "research",
        heading: "Self Target",
        created: "2026-02-01",
        replacedBy: "self-target.md",
        sectionName: "Findings",
      }),
      "wiki/research/unfiled-target.md": makeNote({
        family: "research",
        heading: "Unfiled Target",
        created: "2026-01-01",
        replacedBy: "draft.md",
        sectionName: "Findings",
      }),
      "wiki/inbox/draft.md": "# Draft\n",
    };

    expect(checkSummary(noteNameTable, unresolvedNotes)).toEqual([
      "wiki/research/earlier-target.md|note-name|replaced-by-unresolved",
      "wiki/research/missing-target.md|note-name|replaced-by-unresolved",
      "wiki/research/self-target.md|note-name|replaced-by-unresolved",
      "wiki/research/unfiled-target.md|note-name|replaced-by-unresolved",
    ]);

    const pairWithoutCreated = {
      "wiki/research/no-date-source.md": makeNote({
        family: "research",
        heading: "No Date Source",
        created: null,
        replacedBy: "no-date-target.md",
        sectionName: "Findings",
      }),
      "wiki/projects/no-date-target.md": makeNote({
        family: "project",
        heading: "No Date Target",
        created: null,
      }),
    };

    expect(
      checkSummary(
        { ...noteNameTable, createdRequired: false },
        pairWithoutCreated,
      ),
    ).toEqual([
      "wiki/projects/no-date-target.md|note-name|created-missing",
      "wiki/research/no-date-source.md|note-name|created-missing",
      "wiki/research/no-date-source.md|note-name|replaced-by-unresolved",
    ]);
  });

  test("checkNote includes note-name findings alongside base-fields and heading-rule", () => {
    const loaded = readFamilyTable(familyWikiFixture({ table: noteNameTable }));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const note = parseNote(
      "wiki/projects/sub/wrong-name.md",
      makeNote({ heading: "Alpha Plan", created: null }),
    );
    const findings = checkNote(note, loaded.table);
    const checks: Check[] = findings.map((item) => item.check);
    expect(checks).toEqual(["base-fields", "note-name", "note-name"]);
    expect(findings.map((item) => `${item.check}|${item.kind}`)).toEqual([
      "base-fields|created-missing",
      "note-name|note-in-subfolder",
      "note-name|name-mismatch",
    ]);
  });
});

describe("agent-wiki-core/note-name helpers", () => {
  test("firstHeading, noteTitle and slugFromTitle decode entities and strip inline markup", () => {
    const markdown = [
      "---",
      "family: project",
      "---",
      "",
      "```md",
      "# Ignored Code Heading",
      "```",
      "",
      "# **Ada** &amp; [Charles](charles.md)&#39;s `Engine`",
      "",
      "## Purpose",
    ].join("\n");

    expect(firstHeading(markdown)).toBe("Ada & Charles's Engine");
    expect(noteTitle(parseNote("wiki/projects/ada.md", markdown))).toBe(
      "Ada & Charles's Engine",
    );
    expect(
      noteTitle(
        parseNote(
          "wiki/projects/ada.md",
          '---\ntitle: "Header Title"\n---\n\n# Body Heading\n',
        ),
      ),
    ).toBe("Header Title");
    expect(slugFromTitle("Ada & Charles's Engine")).toBe("ada-charless-engine");
    expect(slugFromTitle("Café — 2026 Plan!")).toBe("cafe-2026-plan");
  });

  test("expectedNotePath works before a note exists and preserves dated or undated form under dated-title", () => {
    const loaded = readFamilyTable(familyWikiFixture({ table: noteNameTable }));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(
      expectedNotePath(
        { family: "project", title: "Alpha Plan" },
        loaded.table,
      ),
    ).toBe("wiki/projects/alpha-plan.md");

    expect(
      expectedNotePath(
        {
          family: "meeting",
          title: "Weekly Sync",
          created: "2026-01-05",
        },
        loaded.table,
      ),
    ).toBe("wiki/meetings/2026-01-05-weekly-sync.md");

    expect(
      expectedNotePath(
        {
          family: "meeting",
          title: "Weekly Sync",
          currentPath: "wiki/meetings/2026-01-05-weekly-sync.md",
          created: "2026-01-05",
        },
        loaded.table,
      ),
    ).toBe("wiki/meetings/2026-01-05-weekly-sync.md");

    expect(
      expectedNotePath(
        {
          family: "meeting",
          title: "Weekly Sync",
          currentPath: "wiki/meetings/weekly-sync.md",
          created: "2026-01-05",
        },
        loaded.table,
      ),
    ).toBe("wiki/meetings/weekly-sync.md");

    expect(
      expectedNotePath(
        {
          family: "project",
          title: "Nested Plan",
          currentPath: "wiki/projects/sub/nested-plan.md",
        },
        loaded.table,
      ),
    ).toBe("wiki/projects/nested-plan.md");
  });
});
