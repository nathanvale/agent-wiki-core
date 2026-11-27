import { resolve } from "node:path";
import type { commonCauses } from "agent-cli-kernel";
import { command } from "agent-cli-kernel";
import { noteCheckFor } from "./note/check.ts";

const noInput = {
  arguments: [],
  options: [],
  constraints: [],
  deadlineSupported: false,
  additionalArguments: false,
  additionalOptions: false,
} as const;

const noEffects = {
  completed: [],
  remaining: [],
  uncertain: [],
  inventoryComplete: true,
} as const;

const succeeded = "SUCCESS_UNCHANGED" satisfies keyof typeof commonCauses;

const status = command({
  identity: "agent-wiki-core.status",
  route: ["status"],
  summary: "Report that this command-line tool runs.",
  input: noInput,
  capabilities: {},
  run: (_input, context) =>
    context.result(
      {
        commandIdentity: "agent-wiki-core.status",
        causeCode: succeeded,
      },
      {
        message: "The command-line tool runs.",
        data: { ready: true },
        effects: noEffects,
      },
    ),
});

const repoRoot = resolve(import.meta.dirname, "..");

export const commands = [
  status,
  noteCheckFor("agent-wiki-core", repoRoot),
] as const;
