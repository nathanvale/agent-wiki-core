import { dirname, relative, resolve } from "node:path";
import { canonicalRouteNames } from "../shared/rules.ts";

export const pinnedRumdlVersion = "0.3.5";

export type NotesFindingGroupCause =
  | "DOMAIN_NOTES_BROKEN_LINKS"
  | "DOMAIN_NOTES_HEADING_STRUCTURE"
  | "DOMAIN_NOTES_LIST_AND_TABLE_FORMAT"
  | "DOMAIN_NOTES_CODE_AND_INLINE_SYNTAX"
  | "DOMAIN_NOTES_WHITESPACE_AND_ENCODING"
  | "DOMAIN_NOTES_UNMAPPED_RULE";

const findingGroupOrder: readonly NotesFindingGroupCause[] = [
  "DOMAIN_NOTES_BROKEN_LINKS",
  "DOMAIN_NOTES_HEADING_STRUCTURE",
  "DOMAIN_NOTES_LIST_AND_TABLE_FORMAT",
  "DOMAIN_NOTES_CODE_AND_INLINE_SYNTAX",
  "DOMAIN_NOTES_WHITESPACE_AND_ENCODING",
  "DOMAIN_NOTES_UNMAPPED_RULE",
];

export type RawRumdlFinding = {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly rule: string;
  readonly message: string;
  readonly severity: string;
  readonly fixable: boolean;
};

export type TargetLabel = "note" | "template";

export type MappedNoteFinding = {
  readonly path: string;
  readonly targetLabel: TargetLabel;
  readonly line: number;
  readonly column: number;
  readonly rule: string;
  readonly message: string;
  readonly group: NotesFindingGroupCause;
  readonly repair: string;
  readonly mapped: boolean;
};

export type GroupedNoteFindings = {
  readonly causeCode: NotesFindingGroupCause;
  readonly label: string;
  readonly findings: readonly MappedNoteFinding[];
};

type RuleGuidance = {
  readonly group: NotesFindingGroupCause;
  readonly repair: string;
};

const groupLabels: Readonly<Record<NotesFindingGroupCause, string>> = {
  DOMAIN_NOTES_BROKEN_LINKS: "links and references",
  DOMAIN_NOTES_HEADING_STRUCTURE: "heading and properties structure",
  DOMAIN_NOTES_LIST_AND_TABLE_FORMAT: "list, table and quote layout",
  DOMAIN_NOTES_CODE_AND_INLINE_SYNTAX: "code block and inline Markdown syntax",
  DOMAIN_NOTES_WHITESPACE_AND_ENCODING: "whitespace, encoding and text hygiene",
  DOMAIN_NOTES_UNMAPPED_RULE: "unmapped rumdl rule",
};

const linkRules: Readonly<Record<string, string>> = {
  MD011:
    "Fix the reversed Markdown link syntax so it uses [label](target) order.",
  MD034:
    "Wrap bare URLs in Markdown link syntax [label](url) or angle brackets.",
  MD039: "Remove leading or trailing spaces inside the link text brackets.",
  MD042: `Fill in the empty link target by pointing at an existing record with ${canonicalRouteNames.recordFind}, or remove the link.`,
  MD045: "Add descriptive alternate text inside the image brackets.",
  MD051:
    "Point the link fragment at a heading that exists in the target note, or remove the fragment.",
  MD052:
    "Define the missing reference link target or replace it with a direct relative link.",
  MD053: "Remove the unused link or image reference definition.",
  MD054: "Use inline Markdown links consistently across the note.",
  MD057: `A note links to a file that is not in this wiki: point it at an existing record with ${canonicalRouteNames.recordFind}, or remove the link.`,
  MD059:
    "Replace generic link text with words that name the linked record or source.",
  MD062: "Remove leading or trailing spaces inside the link destination.",
  MD066: "Match every footnote reference with a single footnote definition.",
  MD067:
    "Order footnote definitions to match the order they are first referenced.",
  MD068: "Add content to the empty footnote definition or remove it.",
  MD074: "Point the navigation link at an existing note or remove it.",
  MD095:
    "Replace confusable non-ASCII characters in the link destination with plain ASCII.",
};

