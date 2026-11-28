import { alwaysRenderedFields, placementOf } from "../family-table/rules.ts";
import type { Family, FamilyTable } from "../family-table/rules.ts";
import { baseFieldFindings } from "../note-contract/rules.ts";
import { rawSectionsOf } from "../shared/rules.ts";
import type { Note } from "../shared/rules.ts";

export type Check = "base-fields" | "heading-rule" | "variant" | "wiki-rule";

type HeadingRuleFinding = {
  readonly path: string;
  readonly kind: "required-section-empty";
  readonly detail: string;
};

type VariantFinding = {
  readonly path: string;
  readonly kind: "variant-missing" | "variant-not-installed";
  readonly detail: string;
};

export type WikiRuleFinding = {
  readonly path: string;
  readonly kind: string;
  readonly detail: string;
};

export type NoteRules = (
  note: Note,
  family: Family | null,
  table: FamilyTable,
) => readonly WikiRuleFinding[];

export type CrossRecordRules = (
  records: readonly Note[],
  table: FamilyTable,
) => readonly WikiRuleFinding[];

export type CheckNoteOptions = {
  readonly noteRules?: NoteRules;
};

export type FamilyCheckOptions = CheckNoteOptions & {
  readonly crossRecordRules?: CrossRecordRules;
};

export type Finding = {
  readonly path: string;
  readonly check: Check;
  readonly kind: string;
  readonly detail: string;
};

function meaningfulContent(body: string): string {
  return body.replace(/<!--[\s\S]*?-->/g, "").trim();
}

function headingRuleFindings(
  note: Note,
  family: Family | null,
): HeadingRuleFinding[] {
  if (family === null) return [];
  const sections = rawSectionsOf(note);
  const findings: HeadingRuleFinding[] = [];
  for (const heading of family.headings) {
    if (heading.optional) continue;
    const body = sections.get(heading.name.toLowerCase()) ?? "";
    if (meaningfulContent(body) === "") {
      findings.push({
        path: note.path,
        kind: "required-section-empty",
        detail: `Required heading "## ${heading.name}" is missing or empty.`,
      });
    }
  }
  return findings;
}

function variantFindings(note: Note, family: Family | null): VariantFinding[] {
  if (family === null || family.variants === undefined) return [];
  if (note.variant === null) {
    return [
      {
        path: note.path,
        kind: "variant-missing",
        detail: `Missing variant header field for family "${family.family}".`,
      },
    ];
  }
  const declared = family.variants.some((entry) => entry.name === note.variant);
  if (!declared) {
    return [
      {
        path: note.path,
        kind: "variant-not-installed",
        detail: `Variant "${note.variant}" is not declared for family "${family.family}" in family-table.json.`,
      },
    ];
  }
  return [];
}

function tagWikiRuleFindings(findings: readonly WikiRuleFinding[]): Finding[] {
  return findings.map((finding) => ({
    ...finding,
    check: "wiki-rule",
  }));
}

export function checkNote(
  note: Note,
  table: FamilyTable,
  options?: CheckNoteOptions,
): Finding[] {
  const placement = placementOf(note, table);
  if (placement.kind === "unfiled") return [];

  const findings: Finding[] = [
    ...baseFieldFindings(note, table).map((finding) => ({
      ...finding,
      check: "base-fields" as const,
    })),
    ...headingRuleFindings(note, placement.effectiveFamily).map((finding) => ({
      ...finding,
      check: "heading-rule" as const,
    })),
    ...variantFindings(note, placement.effectiveFamily).map((finding) => ({
      ...finding,
      check: "variant" as const,
    })),
  ];

  if (options?.noteRules !== undefined) {
    findings.push(
      ...tagWikiRuleFindings(
        options.noteRules(note, placement.effectiveFamily, table),
      ),
    );
  }

  return findings;
}

export function checkRecords(
  records: readonly Note[],
  table: FamilyTable,
  options?: FamilyCheckOptions,
): Finding[] {
  const perNote = records.flatMap((note) => checkNote(note, table, options));
  if (options?.crossRecordRules === undefined) return perNote;
  return [
    ...perNote,
    ...tagWikiRuleFindings(options.crossRecordRules(records, table)),
  ];
}

export type InstalledFamilyTemplate = {
  readonly path: string;
  readonly text: string | null;
};

export type TemplateDriftKind =
  | "template-missing"
  | "template-differs"
  | "template-unexpected";

export type TemplateDriftFinding = {
  readonly path: string;
  readonly kind: TemplateDriftKind;
  readonly detail: string;
};

function renderFamilyTemplate(family: Family, baseTag: string | null): string {
  const baseFieldValues: Record<(typeof alwaysRenderedFields)[number], string> =
    {
      family: family.family,
      title: '"{{title}}"',
      summary: '""',
      created: '"{{date}}"',
      tags: `[${baseTag === null ? "" : baseTag}]`,
    };
  const headerLines = [
    "---",
    ...alwaysRenderedFields.map((name) => `${name}: ${baseFieldValues[name]}`),
    ...family.familyFields.map((field) => `${field.name}: ${field.value}`),
    "---",
  ];
  const sections = family.headings.map((heading) =>
    heading.hint === undefined || heading.hint.trim() === ""
      ? `## ${heading.name}`
      : `## ${heading.name}\n\n<!-- ${heading.hint} -->`,
  );
  const body = ["# {{title}}", ...sections].join("\n\n");
  return `${headerLines.join("\n")}\n\n${body}\n`;
}

export function renderFamilyTemplates(
  table: FamilyTable,
): Readonly<Record<string, string>> {
  const templates: Record<string, string> = {};
  for (const family of table.families) {
    templates[`templates/${family.family}.md`] = renderFamilyTemplate(
      family,
      table.baseTag,
    );
  }
  return templates;
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function templateDriftFindings(
  expected: Readonly<Record<string, string>>,
  installed: readonly InstalledFamilyTemplate[],
): TemplateDriftFinding[] {
  const installedByPath = new Map<string, string | null>(
    installed.map((entry) => [entry.path, entry.text]),
  );
  const findings: TemplateDriftFinding[] = [];

  for (const [path, expectedText] of Object.entries(expected)) {
    if (!installedByPath.has(path)) {
      findings.push({
        path,
        kind: "template-missing",
        detail: "Installed family template is missing.",
      });
      continue;
    }
    const actualText = installedByPath.get(path);
    if (actualText === null) {
      findings.push({
        path,
        kind: "template-differs",
        detail: "the path is not a file",
      });
    } else if (actualText !== expectedText) {
      findings.push({
        path,
        kind: "template-differs",
        detail: "Installed family template differs from the rendered template.",
      });
    }
  }

  for (const entry of installed) {
    if (!Object.hasOwn(expected, entry.path)) {
      findings.push({
        path: entry.path,
        kind: "template-unexpected",
        detail: "Installed template is not declared in family-table.json.",
      });
    }
  }

  return findings.toSorted((left, right) =>
    comparePaths(left.path, right.path),
  );
}
