import { resolve } from "node:path";
import { command, commonCauses, station } from "agent-cli-kernel";
import type { InputSchema, JsonValue, ParsedInput } from "agent-cli-kernel";
import { isWikiRoot } from "./markdown-files.ts";

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

export const noWikiRoot = refused(
  "That path is not a wiki root: it has no wiki/ folder inside it.",
);

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

export function noInputCommand<const Identity extends string>(
  spec: CommandSpec<Identity>,
  answer: () => { readonly message: string; readonly data: unknown },
) {
  return command({
    identity: spec.identity,
    route: spec.route,
    summary: spec.summary,
    input: noInput,
    capabilities: {},
    run: (_input, context) => {
      const { message, data } = answer();
      return context.result(succeeded(spec.identity), report(message, data));
    },
  });
}

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
        return context.result(preconditionUnmet(spec.identity), noWikiRoot);
      const wikiRoot = resolve(rawWiki);
      if (!isWikiRoot(wikiRoot))
        return context.result(preconditionUnmet(spec.identity), noWikiRoot);
      const outcome = answer(wikiRoot, parsed);
      if (outcome.kind === "refused")
        return context.result(
          preconditionUnmet(spec.identity),
          refused(outcome.message),
        );
      return context.result(
        succeeded(spec.identity),
        report(outcome.message, outcome.data),
      );
    },
  });
}
