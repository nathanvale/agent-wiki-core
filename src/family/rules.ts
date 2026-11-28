import { placementOf } from "../family-table/rules.ts";
import type { Family, FamilyTable } from "../family-table/rules.ts";
import { baseFieldFindings } from "../note-contract/rules.ts";
import { rawSectionsOf } from "../shared/rules.ts";
import type { Note } from "../shared/rules.ts";

export type Check = "base-fields" | "heading-rule" | "wiki-rule";

type HeadingRuleFinding = {
  readonly path: string;
  readonly kind: "required-section-empty";
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

export type CheckNoteOptions = {
  readonly noteRules?: NoteRules;
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
  ];

  if (options?.noteRules !== undefined) {
    for (const finding of options.noteRules(
      note,
      placement.effectiveFamily,
      table,
    )) {
      findings.push({
        ...finding,
        check: "wiki-rule",
      });
    }
  }

  return findings;
}
