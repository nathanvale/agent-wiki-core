import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseJson, readObject, readString } from "./json.ts";
import { readResultFields, spawnCoreCliJson, wikiFixture } from "./wiki.ts";

export type FamilyWikiFixtureOptions = {
  readonly table?: unknown;
  readonly rawTable?: string;
  readonly notes?: Readonly<Record<string, string>>;
  readonly templates?: Readonly<Record<string, string>>;
  readonly extraFiles?: Readonly<Record<string, string>>;
};

export function familyWikiFixture(options: FamilyWikiFixtureOptions): string {
  const files: Record<string, string> = {};
  if (options.rawTable !== undefined) {
    files["family-table.json"] = options.rawTable;
  } else if (options.table !== undefined) {
    files["family-table.json"] = `${JSON.stringify(options.table, null, 2)}\n`;
  }
  if (options.notes !== undefined) {
    for (const [path, text] of Object.entries(options.notes)) {
      files[path] = text;
    }
  }
  if (options.templates !== undefined) {
    for (const [path, text] of Object.entries(options.templates)) {
      files[path] = text;
    }
  }
  if (options.extraFiles !== undefined) {
    for (const [path, text] of Object.entries(options.extraFiles)) {
      files[path] = text;
    }
  }
  const folder = wikiFixture(files);
  mkdirSync(join(folder, "wiki"), { recursive: true });
  return folder;
}

export type CliEnvelope = {
  readonly contractVersion: string;
  readonly message: string;
  readonly result: {
    readonly commandIdentity: string;
    readonly causeCode: string;
    readonly outcome: string;
    readonly repairAction: string | null;
    readonly data: Record<string, unknown> | null;
  };
};

function readCliEnvelope(stdout: string): CliEnvelope {
  return readObject(parseJson(stdout, "envelope"), "envelope", (envelope) => ({
    contractVersion: readString(
      envelope["contractVersion"],
      "envelope.contractVersion",
    ),
    message: readString(envelope["message"], "envelope.message"),
    result: readObject(
      envelope["result"],
      "envelope.result",
      (record, path) => ({
        commandIdentity: readString(
          record["commandIdentity"],
          `${path}.commandIdentity`,
        ),
        ...readResultFields(record, path),
      }),
    ),
  }));
}

export function runCoreCli(
  args: readonly string[],
  timeoutMilliseconds = 10_000,
): { readonly exitCode: number; readonly envelope: CliEnvelope } {
  const run = spawnCoreCliJson(args, { timeoutMilliseconds });
  return {
    exitCode: run.exitCode,
    envelope: readCliEnvelope(run.stdout),
  };
}
