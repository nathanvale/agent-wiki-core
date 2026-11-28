import { resolve } from "node:path";
import { command, commonCauses, station } from "agent-cli-kernel";
import type { InputSchema, JsonValue, ParsedInput } from "agent-cli-kernel";
import { WikiReadRefusal } from "./wiki-read.ts";
import { wikiRootRefusal } from "./wiki-walk.ts";

const unchanged = {
  completed: [],
  remaining: [],
  uncertain: [],
  inventoryComplete: true,
} as const;

export const noInput = {
  arguments: [],
  options: [],
  constraints: [],
  deadlineSupported: false,
  additionalArguments: false,
  additionalOptions: false,
} as const;

export function stringOption<
  const Name extends string,
  const Required extends boolean,
>(
  name: Name,
  summary: string,
  required: Required,
  maxLength = 4096,
  pattern: string | null = null,
) {
  return {
    name,
    aliases: [],
    summary,
    required,
    repeatable: false,
    value: {
      kind: "string",
      minLength: 1,
      maxLength,
      choices: null,
      pattern,
    },
  } as const;
}

export const wikiOption = stringOption(
  "--wiki",
  "Path to the wiki root: the folder that has the wiki/ folder inside it.",
  true,
);

export const wikiInput = { ...noInput, options: [wikiOption] } as const;

export function refused(message: string) {
  return { message, data: null, effects: unchanged } as const;
}

const missingWikiRootOption = refused(
  "That path is not a wiki root: it has no wiki/ folder inside it.",
);

function wikiReadRefusalBody(error: WikiReadRefusal) {
  return refused(
    `${error.path} cannot be read (${error.reason}). Repair: remove or replace the named entry, then run the command again.`,
  );
}

type WikiRefusalBody = ReturnType<typeof refused>;

type WikiRootOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: WikiRefusalBody };

function mapReadRefusal(error: unknown): {
  readonly ok: false;
  readonly refusal: WikiRefusalBody;
} {
  if (error instanceof WikiReadRefusal) {
    return { ok: false, refusal: wikiReadRefusalBody(error) };
  }
  throw error;
}

export function withWikiRoot<T>(
  wikiRoot: string,
  read: (wikiRoot: string) => Promise<T>,
): Promise<WikiRootOutcome<T>>;
export function withWikiRoot<T>(
  wikiRoot: string,
  read: (wikiRoot: string) => T,
): WikiRootOutcome<T>;
export function withWikiRoot(
  wikiRoot: string,
  read: (wikiRoot: string) => unknown,
): WikiRootOutcome<unknown> | Promise<WikiRootOutcome<unknown>> {
  const isAsync = read.constructor.name === "AsyncFunction";
  const resolvedRoot = resolve(wikiRoot);
  const rootProblem = wikiRootRefusal(resolvedRoot);
  if (rootProblem !== null) {
    const failure: WikiRootOutcome<never> = {
      ok: false,
      refusal: refused(rootProblem),
    };
    return isAsync ? Promise.resolve(failure) : failure;
  }
  try {
    const result = read(resolvedRoot);
    if (result instanceof Promise) {
      return Promise.resolve<unknown>(result).then(
        (value): WikiRootOutcome<unknown> => ({ ok: true, value }),
        mapReadRefusal,
      );
    }
    return { ok: true, value: result };
  } catch (error) {
    return mapReadRefusal(error);
  }
}

const stationWords = {
  retryDelayPolicy: { kind: "none" },
  reachability: "required",
  unreachableRationale: null,
} as const;

export function wikiStations<const Identity extends string>(
  commandIdentity: Identity,
) {
  return [
    station(commonCauses, {
      ...stationWords,
      commandIdentity,
      causeCode: "SUCCESS_UNCHANGED" satisfies keyof typeof commonCauses,
      trigger: "The wiki was read.",
      repairAction: null,
      guidance: { next: { kind: "done" } },
      independentObservable: `${commandIdentity}:read`,
    }),
    station(commonCauses, {
      ...stationWords,
      commandIdentity,
      causeCode:
        "DOMAIN_PRECONDITION_UNMET" satisfies keyof typeof commonCauses,
      trigger:
        "The wiki, or a file the command needs, cannot be used as given.",
      repairAction:
        "Read the message, correct the path or file it names, and run the command again.",
      guidance: {
        next: {
          kind: "instruction",
          text: "Correct what the message names, then run the command again.",
        },
      },
      independentObservable: `${commandIdentity}:precondition`,
    }),
  ] as const;
}

function json(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value))
    return value.map((item: unknown) => json(item ?? null));
  if (typeof value !== "object") return null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, field]) => field !== undefined && typeof field !== "function")
      .map(([key, field]) => [key, json(field)]),
  );
}

export function succeeded<const Identity extends string>(
  commandIdentity: Identity,
) {
  return {
    commandIdentity,
    causeCode: "SUCCESS_UNCHANGED" satisfies keyof typeof commonCauses,
  } as const;
}

export function preconditionUnmet<const Identity extends string>(
  commandIdentity: Identity,
) {
  return {
    commandIdentity,
    causeCode: "DOMAIN_PRECONDITION_UNMET" satisfies keyof typeof commonCauses,
  } as const;
}

export function report(message: string, data: unknown) {
  return { message, data: json(data), effects: unchanged } as const;
}

type CommandSpec<Identity extends string> = {
  readonly identity: Identity;
  readonly route: readonly string[];
  readonly summary: string;
};

type WikiReadAnswer =
  | { readonly kind?: "ok"; readonly message: string; readonly data: unknown }
  | { readonly kind: "refused"; readonly message: string };

export function wikiReadCommand<
  const Identity extends string,
  const I extends InputSchema,
>(
  spec: CommandSpec<Identity>,
  input: I,
  answer: (wikiRoot: string, parsed: ParsedInput<I>) => WikiReadAnswer,
) {
  return command({
    identity: spec.identity,
    route: spec.route,
    summary: spec.summary,
    input,
    capabilities: {},
    stations: wikiStations(spec.identity),
    run: (parsed, context) => {
      const rawWiki: unknown = Object.hasOwn(parsed, "--wiki")
        ? Reflect.get(parsed, "--wiki")
        : undefined;
      if (typeof rawWiki !== "string")
        return context.result(
          preconditionUnmet(spec.identity),
          missingWikiRootOption,
        );
      const outcome = withWikiRoot(rawWiki, (wikiRoot) =>
        answer(wikiRoot, parsed),
      );
      if (!outcome.ok)
        return context.result(
          preconditionUnmet(spec.identity),
          outcome.refusal,
        );
      if (outcome.value.kind === "refused")
        return context.result(
          preconditionUnmet(spec.identity),
          refused(outcome.value.message),
        );
      return context.result(
        succeeded(spec.identity),
        report(outcome.value.message, outcome.value.data),
      );
    },
  });
}