const headingRules: Readonly<Record<string, string>> = {
  MD001:
    "Change the heading level so headings step down by one level at a time without skipping.",
  MD003: "Use ATX hash headings (#, ##, ###) consistently across the note.",
  MD018: "Add a single space after the # markers at the start of the heading.",
  MD019: "Use a single space after the # markers at the start of the heading.",
  MD020: "Add a space inside the closing # markers or drop the closing hashes.",
  MD021:
    "Use a single space inside the closing # markers or drop the closing hashes.",
  MD022: "Add a blank line above and below the heading.",
  MD023: "Remove leading spaces so the heading starts at column 1.",
  MD024:
    "Rename or merge the duplicate heading so sibling headings are distinct.",
  MD025: "Keep a single top-level (#) heading in each note.",
  MD026: "Remove trailing punctuation from the end of the heading.",
  MD036: "Replace the bold or italic stand-in line with a real ## heading.",
  MD041: "Start the note body with a single top-level (#) heading.",
  MD043: "Align the note's headings with its family template.",
  MD063: "Fix the heading capitalization to match the note's heading style.",
  MD071: "Add a blank line immediately after the closing --- properties fence.",
  MD072: "Sort the properties-block keys alphabetically.",
  MD073: "Update the table of contents so it matches the note's headings.",
  MD080: "Make each heading anchor unique within the note.",
  MD082:
    "Add content under the heading or remove the empty heading before the next one.",
  MD090: "Remove the horizontal rule immediately above the heading.",
  MD093: "Remove inline formatting markers from the heading text.",
};

const listAndTableRules: Readonly<Record<string, string>> = {
  MD004: "Use '-' consistently for every unordered list marker in the note.",
  MD005: "Align nested list items at the same indentation column.",
  MD007: "Indent nested unordered list items consistently by two spaces.",
  MD027: "Use a single space after the blockquote '>' marker.",
  MD028:
    "Put '>' on the blank line to keep one blockquote, or separate into two.",
  MD029: "Number ordered list items sequentially starting at 1.",
  MD030: "Use a single space after each list marker.",
  MD032: "Add a blank line above and below the list.",
  MD055: "Use leading and trailing pipes consistently on every table row.",
  MD056: "Give every row in the Markdown table the same number of columns.",
  MD058: "Add a blank line above and below the Markdown table.",
  MD060: "Align the Markdown table column pipes consistently.",
  MD069: "Remove the duplicated list marker on the line.",
  MD075: "Add a table header and separator row or rewrite without pipe syntax.",
  MD076: "Keep blank lines between list items consistent across the list.",
  MD077: "Align list continuation lines with the item's text column.",
  MD096: "Sort the Markdown table rows by the configured column.",
};

const codeAndInlineRules: Readonly<Record<string, string>> = {
  MD014:
    "Remove the leading '$' shell prompt in the code block or include its output.",
  MD031: "Add a blank line above and below the fenced code block.",
  MD033: "Replace inline HTML with plain Markdown.",
  MD035: "Use '---' consistently for horizontal rules.",
  MD037: "Remove spaces immediately inside emphasis markers (* or _).",
  MD038: "Remove leading or trailing spaces inside the inline code span.",
  MD040: "Add a language name after the opening code fence (for example text).",
  MD046: "Use fenced code blocks (```) consistently instead of indented ones.",
  MD048: "Use backticks (```) consistently for fenced code blocks.",
  MD049: "Use one emphasis marker style (* or _) consistently across the note.",
  MD050: "Use '**' consistently for strong emphasis across the note.",
  MD065: "Add a blank line above and below the horizontal rule.",
  MD070: "Use a longer outer fence (````) when nesting fenced code blocks.",
  MD078: "Add a label to the executable code chunk or use a plain code fence.",
  MD079: "Remove whitespace from the code chunk label.",
  MD081:
    "Reduce inline emphasis markers to standard single or double emphasis.",
  MD086: "Close the unclosed HTML comment with -->.",
  MD087: "Remove the unused inline linter disable comment.",
  MD091:
    "Separate Markdown from the surrounding HTML block with blank lines or remove the HTML wrapper.",
};

