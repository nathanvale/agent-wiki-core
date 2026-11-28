import type {
  DiagnosticsCapability,
  ParsedPath,
  ProgramResult,
  ProgramsCapability,
} from "agent-cli-kernel";
import { programDetails } from "agent-cli-kernel/addons/programs";
import { canonicalRouteNames } from "../shared/rules.ts";
import {
  extractCutOutputFiles,
  parseRumdlFindings,
  parseRumdlVersion,
  pinnedRumdlVersion,
} from "./rules.ts";
import type { RawRumdlFinding } from "./rules.ts";

export type LinterRefusal = {
  readonly kind: "refused";
  readonly causeCode:
    | "DOMAIN_NOTES_LINTER_FAILED"
    | "DOMAIN_NOTES_LINTER_VERSION_MISMATCH";
  readonly message: string;
};

type RumdlTools = {
  readonly programs: ProgramsCapability;
  readonly diagnostics: DiagnosticsCapability;
  readonly executable: ParsedPath;
};

export type RumdlCheckRequest = RumdlTools & {
  readonly wikiRoot: string;
  readonly configPath: string;
  readonly files: readonly string[];
  readonly rumdlVersion: string;
  readonly timeoutMilliseconds: number;
};

export type RumdlCheckResult =
  | {
      readonly ok: true;
      readonly findings: readonly RawRumdlFinding[];
      readonly durationMilliseconds: number;
      readonly rumdlRuns: number;
    }
  | { readonly ok: false; readonly outcome: LinterRefusal };

const rumdlOutputLimitBytes = 8_000_000;
const rumdlShutdownMilliseconds = 2_000;
const messageDetailCharacters = 1_000;
const argumentBytesPerRun = 262_144;
const argumentPointerBytes = 8;

