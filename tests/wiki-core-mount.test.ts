import { expect, test } from "bun:test";
import { commonCauses, contractFor, runInProcess } from "agent-cli-kernel";
import { diagnosticsAddon } from "agent-cli-kernel/addons/diagnostics";
import { programsAddon } from "agent-cli-kernel/addons/programs";
import {
  usePathParser,
  wikiCoreCauses,
  wikiCoreFor,
} from "agent-wiki-core/commands";
import { baseFields, parseNote, sha256Bytes } from "agent-wiki-core/notes";
import { cleanTargetNote } from "./support/note-check.ts";
import { root, wikiFixture } from "./support/wiki.ts";

function mountExampleWiki(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const contract = contractFor({
    cli: "example-wiki",
    commands: [...wikiCoreFor("example-wiki", { repoRoot: root, environment })],
    causes: { ...commonCauses, ...wikiCoreCauses },
    installedAddons: ["programs", "diagnostics"],
  });
  usePathParser(contract.boundary.path);
  return (argv: readonly string[]) =>
    runInProcess(contract, {
      addons: {
        programs: programsAddon(),
        diagnostics: diagnosticsAddon({
          cli: "example-wiki",
          environment: {},
          argv,
        }),
      },
    })(argv);
}

test("wikiCoreFor mounts note check from agent-wiki-core/commands with literal identity and required environment", async () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const runExampleWiki = mountExampleWiki({});
  const discovered = await runExampleWiki([
    "--discover-command",
    "example-wiki.note.check",
  ]);
  expect(discovered.kind).toBe("envelope");
  if (discovered.kind !== "envelope") return;
  expect(discovered.envelope.result.exitCode).toBe(0);
  expect(discovered.envelope.availablePaths).toContain(
    "example-wiki.note.check",
  );
  expect(discovered.envelope.result.data).toMatchObject({
    command: {
      commandIdentity: "example-wiki.note.check",
      route: ["note", "check"],
    },
  });

  const checkArgv = ["note", "check", "--wiki", folder];
  const checked = await runExampleWiki(checkArgv);
  expect(checked.kind).toBe("envelope");
  if (checked.kind !== "envelope") return;
  expect(checked.exitCode).toBe(0);
  expect(checked.envelope.result.commandIdentity).toBe(
    "example-wiki.note.check",
  );
  expect(checked.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");

  const runWithInvalidEnv = mountExampleWiki({
    WIKI_NOTES_CHECK_BUDGET_MS: "0",
  });
  const invalidRun = await runWithInvalidEnv(checkArgv);
  expect(invalidRun.kind).toBe("envelope");
  if (invalidRun.kind !== "envelope") return;
  expect(invalidRun.exitCode).toBe(3);
  expect(invalidRun.envelope.result.causeCode).toBe(
    "DOMAIN_PRECONDITION_UNMET",
  );
  expect(invalidRun.envelope.message).toContain(
    'WIKI_NOTES_CHECK_BUDGET_MS is set to "0"',
  );
});

test("agent-wiki-core/notes exports parseNote, baseFields and sha256Bytes", () => {
  const note = parseNote("wiki/people/ada-lovelace.md", cleanTargetNote);
  expect(note.title).toBe("Ada Lovelace");
  expect(note.family).toBe("person");
  expect(note.created).toBe("2026-11-23");
  expect(note.recordId).toBe("person_ada");
  expect(Object.keys(baseFields)).toEqual([
    "family",
    "tags",
    "title",
    "summary",
    "created",
    "replaced_by",
    "aliases",
    "record_id",
  ]);
  expect(sha256Bytes(Buffer.from("wiki"))).toHaveLength(64);
});
