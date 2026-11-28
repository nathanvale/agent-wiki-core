import { describe, expect, test } from "bun:test";
import { checkNote, readFamilyTable } from "agent-wiki-core/family";
import type { Check, Finding } from "agent-wiki-core/family";
import { baseFields, parseNote } from "agent-wiki-core/notes";
import {
  familyWikiFixture,
  readFamilyCheckRun,
  runCoreCli,
} from "./support/family-wiki.ts";
import type { ObservedFinding } from "./support/family-wiki.ts";

const variantTable = {
  baseTag: "example-wiki",
  discoveryTags: ["travel", "home"],
  tagLimit: 2,
  summaryMaxLength: 80,
  unfiledFolder: "wiki/inbox/",
  familyFreeFolders: ["wiki/inbox/", "wiki/archive/"],
  families: [
    {
      family: "study",
      folder: "wiki/studies/",
      headings: [
        { name: "Answer", hint: "State the answer.", optional: false },
        {
          name: "Evidence",
          hint: "Link the evidence.",
          optional: false,
          afterVariants: true,
        },
        { name: "Notes", optional: true, afterVariants: true },
      ],
      variants: [
        {
          name: "engineering",
          headings: [{ name: "Constraints", hint: "Key technical bounds." }],
        },
        {
          name: "holiday",
          headings: [
            { name: "Deadlines", hint: "Book, cancel and pay by dates." },
          ],
        },
        {
          name: "buying",
          headings: [{ name: "Shortlist" }],
        },
      ],
    },
    {
      family: "project",
      folder: "wiki/projects/",
      headings: [{ name: "Purpose", optional: false }],
    },
  ],
};

type VariantNoteOptions = {
  readonly family?: string | null;
  readonly variant?: string | null;
  readonly summary?: string | null;
  readonly created?: string | null;
  readonly tags?: readonly string[];
  readonly sections?: Readonly<Record<string, string | null>>;
};

function renderNote(
  defaults: Required<VariantNoteOptions>,
  overrides: VariantNoteOptions = {},
): string {
  const family =
    overrides.family === undefined ? defaults.family : overrides.family;
  const variant =
    overrides.variant === undefined ? defaults.variant : overrides.variant;
  const summary =
    overrides.summary === undefined ? defaults.summary : overrides.summary;
  const created =
    overrides.created === undefined ? defaults.created : overrides.created;
  const tags = overrides.tags ?? defaults.tags;
  const sections = { ...defaults.sections, ...overrides.sections };
  const lines = ["---"];
  if (family !== null) lines.push(`family: ${family}`);
  if (variant !== null) lines.push(`variant: ${variant}`);
  if (summary !== null) lines.push(`summary: "${summary}"`);
  if (created !== null) lines.push(`created: ${created}`);
  lines.push(`tags: [${tags.join(", ")}]`, "---", "", "# Sample Note");
  for (const [heading, body] of Object.entries(sections)) {
    if (body !== null) lines.push("", `## ${heading}`, "", body);
  }
  return `${lines.join("\n")}\n`;
}

function studyNote(overrides: VariantNoteOptions = {}): string {
  return renderNote(
    {
      family: "study",
      variant: "engineering",
      summary: "Compare candidate designs.",
      created: "2026-11-28",
      tags: ["example-wiki"],
      sections: {
        Answer: "Use the simpler design.",
        Evidence: "Benchmarks confirm lower latency.",
      },
    },
    overrides,
  );
}

