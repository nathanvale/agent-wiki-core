import { join, relative, resolve } from "node:path";
import type {
  commonCauses,
  DiagnosticsCapability,
  JsonValue,
  ParsedPath,
  ProgramsCapability,
} from "agent-cli-kernel";
import {
  hasLinkedTemplatesFolder,
  isFile,
  isWikiRoot,
  ownedMarkdownFiles,
  resolvePinnedRumdl,
} from "../shared/markdown-files.ts";
import { canonicalRouteNames } from "../shared/rules.ts";
import type { NotesFindingGroupCause } from "./rules.ts";
import {
  countFindingsByLabel,
  formatGroupedRefusal,
  groupFindings,
  partitionExternalRelativeLinks,
  pinnedRumdlVersion,
} from "./rules.ts";
import type { RawRumdlFinding, SkippedExternalLink } from "./rules.ts";
import { runRumdlCheck, verifyRumdlVersion } from "./rumdl-runs.ts";

export const defaultNotesBudgetMilliseconds = 10_000;
export const defaultNotesTimeoutMilliseconds = 30_000;

export type NoteCheckOutcome =
  | {
      readonly kind: "passed";
      readonly message: string;
      readonly data: {
        readonly rumdlVersion: string;
        readonly configPath: string;
        readonly filesChecked: number;
        readonly durationMilliseconds: number;
        readonly budgetMilliseconds: number;
        readonly findingCount: 0;
        readonly findings: readonly [];
        readonly externalLinksSkipped: readonly SkippedExternalLink[];
      };
    }
  | {
      readonly kind: "refused";
      readonly causeCode:
        | "DOMAIN_PRECONDITION_UNMET"
        | "DOMAIN_NOTES_LINTER_MISSING"
        | "DOMAIN_NOTES_LINTER_VERSION_MISMATCH"
        | "DOMAIN_NOTES_LINTER_FAILED"
        | "DOMAIN_NOTES_CHECK_BUDGET_EXCEEDED"
        | NotesFindingGroupCause;
      readonly message: string;
    };

export type NoteCheckContext = {
  readonly repoRoot: string;
  readonly wikiRoot: string;
  readonly rumdlOverride: string | undefined;
  readonly configOverride?: string | undefined;
  readonly budgetMilliseconds: number;
  readonly timeoutMilliseconds?: number;
  readonly programs: ProgramsCapability;
  readonly diagnostics: DiagnosticsCapability;
  readonly parsePath: (value: string) => ParsedPath;
};

function buildCheckOutcome(options: {
  readonly request: NoteCheckContext;
  readonly rawFindings: readonly RawRumdlFinding[];
  readonly configPath: string;
  readonly filesChecked: number;
  readonly rumdlRuns: number;
  readonly rumdlVersion: string;
  readonly durationMilliseconds: number;
}): NoteCheckOutcome {
  const {
    request,
    rawFindings,
    configPath,
    filesChecked,
    rumdlRuns,
    rumdlVersion,
    durationMilliseconds,
  } = options;
  const { inWikiFindings, skippedExternalLinks } =
    partitionExternalRelativeLinks(rawFindings, request.wikiRoot);
  const groups = groupFindings(inWikiFindings, request.wikiRoot);
  const findingsByLabel = countFindingsByLabel(groups);
  const groupSummary: JsonValue = groups.map((group) => ({
    causeCode: group.causeCode,
    count: group.findings.length,
    rules: [...new Set(group.findings.map((item) => item.rule))],
  }));
  const relativeConfig =
    relative(request.repoRoot, configPath) || ".rumdl.toml";
  const budgetExceeded = durationMilliseconds > request.budgetMilliseconds;

  request.diagnostics.record(
    "notes.check.completed",
    {
      command: "rumdl check",
      rumdlVersion,
      configPath: relativeConfig,
      rumdlRuns,
      durationMilliseconds,
      budgetMilliseconds: request.budgetMilliseconds,
      budgetExceeded,
      filesChecked,
      findingCount: inWikiFindings.length,
      findingsByLabel,
      externalLinksSkippedCount: skippedExternalLinks.length,
      groups: groupSummary,
    },
    budgetExceeded ? "error" : "info",
  );

  const budgetMessage = `Markdown check took ${String(durationMilliseconds)} ms for ${String(filesChecked)} file${filesChecked === 1 ? "" : "s"}, exceeding the ${String(request.budgetMilliseconds)} ms budget. Repair: Inspect the diagnostics log for slow files, move generated Markdown out of wiki/ and templates/ (${canonicalRouteNames.noteCheck} reads every Markdown file there, whatever .gitignore says), and run ${canonicalRouteNames.noteCheck} again.`;
  const primary = groups[0];
  if (primary === undefined) {
    if (budgetExceeded) {
      return {
        kind: "refused",
        causeCode: "DOMAIN_NOTES_CHECK_BUDGET_EXCEEDED",
        message: budgetMessage,
      };
    }
    return {
      kind: "passed",
      message: `0 Markdown findings in ${String(filesChecked)} file${filesChecked === 1 ? "" : "s"} (rumdl ${rumdlVersion}, ${String(durationMilliseconds)} ms).`,
      data: {
        rumdlVersion,
        configPath: relativeConfig,
        filesChecked,
        durationMilliseconds,
        budgetMilliseconds: request.budgetMilliseconds,
        findingCount: 0,
        findings: [],
        externalLinksSkipped: skippedExternalLinks,
      },
    };
  }
  const findingsMessage = formatGroupedRefusal(
    groups,
    filesChecked,
    inWikiFindings.length,
  );
  return {
    kind: "refused",
    causeCode: primary.causeCode,
    message: budgetExceeded
      ? `${findingsMessage}\n[DOMAIN_NOTES_CHECK_BUDGET_EXCEEDED] ${budgetMessage}`
      : findingsMessage,
  };
}