const whitespaceAndEncodingRules: Readonly<Record<string, string>> = {
  MD009: "Remove trailing spaces at the end of the line.",
  MD010: "Replace tab characters with spaces.",
  MD012: "Collapse multiple consecutive blank lines down to one blank line.",
  MD013: "Shorten or wrap the line if line-length limits are enabled.",
  MD044: "Match the required capitalization of the proper name.",
  MD047: "End the file with a single trailing newline.",
  MD061: "Remove or reword the forbidden term.",
  MD064: "Collapse multiple consecutive spaces into a single space.",
  MD083: "Fix the garbled mojibake text back to clean UTF-8.",
  MD084: "Remove the invisible or discouraged Unicode character.",
  MD085: "Remove leading indentation from the paragraph continuation line.",
  MD088: "Replace smart quotes or dashes with plain ASCII equivalents.",
  MD089: "Add a space between adjacent CJK and Latin characters.",
  MD092: "Resolve the Git merge conflict markers in the note.",
  MD094: "Re-save the note as valid UTF-8.",
};

function buildRuleTable(): ReadonlyMap<string, RuleGuidance> {
  const entries: [string, RuleGuidance][] = [];
  const register = (
    group: NotesFindingGroupCause,
    rules: Readonly<Record<string, string>>,
  ) => {
    for (const [code, repair] of Object.entries(rules)) {
      entries.push([code, { group, repair }]);
    }
  };
  register("DOMAIN_NOTES_BROKEN_LINKS", linkRules);
  register("DOMAIN_NOTES_HEADING_STRUCTURE", headingRules);
  register("DOMAIN_NOTES_LIST_AND_TABLE_FORMAT", listAndTableRules);
  register("DOMAIN_NOTES_CODE_AND_INLINE_SYNTAX", codeAndInlineRules);
  register("DOMAIN_NOTES_WHITESPACE_AND_ENCODING", whitespaceAndEncodingRules);
  return new Map(entries);
}

const ruleTable = buildRuleTable();

