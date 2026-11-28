import { placementOf } from "../family-table/rules.ts";
import type { Family, FamilyTable } from "../family-table/rules.ts";
import {
  folderOf,
  headerPattern,
  inertMarkup,
  nextFence,
  unixLineEndings,
} from "../shared/rules.ts";
import type { Note } from "../shared/rules.ts";

export type NoteNameFindingKind =
  | "name-mismatch"
  | "note-in-subfolder"
  | "shared-note-name"
  | "replaced-by-unresolved"
  | "created-missing";

export type NoteNameFinding = {
  readonly path: string;
  readonly kind: NoteNameFindingKind;
  readonly detail: string;
};

const datedPrefixPattern = /^\d{4}-\d{2}-\d{2}-/;
const levelOneHeadingPattern = /^#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

function fileNameOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function isSubfolderPath(path: string): boolean {
  return path.split("/").length > 3;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function firstHeading(text: string): string | null {
  const body = unixLineEndings(text.replace(/^\uFEFF/, "")).replace(
    headerPattern,
    "",
  );
  let fence: string | null = null;
  for (const line of body.split("\n")) {
    fence = nextFence(fence, line);
    if (fence !== null) continue;
    const matched = levelOneHeadingPattern.exec(line);
    if (matched === null) continue;
    const cleaned = inertMarkup(matched[1] ?? "");
    if (cleaned !== "") return cleaned;
  }
  return null;
}

export function noteTitle(note: Pick<Note, "title" | "text">): string | null {
  if (note.title !== null && note.title.trim() !== "") {
    return note.title.trim();
  }
  return firstHeading(note.text);
}

export function slugFromTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function familyFolderFor(
  familyName: string,
  table: FamilyTable,
): string | null {
  const defined = table.families.find((entry) => entry.family === familyName);
  if (defined !== undefined) return defined.folder;
  for (const [folder, reserved] of Object.entries(table.reservedFamilies)) {
    if (reserved === familyName) return folder;
  }
  return null;
}

function effectiveFamilyForPath(
  familyName: string | null,
  currentPath: string | null,
  table: FamilyTable,
): Family | null {
  if (familyName !== null) {
    const defined = table.families.find((entry) => entry.family === familyName);
    if (defined !== undefined) return defined;
  }
  if (currentPath !== null) {
    return placementOf({ path: currentPath, family: familyName }, table)
      .effectiveFamily;
  }
  return null;
}

function expectedFileNameFor(
  noteNames: FamilyTable["noteNames"],
  title: string,
  currentPath: string | null,
  created: string | null,
): string | null {
  if (noteNames === "any" && currentPath !== null) {
    const current = fileNameOf(currentPath);
    if (current !== "") return current;
  }
  const slug = slugFromTitle(title);
  if (slug === "") return null;
  if (noteNames !== "dated-title" || created === null) {
    return `${slug}.md`;
  }
  if (currentPath === null) {
    return `${created}-${slug}.md`;
  }
  return datedPrefixPattern.test(fileNameOf(currentPath))
    ? `${created}-${slug}.md`
    : `${slug}.md`;
}

export function expectedNotePath(
  input: {
    readonly family: string | null;
    readonly title: string;
    readonly currentPath?: string | null;
    readonly created?: string | null;
  },
  table: FamilyTable,
): string | null {
  const currentPath = input.currentPath ?? null;
  const folder =
    (input.family !== null ? familyFolderFor(input.family, table) : null) ??
    (currentPath !== null ? folderOf(currentPath) : null);
  if (folder === null) return null;
  const family = effectiveFamilyForPath(input.family, currentPath, table);
  const noteNames = family?.noteNames ?? table.noteNames;
  const fileName = expectedFileNameFor(
    noteNames,
    input.title,
    currentPath,
    input.created ?? null,
  );
  return fileName === null ? null : `${folder}${fileName}`;
}

function nameMismatchFinding(
  note: Note,
  noteNames: FamilyTable["noteNames"],
): NoteNameFinding | null {
  if (noteNames === "any") return null;
  const title = noteTitle(note);
  if (title === null) return null;
  const slug = slugFromTitle(title);
  if (slug === "") return null;
  const actual = fileNameOf(note.path);
  const undated = `${slug}.md`;
  if (actual === undated) return null;
  if (
    noteNames === "dated-title" &&
    note.created !== null &&
    actual === `${note.created}-${slug}.md`
  ) {
    return null;
  }
  const expectedDetail =
    noteNames === "dated-title" && note.created !== null
      ? `"${undated}" or "${note.created}-${slug}.md"`
      : `"${undated}"`;
  return {
    path: note.path,
    kind: "name-mismatch",
    detail: `Note file name "${actual}" does not match expected ${expectedDetail}.`,
  };
}

export function noteNameFindings(
  note: Note,
  table: FamilyTable,
): NoteNameFinding[] {
  const placement = placementOf(note, table);
  if (placement.kind === "unfiled") return [];

  const findings: NoteNameFinding[] = [];
  if (
    (placement.kind === "family-folder" || placement.kind === "family-free") &&
    isSubfolderPath(note.path)
  ) {
    findings.push({
      path: note.path,
      kind: "note-in-subfolder",
      detail: `Note sits in a subfolder below ${placement.folder}.`,
    });
  }

  const noteNames = placement.effectiveFamily?.noteNames ?? table.noteNames;
  const mismatch = nameMismatchFinding(note, noteNames);
  if (mismatch !== null) findings.push(mismatch);

  return findings;
}

function sharedNoteNameFindings(
  byName: ReadonlyMap<string, readonly Note[]>,
  replacedByTargets: ReadonlySet<string>,
  table: FamilyTable,
): NoteNameFinding[] {
  const findings: NoteNameFinding[] = [];
  for (const [nameKey, group] of byName) {
    if (group.length < 2) continue;
    if (!table.uniqueNoteNames && !replacedByTargets.has(nameKey)) continue;
    const sorted = group.toSorted((left, right) =>
      compareText(left.path, right.path),
    );
    const paths = sorted.map((note) => note.path);
    for (const note of sorted) {
      const others = paths.filter((path) => path !== note.path).join(", ");
      findings.push({
        path: note.path,
        kind: "shared-note-name",
        detail: `Note file name "${fileNameOf(note.path)}" is shared with ${others}.`,
      });
    }
  }
  return findings;
}

function recordMissingCreated(
  note: Note,
  table: FamilyTable,
  missingPaths: Set<string>,
): void {
  if (!table.createdRequired && note.created === null) {
    missingPaths.add(note.path);
  }
}

function replacedByFindingFor(
  source: Note,
  matches: readonly Note[],
  table: FamilyTable,
  missingCreatedPaths: Set<string>,
): NoteNameFinding | null {
  const targetName = source.replacedBy ?? "";
  if (matches.length === 0) {
    recordMissingCreated(source, table, missingCreatedPaths);
    return {
      path: source.path,
      kind: "replaced-by-unresolved",
      detail: `replaced_by target "${targetName}" does not match any filed note.`,
    };
  }
  if (matches.length > 1) {
    recordMissingCreated(source, table, missingCreatedPaths);
    return {
      path: source.path,
      kind: "replaced-by-unresolved",
      detail: `replaced_by target "${targetName}" matches multiple filed notes.`,
    };
  }
  const target = matches[0];
  if (target === undefined || target.path === source.path) {
    recordMissingCreated(source, table, missingCreatedPaths);
    return {
      path: source.path,
      kind: "replaced-by-unresolved",
      detail: `replaced_by target "${targetName}" cannot point to the note itself.`,
    };
  }
  if (source.created === null || target.created === null) {
    recordMissingCreated(source, table, missingCreatedPaths);
    recordMissingCreated(target, table, missingCreatedPaths);
    return {
      path: source.path,
      kind: "replaced-by-unresolved",
      detail: `replaced_by target "${targetName}" cannot be ordered without created dates on both notes.`,
    };
  }
  if (target.created < source.created) {
    return {
      path: source.path,
      kind: "replaced-by-unresolved",
      detail: `replaced_by target "${targetName}" (${target.created}) is earlier than this note (${source.created}).`,
    };
  }
  return null;
}

export function crossRecordNoteNameFindings(
  records: readonly Note[],
  table: FamilyTable,
): NoteNameFinding[] {
  const filed = records.filter(
    (note) => placementOf(note, table).kind !== "unfiled",
  );
  const byName = new Map<string, Note[]>();
  const replacedByTargets = new Set<string>();
  for (const note of filed) {
    const key = fileNameOf(note.path).toLowerCase();
    const list = byName.get(key) ?? [];
    list.push(note);
    byName.set(key, list);
    if (note.replacedBy !== null) {
      replacedByTargets.add(note.replacedBy.toLowerCase());
    }
  }

  const findings: NoteNameFinding[] = sharedNoteNameFindings(
    byName,
    replacedByTargets,
    table,
  );
  const missingCreatedPaths = new Set<string>();

  for (const source of filed) {
    if (source.replacedBy === null) continue;
    const matches = byName.get(source.replacedBy.toLowerCase()) ?? [];
    const finding = replacedByFindingFor(
      source,
      matches,
      table,
      missingCreatedPaths,
    );
    if (finding !== null) findings.push(finding);
  }

  for (const path of missingCreatedPaths) {
    findings.push({
      path,
      kind: "created-missing",
      detail:
        "Missing or invalid ISO created date (YYYY-MM-DD) required for replaced_by ordering.",
    });
  }

  return findings.toSorted(
    (left, right) =>
      compareText(left.path, right.path) || compareText(left.kind, right.kind),
  );
}
