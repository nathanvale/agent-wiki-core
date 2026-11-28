import { canonicalRouteNames } from "../shared/rules.ts";
import {
  defaultNotesBudgetMilliseconds,
  defaultNotesTimeoutMilliseconds,
} from "./check-run.ts";

export type NotesEnvironment = Readonly<Record<string, string | undefined>>;

export const noteCheckEnvironmentVariables = {
  rumdlPath: "WIKI_RUMDL_PATH",
  configPath: "WIKI_RUMDL_CONFIG_PATH",
  budgetMilliseconds: "WIKI_NOTES_CHECK_BUDGET_MS",
  timeoutMilliseconds: "WIKI_NOTES_CHECK_TIMEOUT_MS",
} as const;

type ParsedOverride<Value> = {
  readonly value: Value;
  readonly problem: string | null;
};

type NotesOverrides = {
  readonly rumdlPath: string | undefined;
  readonly configPath: string | undefined;
  readonly budgetMilliseconds: number;
  readonly timeoutMilliseconds: number;
  readonly problems: readonly string[];
};

const wholePositiveNumber = /^[1-9][0-9]*$/;

function pathOverride(
  environment: NotesEnvironment,
  variable: string,
  unsetMeaning: string,
): ParsedOverride<string | undefined> {
  const value = environment[variable];
  if (value === undefined || value.trim() !== "") {
    return { value, problem: null };
  }
  return {
    value: undefined,
    problem: `${variable} is set to ${JSON.stringify(value)}, which is blank. Repair: Set ${variable} to a file path, or unset it to use ${unsetMeaning}, then run ${canonicalRouteNames.noteCheck} again.`,
  };
}

function millisecondsOverride(
  environment: NotesEnvironment,
  variable: string,
  fallback: number,
): ParsedOverride<number> {
  const value = environment[variable];
  if (value === undefined) return { value: fallback, problem: null };
  const parsed = wholePositiveNumber.test(value) ? Number(value) : Number.NaN;
  if (Number.isSafeInteger(parsed)) return { value: parsed, problem: null };
  return {
    value: fallback,
    problem: `${variable} is set to ${JSON.stringify(value)}, which is not a whole number of milliseconds above 0. Repair: Set ${variable} to a whole number of milliseconds above 0, or unset it to use the default ${String(fallback)} ms, then run ${canonicalRouteNames.noteCheck} again.`,
  };
}

export function parseNoteCheckEnvironment(
  environment: NotesEnvironment,
): NotesOverrides {
  const rumdlPath = pathOverride(
    environment,
    noteCheckEnvironmentVariables.rumdlPath,
    "the pinned rumdl",
  );
  const configPath = pathOverride(
    environment,
    noteCheckEnvironmentVariables.configPath,
    "the repository .rumdl.toml",
  );
  const budget = millisecondsOverride(
    environment,
    noteCheckEnvironmentVariables.budgetMilliseconds,
    defaultNotesBudgetMilliseconds,
  );
  const timeout = millisecondsOverride(
    environment,
    noteCheckEnvironmentVariables.timeoutMilliseconds,
    defaultNotesTimeoutMilliseconds,
  );
  return {
    rumdlPath: rumdlPath.value,
    configPath: configPath.value,
    budgetMilliseconds: budget.value,
    timeoutMilliseconds: timeout.value,
    problems: [rumdlPath, configPath, budget, timeout].flatMap((parsed) =>
      parsed.problem === null ? [] : [parsed.problem],
    ),
  };
}
