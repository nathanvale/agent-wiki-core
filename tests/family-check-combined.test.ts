import { describe, expect, test } from "bun:test";
import { checkNote, readFamilyTable } from "agent-wiki-core/family";
import type { Check, Finding, NoteRules } from "agent-wiki-core/family";
import { parseNote } from "agent-wiki-core/notes";
import {
  familyWikiFixture,
  readFamilyCheckRun,
  runCoreCli,
} from "./support/family-wiki.ts";
import type { ObservedFinding } from "./support/family-wiki.ts";

const prototypeTable = {
  baseTag: "example-wiki",
  discoveryTags: ["travel", "home"],
  tagLimit: 2,
  summaryMaxLength: 80,
  unfiledFolder: "wiki/inbox/",
  familyFreeFolders: ["wiki/inbox/", "wiki/archive/"],
  reservedFamilies: { "wiki/areas/": "area" },
  noteNames: "any",
  families: [
    {
      family: "decision",
      folder: "wiki/decisions/",
      headings: [
        { name: "Answer", hint: "State the decision.", optional: false },
        { name: "Evidence", hint: "Link the evidence.", optional: false },
        { name: "Notes", optional: true },
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

type NoteOptions = {
  readonly family?: string | null;
  readonly summary?: string | null;
  readonly created?: string | null;
  readonly tags?: readonly string[];
  readonly sections?: Readonly<Record<string, string | null>>;
};

function renderNote(
  defaults: Required<NoteOptions>,
  overrides: NoteOptions = {},
): string {
  const family =
    overrides.family === undefined ? defaults.family : overrides.family;
  const summary =
    overrides.summary === undefined ? defaults.summary : overrides.summary;
  const created =
    overrides.created === undefined ? defaults.created : overrides.created;
  const tags = overrides.tags ?? defaults.tags;
  const sections = { ...defaults.sections, ...overrides.sections };
  const lines = ["---"];
  if (family !== null) lines.push(`family: ${family}`);
  if (summary !== null) lines.push(`summary: "${summary}"`);
  if (created !== null) lines.push(`created: ${created}`);
  lines.push(`tags: [${tags.join(", ")}]`, "---", "", "# Sample Note");
  for (const [heading, body] of Object.entries(sections)) {
    if (body !== null) lines.push("", `## ${heading}`, "", body);
  }
  return `${lines.join("\n")}\n`;
}

function decisionNote(overrides: NoteOptions = {}): string {
  return renderNote(
    {
      family: "decision",
      summary: "Pick a clear option.",
      created: "2026-11-28",
      tags: ["example-wiki", "home"],
      sections: {
        Answer: "Choose option A.",
        Evidence: "Benchmarks confirm A.",
      },
    },
    overrides,
  );
}

function projectNote(overrides: NoteOptions = {}): string {
  return renderNote(
    {
      family: "project",
      summary: "Deliver the widget.",
      created: "2026-11-28",
      tags: ["example-wiki"],
      sections: { Purpose: "Ship the first version." },
    },
    overrides,
  );
}

function runFamilyCheck(wiki: string) {
  return readFamilyCheckRun(runCoreCli(["family", "check", "--wiki", wiki]));
}

function summary(findings: readonly ObservedFinding[]) {
  return findings.map(({ path, check, kind }) => `${path}|${check}|${kind}`);
}

describe("family check --wiki (AC-01 combined checks)", () => {
  test("prototype row 1: valid note reports zero findings and exits 0", () => {
    const wiki = familyWikiFixture({
      table: prototypeTable,
      notes: { "wiki/decisions/valid.md": decisionNote() },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.commandIdentity).toBe("agent-wiki-core.family.check");
    expect(run.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.notes).toBe(1);
    expect(run.findings).toEqual([]);
  });

  test("prototype row 2: missing created reports created-missing under base-fields", () => {
    const wiki = familyWikiFixture({
      table: prototypeTable,
      notes: {
        "wiki/decisions/no-created.md": decisionNote({ created: null }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(1);
    expect(summary(run.findings)).toEqual([
      "wiki/decisions/no-created.md|base-fields|created-missing",
    ]);
  });

  test("prototype row 3: missing Answer heading and hint-only heading report required-section-empty under heading-rule", () => {
    const wiki = familyWikiFixture({
      table: prototypeTable,
      notes: {
        "wiki/decisions/no-answer.md": decisionNote({
          sections: { Answer: null },
        }),
        "wiki/decisions/hint-only.md": decisionNote({
          sections: { Answer: "<!-- State the decision. -->" },
        }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(2);
    expect(summary(run.findings)).toEqual([
      "wiki/decisions/hint-only.md|heading-rule|required-section-empty",
      "wiki/decisions/no-answer.md|heading-rule|required-section-empty",
    ]);
  });

  test("prototype row 4: edited template dropping Evidence does not silence required-section-empty", () => {
    const wiki = familyWikiFixture({
      table: prototypeTable,
      templates: {
        "templates/decision.md":
          "---\nfamily: decision\n---\n\n# {{title}}\n\n## Answer\n",
      },
      notes: {
        "wiki/decisions/no-evidence.md": decisionNote({
          sections: { Evidence: null },
        }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(1);
    expect(summary(run.findings)).toEqual([
      "wiki/decisions/no-evidence.md|heading-rule|required-section-empty",
    ]);
  });

  test("combines base-fields and heading-rule findings on the same note and exits 0", () => {
    const wiki = familyWikiFixture({
      table: prototypeTable,
      notes: {
        "wiki/decisions/both.md": decisionNote({
          created: null,
          sections: { Answer: null },
        }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(1);
    expect(summary(run.findings)).toEqual([
      "wiki/decisions/both.md|base-fields|created-missing",
      "wiki/decisions/both.md|heading-rule|required-section-empty",
    ]);
  });

  test("reports too-many-tags for base tag plus two discovery tags under tagLimit: 2", () => {
    const wiki = familyWikiFixture({
      table: prototypeTable,
      notes: {
        "wiki/decisions/three-tags.md": decisionNote({
          tags: ["example-wiki", "travel", "home"],
        }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(summary(run.findings)).toEqual([
      "wiki/decisions/three-tags.md|base-fields|too-many-tags",
    ]);
  });

  test("families-only table gives neither base-tag-missing nor unapproved-tag", () => {
    const wiki = familyWikiFixture({
      table: {
        families: [
          {
            family: "project",
            folder: "wiki/projects/",
            headings: [{ name: "Purpose", optional: false }],
          },
        ],
      },
      notes: {
        "wiki/projects/sample-note.md": projectNote({
          tags: ["anything", "else"],
        }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(1);
    expect(run.findings).toEqual([]);
  });

  test("null tagLimit and summaryMaxLength turn their rules off", () => {
    const wiki = familyWikiFixture({
      table: {
        tagLimit: null,
        summaryMaxLength: null,
        families: [
          {
            family: "project",
            folder: "wiki/projects/",
            headings: [{ name: "Purpose", optional: false }],
          },
        ],
      },
      notes: {
        "wiki/projects/sample-note.md": projectNote({
          tags: ["a", "b", "c", "d"],
          summary: "x".repeat(300),
        }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.findings).toEqual([]);
  });

  test("emits every base-field finding kind by literal value", () => {
    const wiki = familyWikiFixture({
      table: prototypeTable,
      notes: {
        "wiki/projects/missing-family.md": projectNote({ family: null }),
        "wiki/projects/undefined-family.md": projectNote({ family: "ghost" }),
        "wiki/projects/mismatch-family.md": decisionNote(),
        "wiki/projects/bad-tags-and-summary.md": projectNote({
          tags: ["not-approved"],
          summary: "a".repeat(81),
        }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(summary(run.findings)).toEqual([
      "wiki/projects/bad-tags-and-summary.md|base-fields|base-tag-missing",
      "wiki/projects/bad-tags-and-summary.md|base-fields|unapproved-tag",
      "wiki/projects/bad-tags-and-summary.md|base-fields|summary-too-long",
      "wiki/projects/mismatch-family.md|base-fields|family-mismatch",
      "wiki/projects/missing-family.md|base-fields|family-missing",
      "wiki/projects/undefined-family.md|base-fields|family-not-defined",
    ]);
  });

  test("refuses with exit 3 and DOMAIN_PRECONDITION_UNMET when family-table.json is missing", () => {
    const run = runFamilyCheck(familyWikiFixture({}));

    expect(run.exitCode).toBe(3);
    expect(run.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.message).toContain("family-table.json");
  });
});

describe("family check --wiki (AC-02 five placement rows)", () => {
  test("unfiled folder note gives no findings", () => {
    const wiki = familyWikiFixture({
      table: prototypeTable,
      notes: { "wiki/inbox/draft.md": "# Rough notes\n" },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(1);
    expect(run.findings).toEqual([]);
  });

  test("another family-free folder checks base fields without family requirements and checks headings when family is defined", () => {
    const wiki = familyWikiFixture({
      table: prototypeTable,
      notes: {
        "wiki/archive/no-family.md": projectNote({
          family: null,
          summary: null,
          sections: { Purpose: null },
        }),
        "wiki/archive/named-family.md": projectNote({
          family: "project",
          sections: { Purpose: null },
        }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(2);
    expect(summary(run.findings)).toEqual([
      "wiki/archive/named-family.md|heading-rule|required-section-empty",
      "wiki/archive/no-family.md|base-fields|summary-missing",
    ]);
  });

  test("wiki/index.md without family is not counted; wiki/stray.md with family gets outside-family-folder and summary/created only", () => {
    const wiki = familyWikiFixture({
      table: prototypeTable,
      notes: {
        "wiki/index.md": "# Wiki Home\n",
        "wiki/stray.md": projectNote({ tags: [] }),
        "wiki/stray-no-summary.md": projectNote({ tags: [], summary: null }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(2);
    expect(summary(run.findings)).toEqual([
      "wiki/stray-no-summary.md|base-fields|outside-family-folder",
      "wiki/stray-no-summary.md|base-fields|summary-missing",
      "wiki/stray.md|base-fields|outside-family-folder",
    ]);
  });

  test("under unfiledFolder: null, wiki/stray.md with family still gives outside-family-folder", () => {
    const wiki = familyWikiFixture({
      table: { ...prototypeTable, unfiledFolder: null },
      notes: { "wiki/stray.md": projectNote({ tags: [] }) },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(1);
    expect(summary(run.findings)).toEqual([
      "wiki/stray.md|base-fields|outside-family-folder",
    ]);
  });

  test("undeclared folder gives unknown-folder plus tag, summary, created and heading rules", () => {
    const wiki = familyWikiFixture({
      table: prototypeTable,
      notes: {
        "wiki/misc/loose.md": projectNote(),
        "wiki/misc/broken.md": projectNote({
          tags: [],
          created: null,
          summary: null,
          sections: { Purpose: null },
        }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(2);
    expect(summary(run.findings)).toEqual([
      "wiki/misc/broken.md|base-fields|unknown-folder",
      "wiki/misc/broken.md|base-fields|base-tag-missing",
      "wiki/misc/broken.md|base-fields|created-missing",
      "wiki/misc/broken.md|base-fields|summary-missing",
      "wiki/misc/broken.md|heading-rule|required-section-empty",
      "wiki/misc/loose.md|base-fields|unknown-folder",
    ]);
  });

  test("note in a family folder naming another defined family is checked against its own family's headings", () => {
    const wiki = familyWikiFixture({
      table: prototypeTable,
      notes: {
        "wiki/projects/wrong-folder.md": decisionNote({
          sections: { Answer: null },
        }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(1);
    expect(summary(run.findings)).toEqual([
      "wiki/projects/wrong-folder.md|base-fields|family-mismatch",
      "wiki/projects/wrong-folder.md|heading-rule|required-section-empty",
    ]);
    expect(run.findings[1]?.detail).toContain("Answer");
  });

  test("reserved folder accepts its reserved family and subfolders report note-in-subfolder", () => {
    const wiki = familyWikiFixture({
      table: prototypeTable,
      notes: {
        "wiki/areas/health.md": projectNote({
          family: "area",
          sections: { Purpose: null },
        }),
        "wiki/projects/nested/deep.md": projectNote(),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(2);
    expect(summary(run.findings)).toEqual([
      "wiki/projects/nested/deep.md|note-name|note-in-subfolder",
    ]);
  });

  test("agent-wiki-core/family exports checkNote with Check, Finding, and NoteRules types", () => {
    const loaded = readFamilyTable(
      familyWikiFixture({ table: prototypeTable }),
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const note = parseNote(
      "wiki/decisions/in-memory.md",
      decisionNote({ created: null }),
    );
    const noteRules: NoteRules = (checkedNote, family) => [
      {
        path: checkedNote.path,
        kind: "example-wiki-rule",
        detail: `Checked ${family?.family ?? "none"}.`,
      },
    ];
    const findings: Finding[] = checkNote(note, loaded.table, { noteRules });
    const checks: Check[] = findings.map((item) => item.check);
    expect(checks).toEqual(["base-fields", "wiki-rule"]);
    expect(findings.map((item) => item.kind)).toEqual([
      "created-missing",
      "example-wiki-rule",
    ]);
  });
});