function projectNote(overrides: VariantNoteOptions = {}): string {
  return renderNote(
    {
      family: "project",
      variant: null,
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

describe("family check --wiki (AC-01 prototype rows for variants)", () => {
  test("prototype row 1: valid engineering note reports zero findings", () => {
    const wiki = familyWikiFixture({
      table: variantTable,
      notes: { "wiki/studies/valid-engineering.md": studyNote() },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.commandIdentity).toBe("agent-wiki-core.family.check");
    expect(run.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.notes).toBe(1);
    expect(run.findings).toEqual([]);
  });

  test("prototype row 2: variant holday reports variant-not-installed under variant check", () => {
    const wiki = familyWikiFixture({
      table: variantTable,
      notes: {
        "wiki/studies/typo-variant.md": studyNote({ variant: "holday" }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(1);
    expect(summary(run.findings)).toEqual([
      "wiki/studies/typo-variant.md|variant|variant-not-installed",
    ]);
  });

  test("prototype row 3: missing variant reports variant-missing under variant check", () => {
    const wiki = familyWikiFixture({
      table: variantTable,
      notes: {
        "wiki/studies/no-variant.md": studyNote({ variant: null }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(1);
    expect(summary(run.findings)).toEqual([
      "wiki/studies/no-variant.md|variant|variant-missing",
    ]);
  });

  test("prototype row 4: no created, no Answer, and unknown variant give one finding from each check", () => {
    const wiki = familyWikiFixture({
      table: variantTable,
      notes: {
        "wiki/studies/all-three.md": studyNote({
          created: null,
          variant: "holday",
          sections: { Answer: null },
        }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(1);
    expect(summary(run.findings)).toEqual([
      "wiki/studies/all-three.md|base-fields|created-missing",
      "wiki/studies/all-three.md|heading-rule|required-section-empty",
      "wiki/studies/all-three.md|variant|variant-not-installed",
    ]);
  });

  test("prototype row 5: edited variant template dropping Evidence still reports required-section-empty under heading-rule", () => {
    const wiki = familyWikiFixture({
      table: variantTable,
      templates: {
        "templates/study-engineering.md":
          "---\nfamily: study\nvariant: engineering\n---\n\n# {{title}}\n\n## Answer\n",
      },
      notes: {
        "wiki/studies/no-evidence.md": studyNote({
          sections: { Evidence: null },
        }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(1);
    expect(summary(run.findings)).toEqual([
      "wiki/studies/no-evidence.md|heading-rule|required-section-empty",
    ]);
  });
});

describe("family check --wiki (AC-02 families without variants and archived notes)", () => {
  test("a note carrying variant in a family without variants gives no finding", () => {
    const wiki = familyWikiFixture({
      table: variantTable,
      notes: {
        "wiki/projects/with-variant.md": projectNote({ variant: "anything" }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(1);
    expect(run.findings).toEqual([]);
  });

  test("an archived note naming a family with variants and no variant gives variant-missing", () => {
    const wiki = familyWikiFixture({
      table: variantTable,
      notes: {
        "wiki/archive/old-study.md": studyNote({ variant: null }),
      },
    });
    const run = runFamilyCheck(wiki);

    expect(run.exitCode).toBe(0);
    expect(run.notes).toBe(1);
    expect(summary(run.findings)).toEqual([
      "wiki/archive/old-study.md|variant|variant-missing",
    ]);
  });

  test("pins variant in baseFields, parseNote, and checkNote check label and kinds", () => {
    expect(Object.hasOwn(baseFields, "variant")).toBe(true);
    const loaded = readFamilyTable(familyWikiFixture({ table: variantTable }));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const missingNote = parseNote(
      "wiki/studies/in-memory-missing.md",
      studyNote({ variant: null }),
    );
    expect(missingNote.variant).toBeNull();
    const missingFindings: Finding[] = checkNote(missingNote, loaded.table);
    const missingChecks: Check[] = missingFindings.map((item) => item.check);
    expect(missingChecks).toEqual(["variant"]);
    expect(missingFindings.map((item) => item.kind)).toEqual([
      "variant-missing",
    ]);

    const unknownNote = parseNote(
      "wiki/studies/in-memory-unknown.md",
      studyNote({ variant: "holday" }),
    );
    expect(unknownNote.variant).toBe("holday");
    const unknownFindings: Finding[] = checkNote(unknownNote, loaded.table);
    expect(unknownFindings.map((item) => item.check)).toEqual(["variant"]);
    expect(unknownFindings.map((item) => item.kind)).toEqual([
      "variant-not-installed",
    ]);
  });
});