export async function runNoteCheck(
  request: NoteCheckContext,
): Promise<NoteCheckOutcome> {
  if (!isWikiRoot(request.wikiRoot)) {
    return {
      kind: "refused",
      causeCode:
        "DOMAIN_PRECONDITION_UNMET" satisfies keyof typeof commonCauses,
      message:
        "That path is not a wiki root: it has no wiki/ folder inside it.",
    };
  }
  if (hasLinkedTemplatesFolder(request.wikiRoot)) {
    return {
      kind: "refused",
      causeCode:
        "DOMAIN_PRECONDITION_UNMET" satisfies keyof typeof commonCauses,
      message: `The templates/ folder in that wiki root is a symlink, and ${canonicalRouteNames.noteCheck} does not follow a linked folder, just as it refuses a linked wiki/ folder. Repair: Replace templates/ with a real folder that holds the family templates, then run ${canonicalRouteNames.noteCheck} again.`,
    };
  }
  const configPath =
    request.configOverride === undefined
      ? join(request.repoRoot, ".rumdl.toml")
      : resolve(request.configOverride);
  if (!isFile(configPath)) {
    return {
      kind: "refused",
      causeCode:
        "DOMAIN_PRECONDITION_UNMET" satisfies keyof typeof commonCauses,
      message: `Missing rumdl settings file at ${configPath}.`,
    };
  }
  const rumdlBinary = resolvePinnedRumdl(
    request.repoRoot,
    request.rumdlOverride,
  );
  if (rumdlBinary === null) {
    request.diagnostics.record(
      "notes.check.linter-missing",
      {
        expectedVersion: pinnedRumdlVersion,
        overrideSet: request.rumdlOverride !== undefined,
      },
      "error",
    );
    return {
      kind: "refused",
      causeCode: "DOMAIN_NOTES_LINTER_MISSING",
      message: `Pinned rumdl ${pinnedRumdlVersion} is missing or not executable. Repair: Run bun install --frozen-lockfile in the repository root to install pinned rumdl ${pinnedRumdlVersion}.`,
    };
  }

  const executable = request.parsePath(rumdlBinary);
  const versionCheck = await verifyRumdlVersion({
    programs: request.programs,
    diagnostics: request.diagnostics,
    executable,
  });
  if (!versionCheck.ok) return versionCheck.outcome;

  const owned = ownedMarkdownFiles(request.wikiRoot, configPath);
  if (owned.kind === "unreadable-settings") {
    request.diagnostics.record(
      "notes.check.config-failed",
      {
        configPath,
        reason: owned.reason,
      },
      "error",
    );
    return {
      kind: "refused",
      causeCode: "DOMAIN_NOTES_LINTER_FAILED",
      message: `${owned.reason}. Repair: Inspect .rumdl.toml permissions and TOML syntax, then run ${canonicalRouteNames.noteCheck} again.`,
    };
  }
  if (owned.kind === "linked") {
    return {
      kind: "refused",
      causeCode:
        "DOMAIN_PRECONDITION_UNMET" satisfies keyof typeof commonCauses,
      message: `${owned.linkedPath} is a symlink inside the wiki root, and ${canonicalRouteNames.noteCheck} does not follow a link under wiki/ or templates/, so what it points at would go unchecked. Repair: Replace ${owned.linkedPath} with the real file or folder it points at, or remove it, then run ${canonicalRouteNames.noteCheck} again.`,
    };
  }
  const executed = await runRumdlCheck({
    programs: request.programs,
    diagnostics: request.diagnostics,
    executable,
    wikiRoot: request.wikiRoot,
    configPath,
    files: owned.files,
    rumdlVersion: versionCheck.version,
    timeoutMilliseconds:
      request.timeoutMilliseconds ?? defaultNotesTimeoutMilliseconds,
  });
  if (!executed.ok) return executed.outcome;

  return buildCheckOutcome({
    request,
    rawFindings: executed.findings,
    configPath,
    filesChecked: owned.files.length,
    rumdlRuns: executed.rumdlRuns,
    rumdlVersion: versionCheck.version,
    durationMilliseconds: executed.durationMilliseconds,
  });
}
