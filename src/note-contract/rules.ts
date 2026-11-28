import { placementOf } from "../family-table/rules.ts";
import type { FamilyTable } from "../family-table/rules.ts";
import type { Note } from "../shared/rules.ts";

type BaseFieldFindingKind =
  | "outside-family-folder"
  | "unknown-folder"
  | "family-not-defined"
  | "family-missing"
  | "family-mismatch"
  | "base-tag-missing"
  | "unapproved-tag"
  | "too-many-tags"
  | "created-missing"
  | "summary-missing"
  | "summary-too-long";

type BaseFieldFinding = {
  readonly path: string;
  readonly kind: BaseFieldFindingKind;
  readonly detail: string;
};

function isKnownFamily(family: string, table: FamilyTable): boolean {
  if (table.families.some((entry) => entry.family === family)) return true;
  return Object.values(table.reservedFamilies).includes(family);
}

function familyFindings(
  note: Note,
  expectedFamily: string,
  folder: string,
  table: FamilyTable,
): BaseFieldFinding[] {
  if (note.family === null) {
    return [
      {
        path: note.path,
        kind: "family-missing",
        detail: `Missing family header field; expected "${expectedFamily}" for ${folder}.`,
      },
    ];
  }
  if (!isKnownFamily(note.family, table)) {
    return [
      {
        path: note.path,
        kind: "family-not-defined",
        detail: `Family "${note.family}" is not declared in family-table.json.`,
      },
    ];
  }
  if (note.family !== expectedFamily) {
    return [
      {
        path: note.path,
        kind: "family-mismatch",
        detail: `Family "${note.family}" does not match folder ${folder} (expected "${expectedFamily}").`,
      },
    ];
  }
  return [];
}

function tagFindings(note: Note, table: FamilyTable): BaseFieldFinding[] {
  const findings: BaseFieldFinding[] = [];
  if (table.baseTag !== null && !note.tags.includes(table.baseTag)) {
    findings.push({
      path: note.path,
      kind: "base-tag-missing",
      detail: `Missing base tag "${table.baseTag}".`,
    });
  }
  if (table.discoveryTags !== null) {
    const approved = new Set(table.discoveryTags);
    for (const tag of note.tags) {
      if (tag !== table.baseTag && !approved.has(tag)) {
        findings.push({
          path: note.path,
          kind: "unapproved-tag",
          detail: `Tag "${tag}" is not in discoveryTags.`,
        });
      }
    }
  }
  if (table.tagLimit !== null && note.tags.length > table.tagLimit) {
    findings.push({
      path: note.path,
      kind: "too-many-tags",
      detail: `Note has ${String(note.tags.length)} tags; the limit is ${String(table.tagLimit)}.`,
    });
  }
  return findings;
}

function createdAndSummaryFindings(
  note: Note,
  table: FamilyTable,
): BaseFieldFinding[] {
  const findings: BaseFieldFinding[] = [];
  if (note.created === null) {
    findings.push({
      path: note.path,
      kind: "created-missing",
      detail: "Missing or invalid ISO created date (YYYY-MM-DD).",
    });
  }
  if (note.summary === null) {
    findings.push({
      path: note.path,
      kind: "summary-missing",
      detail: "Missing or blank summary header field.",
    });
  } else if (
    table.summaryMaxLength !== null &&
    note.summary.length > table.summaryMaxLength
  ) {
    findings.push({
      path: note.path,
      kind: "summary-too-long",
      detail: `Summary is ${String(note.summary.length)} characters; the limit is ${String(table.summaryMaxLength)}.`,
    });
  }
  return findings;
}

export function baseFieldFindings(
  note: Note,
  table: FamilyTable,
): BaseFieldFinding[] {
  const placement = placementOf(note, table);
  if (placement.kind === "unfiled") return [];

  if (placement.kind === "wiki-root") {
    return [
      {
        path: note.path,
        kind: "outside-family-folder",
        detail: "Note sits directly under wiki/ instead of in a family folder.",
      },
      ...createdAndSummaryFindings(note, table),
    ];
  }

  if (placement.kind === "unknown-folder") {
    return [
      {
        path: note.path,
        kind: "unknown-folder",
        detail: `Folder "${placement.folder}" is not declared in family-table.json.`,
      },
      ...tagFindings(note, table),
      ...createdAndSummaryFindings(note, table),
    ];
  }

  if (placement.kind === "family-free") {
    return [
      ...tagFindings(note, table),
      ...createdAndSummaryFindings(note, table),
    ];
  }

  return [
    ...familyFindings(note, placement.expectedFamily, placement.folder, table),
    ...tagFindings(note, table),
    ...createdAndSummaryFindings(note, table),
  ];
}
