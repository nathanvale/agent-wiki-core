import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseJson,
  parseJsonRecord,
  readNullableString,
  readObject,
  readString,
} from "./json.ts";
import {
  readResultFields,
  root,
  spawnCoreCliJson,
  wikiFixture,
} from "./wiki.ts";

type NoteCheckEnvelope = {
  readonly contractVersion: string;
  readonly message: string;
  readonly result: {
    readonly commandIdentity: string;
    readonly causeCode: string;
    readonly outcome: string;
    readonly repairAction: string | null;
    readonly data: Record<string, unknown> | null;
  };
  readonly diagnostics?: {
    readonly status: string;
    readonly file: string | null;
  };
};

export const cleanTargetNote = `---
type: entity
title: "Ada Lovelace"
status: active
created: "2026-11-23"
updated: "2026-11-23"
tags: [vault-pilot]
record_id: person_ada
family: person
aliases: []
contact_sources: []
---

# Ada Lovelace

## Context

Ada Lovelace is a clean fixture note with prose intentionally longer than eighty characters so MD013 stays disabled on real wiki prose.
`;

function readNoteCheckEnvelope(stdout: string): NoteCheckEnvelope {
  return readObject(parseJson(stdout, "envelope"), "envelope", (envelope) => {
    const result = readObject(
      envelope["result"],
      "envelope.result",
      (record, path) => ({
        commandIdentity: readString(
          record["commandIdentity"],
          `${path}.commandIdentity`,
        ),
        ...readResultFields(record, path),
      }),
    );
    const checked = {
      contractVersion: readString(
        envelope["contractVersion"],
        "envelope.contractVersion",
      ),
      message: readString(envelope["message"], "envelope.message"),
      result,
    };
    if (envelope["diagnostics"] === undefined) return checked;
    return {
      ...checked,
      diagnostics: readObject(
        envelope["diagnostics"],
        "envelope.diagnostics",
        (record, path) => ({
          status: readString(record["status"], `${path}.status`),
          file: readNullableString(record["file"], `${path}.file`),
        }),
      ),
    };
  });
}

export function runNoteCheck(
  args: readonly string[],
  extraEnv: Readonly<Record<string, string>> = {},
  workingDirectory: string = root,
  spawnTimeoutMilliseconds = 4_000,
): { readonly exitCode: number; readonly envelope: NoteCheckEnvelope } {
  const run = spawnCoreCliJson(["note", "check", ...args], {
    extraEnv,
    workingDirectory,
    timeoutMilliseconds: spawnTimeoutMilliseconds,
  });
  return {
    exitCode: run.exitCode,
    envelope: readNoteCheckEnvelope(run.stdout),
  };
}

export function makeFakeRumdl(scriptBody: string): string {
  const dir = wikiFixture({});
  const scriptPath = join(dir, "fake-rumdl.sh");
  writeFileSync(scriptPath, `#!/bin/sh\n${scriptBody}\n`);
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

export function recordingRumdl(logPath: string): string {
  const realRumdl = join(root, "node_modules/.bin/rumdl");
  return makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  exec ${JSON.stringify(realRumdl)} "$@"
fi
for argument in "$@"; do
  printf '%s\\n' "$argument" >> ${JSON.stringify(logPath)}
done
exec ${JSON.stringify(realRumdl)} "$@"
`);
}

function recordedArguments(logPath: string): string[] {
  return existsSync(logPath) ? readFileSync(logPath, "utf8").split("\n") : [];
}

export function pathsGivenToRumdl(logPath: string, folder: string): string[] {
  return recordedArguments(logPath)
    .filter((line) => line.startsWith(`${folder}/`))
    .map((line) => line.slice(folder.length + 1));
}

export function rumdlCheckRuns(logPath: string): number {
  return recordedArguments(logPath).filter((line) => line === "check").length;
}

export function readDiagnosticsEvents(
  envelope: NoteCheckEnvelope,
): Record<string, unknown>[] {
  const file = envelope.diagnostics?.file;
  if (typeof file !== "string") return [];
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter((line) => line !== "")
    .map((line, index) => parseJsonRecord(line, `diagnostics[${index}]`));
}
