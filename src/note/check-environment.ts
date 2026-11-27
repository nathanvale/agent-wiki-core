import { canonicalRouteNames } from "../shared/rules.ts";
import {
  defaultNotesBudgetMilliseconds,
  defaultNotesTimeoutMilliseconds,
} from "./check-run.ts";

type NotesEnvironment = Readonly<Record<string, string | undefined>>;

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

let overrides: NotesOverrides = {
  rumdlPath: undefined,
  configPath: undefined,
  budgetMilliseconds: defaultNotesBudgetMilliseconds,
  timeoutMilliseconds: defaultNotesTimeoutMilliseconds,
  problems: [],
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

export function useNoteCheckEnvironment(environment: NotesEnvironment): void {
  const rumdlPath = pathOverride(
    environment,
    "WIKI_RUMDL_PATH",
    "the pinned rumdl",
  );
  const configPath = pathOverride(
    environment,
    "WIKI_RUMDL_CONFIG_PATH",
    "the repository .rumdl.toml",
  );
  const budget = millisecondsOverride(
    environment,
    "WIKI_NOTES_CHECK_BUDGET_MS",
    defaultNotesBudgetMilliseconds,
  );
  const timeout = millisecondsOverride(
    environment,
    "WIKI_NOTES_CHECK_TIMEOUT_MS",
    defaultNotesTimeoutMilliseconds,
  );
  overrides = {
    rumdlPath: rumdlPath.value,
    configPath: configPath.value,
    budgetMilliseconds: budget.value,
    timeoutMilliseconds: timeout.value,
    problems: [rumdlPath, configPath, budget, timeout].flatMap((parsed) =>
      parsed.problem === null ? [] : [parsed.problem],
    ),
  };
}

export function noteCheckOverrides(): NotesOverrides {
  return overrides;
}