export function rumdlFileBatches(
  files: readonly string[],
  budgetBytes: number = argumentBytesPerRun,
): readonly (readonly string[])[] {
  const batches: string[][] = [];
  let current: string[] = [];
  let used = 0;
  for (const file of files) {
    const cost = Buffer.byteLength(file) + 1 + argumentPointerBytes;
    if (current.length > 0 && used + cost > budgetBytes) {
      batches.push(current);
      current = [];
      used = 0;
    }
    current.push(file);
    used += cost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function boundedDetail(text: string): string {
  if (text.length <= messageDetailCharacters) return text;
  const cut = text.length - messageDetailCharacters;
  return `${text.slice(0, messageDetailCharacters)}... [${String(cut)} more characters cut; the diagnostics log holds the run facts]`;
}

function linterFailed(message: string): {
  readonly ok: false;
  readonly outcome: LinterRefusal;
} {
  return {
    ok: false,
    outcome: {
      kind: "refused",
      causeCode: "DOMAIN_NOTES_LINTER_FAILED",
      message,
    },
  };
}

export async function verifyRumdlVersion(
  tools: RumdlTools,
): Promise<
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly outcome: LinterRefusal }
> {
  const versionRun = await tools.programs.inspect({
    executable: tools.executable,
    args: ["--version"],
    timeoutMilliseconds: 10_000,
    outputLimitBytes: 65_536,
    shutdownMilliseconds: rumdlShutdownMilliseconds,
  });
  const timedOut = programDetails(versionRun)?.timedOut === true;
  const observed =
    !timedOut && versionRun.exitCode === 0 && !versionRun.outputTruncated
      ? parseRumdlVersion(versionRun.stdout)
      : null;

  if (observed === null) {
    tools.diagnostics.record(
      "notes.check.version-failed",
      {
        expectedVersion: pinnedRumdlVersion,
        exitCode: versionRun.exitCode,
        timedOut,
      },
      "error",
    );
    const detail = timedOut
      ? "timed out"
      : versionRun.stderr.trim() || versionRun.stdout.trim() || "no output";
    return linterFailed(
      `Could not read rumdl version (exit ${String(versionRun.exitCode)}): ${detail}. Repair: Inspect the rumdl installation and run bun install --frozen-lockfile, then run ${canonicalRouteNames.noteCheck} again.`,
    );
  }

  if (observed !== pinnedRumdlVersion) {
    tools.diagnostics.record(
      "notes.check.version-mismatch",
      { expectedVersion: pinnedRumdlVersion, observedVersion: observed },
      "error",
    );
    return {
      ok: false,
      outcome: {
        kind: "refused",
        causeCode: "DOMAIN_NOTES_LINTER_VERSION_MISMATCH",
        message: `Found rumdl ${observed}, but this repository pins rumdl ${pinnedRumdlVersion}. Repair: Run bun install --frozen-lockfile so the installed rumdl matches ${pinnedRumdlVersion}.`,
      },
    };
  }
  return { ok: true, version: observed };
}

function unexpectedRunDetail(
  stderr: string,
  stdout: string,
  exitCode: number | null,
  parsedFindings: readonly RawRumdlFinding[] | null,
): string {
  const trimmedStderr = stderr.trim();
  if (trimmedStderr !== "") return trimmedStderr;
  if (
    exitCode === 1 &&
    parsedFindings !== null &&
    parsedFindings.length === 0
  ) {
    return "exited 1 with no JSON findings";
  }
  if (exitCode === 0 && parsedFindings !== null && parsedFindings.length > 0) {
    return "exited 0 despite reporting JSON findings";
  }
  return stdout.trim() || `exit ${String(exitCode)}`;
}

const unknownRuleWarningPattern =
  /^\[config warning\]\s+Unknown rule in .+?:[ \t]+([^\s(]+)/;

function parseUnknownRuleWarnings(stderr: string): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const line of stderr.split(/\r?\n/)) {
    const code = unknownRuleWarningPattern.exec(line.trim())?.[1];
    if (code !== undefined && !seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }
  return codes;
}

function unknownRuleMessage(
  unknownRules: readonly string[],
  stderr: string,
): string {
  const codeList = unknownRules.join(", ");
  const plural = unknownRules.length === 1 ? "" : "s";
  return `rumdl reported unknown configured rule${plural} (${codeList}): ${boundedDetail(stderr.trim())}. Repair: Remove or rename ${codeList} in .rumdl.toml or the inherited agent-gates profile (or update pinned rumdl ${pinnedRumdlVersion}), then run ${canonicalRouteNames.noteCheck} again.`;
}

type RunState = {
  readonly request: RumdlCheckRequest;
  readonly started: number;
  readonly rumdlRuns: number;
  rumdlRun: number;
  stdoutBytes: number;
  stderrBytes: number;
};

type RunVerdict =
  | { readonly ok: true; readonly findings: readonly RawRumdlFinding[] }
  | { readonly ok: false; readonly outcome: LinterRefusal };

function refuseRun(
  state: RunState,
  facts: {
    readonly exitCode: number | null;
    readonly outputTruncated: boolean;
    readonly timedOut: boolean;
    readonly unknownRules?: readonly string[];
  },
  message: string,
): { readonly ok: false; readonly outcome: LinterRefusal } {
  state.request.diagnostics.record(
    "notes.check.failed",
    {
      command: "rumdl check",
      rumdlVersion: state.request.rumdlVersion,
      durationMilliseconds: Math.round(performance.now() - state.started),
      filesChecked: state.request.files.length,
      rumdlRun: state.rumdlRun,
      rumdlRuns: state.rumdlRuns,
      ...facts,
    },
    "error",
  );
  return linterFailed(message);
}

function timedOutMessage(state: RunState, exitCode: number | null): string {
  return `rumdl check timed out after ${String(state.request.timeoutMilliseconds)} ms (exit ${String(exitCode)}). Repair: Inspect the diagnostics log for slow files or a stuck rumdl process and .rumdl.toml syntax, then run ${canonicalRouteNames.noteCheck} again.`;
}

const maxNamedCutOutputFiles = 10;

function formatCutOutputFiles(files: readonly string[]): string {
  const shown = files.slice(0, maxNamedCutOutputFiles).join(", ");
  const extra = files.length - maxNamedCutOutputFiles;
  return extra > 0 ? `${shown} (and ${String(extra)} more)` : shown;
}

function cutOutputMessage(
  exitCode: number | null,
  stderr: string,
  stdout: string,
  wikiRoot: string,
): string {
  const start = boundedDetail(stderr.trim() || stdout.trim());
  const namedFiles =
    Buffer.byteLength(stdout) >= Buffer.byteLength(stderr)
      ? extractCutOutputFiles(stdout, wikiRoot)
      : [];
  if (namedFiles.length > 0) {
    const fileList = formatCutOutputFiles(namedFiles);
    return `rumdl check output exceeded the ${String(rumdlOutputLimitBytes)}-byte limit and was cut, so its findings could not be read (exit ${String(exitCode)}). Files reached in cut output: ${fileList}. Start of the output: ${start}. Repair: Fix the findings in ${fileList} (or run rumdl check on those files directly), then run ${canonicalRouteNames.noteCheck} again.`;
  }
  return `rumdl check output exceeded the ${String(rumdlOutputLimitBytes)}-byte limit and was cut, so its findings could not be read (exit ${String(exitCode)}). Start of the output: ${start}. Repair: Run rumdl check on the wiki/ and templates/ folders directly to see the full output, fix the notes that produce the most findings, then run ${canonicalRouteNames.noteCheck} again.`;
}

function judgeRun(state: RunState, checkRun: ProgramResult): RunVerdict {
  const timedOut = programDetails(checkRun)?.timedOut === true;
  const facts = {
    exitCode: checkRun.exitCode,
    outputTruncated: checkRun.outputTruncated,
    timedOut,
  };
  if (timedOut) {
    return refuseRun(state, facts, timedOutMessage(state, checkRun.exitCode));
  }
  const unknownRules = parseUnknownRuleWarnings(checkRun.stderr);
  if (unknownRules.length > 0) {
    return refuseRun(
      state,
      { ...facts, unknownRules },
      unknownRuleMessage(unknownRules, checkRun.stderr),
    );
  }
  if (checkRun.outputTruncated) {
    return refuseRun(
      state,
      facts,
      cutOutputMessage(
        checkRun.exitCode,
        checkRun.stderr,
        checkRun.stdout,
        state.request.wikiRoot,
      ),
    );
  }
  const parsedFindings = parseRumdlFindings(checkRun.stdout);
  if (
    parsedFindings !== null &&
    ((checkRun.exitCode === 0 && parsedFindings.length === 0) ||
      (checkRun.exitCode === 1 && parsedFindings.length > 0))
  ) {
    return { ok: true, findings: parsedFindings };
  }
  const detail = boundedDetail(
    unexpectedRunDetail(
      checkRun.stderr,
      checkRun.stdout,
      checkRun.exitCode,
      parsedFindings,
    ),
  );
  return refuseRun(
    state,
    facts,
    `rumdl check failed unexpectedly (exit ${String(checkRun.exitCode)}): ${detail}. Repair: Inspect the rumdl output and .rumdl.toml syntax, then run ${canonicalRouteNames.noteCheck} again.`,
  );
}

async function runOneBatch(
  state: RunState,
  batch: readonly string[],
): Promise<RunVerdict> {
  const { request } = state;
  const remainingMilliseconds = Math.floor(
    state.started + request.timeoutMilliseconds - performance.now(),
  );
  if (remainingMilliseconds < 1) {
    return refuseRun(
      state,
      { exitCode: null, outputTruncated: false, timedOut: true },
      timedOutMessage(state, null),
    );
  }
  const remainingOutputBytes =
    rumdlOutputLimitBytes - Math.max(state.stdoutBytes, state.stderrBytes);
  if (remainingOutputBytes < 1) {
    return refuseRun(
      state,
      { exitCode: null, outputTruncated: true, timedOut: false },
      cutOutputMessage(null, "", "", state.request.wikiRoot),
    );
  }
  const checkRun = await request.programs.inspect({
    executable: request.executable,
    args: [
      "check",
      "--config",
      request.configPath,
      "--no-cache",
      "--deny-config-warnings",
      "--show-full-path",
      "--no-exclude",
      "--output-format",
      "json",
      ...batch,
    ],
    timeoutMilliseconds: remainingMilliseconds,
    outputLimitBytes: remainingOutputBytes,
    shutdownMilliseconds: rumdlShutdownMilliseconds,
  });
  state.stdoutBytes += Buffer.byteLength(checkRun.stdout);
  state.stderrBytes += Buffer.byteLength(checkRun.stderr);
  return judgeRun(state, checkRun);
}

export async function runRumdlCheck(
  request: RumdlCheckRequest,
): Promise<RumdlCheckResult> {
  const batches = rumdlFileBatches(request.files);
  const state: RunState = {
    request,
    started: performance.now(),
    rumdlRuns: batches.length,
    rumdlRun: 0,
    stdoutBytes: 0,
    stderrBytes: 0,
  };
  const findings: RawRumdlFinding[] = [];
  for (const batch of batches) {
    state.rumdlRun += 1;
    const verdict = await runOneBatch(state, batch);
    if (!verdict.ok) return verdict;
    findings.push(...verdict.findings);
  }
  return {
    ok: true,
    findings,
    durationMilliseconds: Math.round(performance.now() - state.started),
    rumdlRuns: batches.length,
  };
}