export function parseRumdlVersion(stdout: string): string | null {
  const match =
    /\brumdl\s+([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)\b/.exec(
      stdout.trim(),
    );
  return match?.[1] ?? null;
}

function readFindingRecord(item: unknown): RawRumdlFinding | null {
  if (typeof item !== "object" || item === null) return null;
  const file: unknown = Reflect.get(item, "file");
  const line: unknown = Reflect.get(item, "line");
  const column: unknown = Reflect.get(item, "column");
  const rule: unknown = Reflect.get(item, "rule");
  const message: unknown = Reflect.get(item, "message");
  const severity: unknown = Reflect.get(item, "severity");
  const fixable: unknown = Reflect.get(item, "fixable");
  if (
    typeof file !== "string" ||
    typeof line !== "number" ||
    typeof column !== "number" ||
    typeof rule !== "string" ||
    typeof message !== "string"
  ) {
    return null;
  }
  return {
    file,
    line,
    column,
    rule,
    message,
    severity: typeof severity === "string" ? severity : "warning",
    fixable: typeof fixable === "boolean" ? fixable : false,
  };
}

export function parseRumdlFindings(
  stdout: string,
): readonly RawRumdlFinding[] | null {
  const trimmed = stdout.trim();
  if (trimmed === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const findings: RawRumdlFinding[] = [];
  for (const item of parsed) {
    const record = readFindingRecord(item);
    if (record === null) return null;
    findings.push(record);
  }
  return findings;
}

function relativeNotePath(wikiRoot: string, filePath: string): string {
  const rel = relative(wikiRoot, resolve(wikiRoot, filePath));
  return rel.replaceAll("\\", "/");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export type SkippedExternalLink = {
  readonly path: string;
  readonly line: number;
  readonly target: string;
};

export type PartitionedFindings = {
  readonly inWikiFindings: readonly RawRumdlFinding[];
  readonly skippedExternalLinks: readonly SkippedExternalLink[];
};

const md057LinkPattern = /^Relative link '([^']+)' does not exist$/;

export function partitionExternalRelativeLinks(
  raw: readonly RawRumdlFinding[],
  wikiRoot: string,
): PartitionedFindings {
  const inWikiFindings: RawRumdlFinding[] = [];
  const skippedExternalLinks: SkippedExternalLink[] = [];
  const rootPath = resolve(wikiRoot);
  for (const finding of raw) {
    if (finding.rule === "MD057") {
      const target = md057LinkPattern.exec(finding.message)?.[1];
      if (target !== undefined) {
        const bareTarget = target.split(/[?#]/, 1)[0] ?? target;
        const noteAbsPath = resolve(rootPath, finding.file);
        const resolvedTarget = resolve(dirname(noteAbsPath), bareTarget);
        const relTarget = relative(rootPath, resolvedTarget).replaceAll(
          "\\",
          "/",
        );
        if (relTarget === ".." || relTarget.startsWith("../")) {
          skippedExternalLinks.push({
            path: relativeNotePath(rootPath, finding.file),
            line: finding.line,
            target,
          });
          continue;
        }
      }
    }
    inWikiFindings.push(finding);
  }
  return { inWikiFindings, skippedExternalLinks };
}

function classifyTarget(relativePath: string): TargetLabel {
  return relativePath === "templates" || relativePath.startsWith("templates/")
    ? "template"
    : "note";
}

export function countFindingsByLabel(groups: readonly GroupedNoteFindings[]): {
  readonly note: number;
  readonly template: number;
} {
  let note = 0;
  let template = 0;
  for (const group of groups) {
    for (const item of group.findings) {
      if (item.targetLabel === "template") template += 1;
      else note += 1;
    }
  }
  return { note, template };
}

export function groupFindings(
  raw: readonly RawRumdlFinding[],
  wikiRoot: string,
): readonly GroupedNoteFindings[] {
  const buckets = new Map<NotesFindingGroupCause, MappedNoteFinding[]>();
  for (const finding of raw) {
    const mapped = ruleTable.get(finding.rule);
    const group: NotesFindingGroupCause =
      mapped?.group ?? "DOMAIN_NOTES_UNMAPPED_RULE";
    const repair =
      mapped === undefined
        ? `Unmapped rumdl rule ${finding.rule}: ${finding.message}. Add a mapping for ${finding.rule} in src/note/rules.ts and fix the note.`
        : mapped.repair;
    const path = relativeNotePath(wikiRoot, finding.file);
    const entry: MappedNoteFinding = {
      path,
      targetLabel: classifyTarget(path),
      line: finding.line,
      column: finding.column,
      rule: finding.rule,
      message: finding.message,
      group,
      repair,
      mapped: mapped !== undefined,
    };
    const bucket = buckets.get(group);
    if (bucket === undefined) buckets.set(group, [entry]);
    else bucket.push(entry);
  }
  const ordered: GroupedNoteFindings[] = [];
  for (const causeCode of findingGroupOrder) {
    const items = buckets.get(causeCode);
    if (items === undefined || items.length === 0) continue;
    items.sort(
      (left, right) =>
        compareText(left.path, right.path) ||
        left.line - right.line ||
        left.column - right.column ||
        compareText(left.rule, right.rule),
    );
    ordered.push({
      causeCode,
      label: groupLabels[causeCode],
      findings: items,
    });
  }
  return ordered;
}

export function formatGroupedRefusal(
  groups: readonly GroupedNoteFindings[],
  filesChecked: number,
  totalFindings: number,
): string {
  const lines: string[] = [
    `${String(totalFindings)} Markdown finding${totalFindings === 1 ? "" : "s"} in ${String(filesChecked)} file${filesChecked === 1 ? "" : "s"} across ${String(groups.length)} group${groups.length === 1 ? "" : "s"}:`,
  ];
  for (const group of groups) {
    lines.push(
      `[${group.causeCode}] ${group.label} (${String(group.findings.length)}):`,
    );
    for (const item of group.findings) {
      lines.push(
        `  - [${item.targetLabel}] ${item.path}:${String(item.line)} [${item.rule}] ${item.message}`,
      );
      lines.push(`    Repair: ${item.repair}`);
    }
  }
  return lines.join("\n");
}
