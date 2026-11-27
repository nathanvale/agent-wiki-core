import { expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import {
  cleanTargetNote,
  makeFakeRumdl,
  runNoteCheck,
} from "./support/note-check.ts";
import { root, wikiFixture } from "./support/wiki.ts";

test("refuses malformed or unreadable rumdl settings files through note check with DOMAIN_NOTES_LINTER_FAILED and the reason", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
    "wiki/inbox/draft.md": cleanTargetNote,
    "broken.toml": "[global\nexclude = [\n",
    "unreadable.toml": '[global]\nexclude = ["**/wiki/inbox/**"]\n',
  });
  const passingRumdl = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
printf '[]\\n'
exit 0
`);

  const malformedRun = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: passingRumdl,
    WIKI_RUMDL_CONFIG_PATH: join(folder, "broken.toml"),
  });
  expect(malformedRun.exitCode).toBe(3);
  expect(malformedRun.envelope.result.outcome).toBe("refused");
  expect(malformedRun.envelope.result.causeCode).toBe(
    "DOMAIN_NOTES_LINTER_FAILED",
  );
  expect(malformedRun.envelope.message).toContain(
    "Could not parse rumdl settings file",
  );
  expect(malformedRun.envelope.message).toContain("TOML");
  expect(malformedRun.envelope.message).toContain("Repair:");
  expect(malformedRun.envelope.result.repairAction).toContain(".rumdl.toml");

  const unreadablePath = join(folder, "unreadable.toml");
  chmodSync(unreadablePath, 0o000);
  try {
    const unreadableRun = runNoteCheck(["--wiki", folder], {
      WIKI_RUMDL_PATH: passingRumdl,
      WIKI_RUMDL_CONFIG_PATH: unreadablePath,
    });
    expect(unreadableRun.exitCode).toBe(3);
    expect(unreadableRun.envelope.result.outcome).toBe("refused");
    expect(unreadableRun.envelope.result.causeCode).toBe(
      "DOMAIN_NOTES_LINTER_FAILED",
    );
    expect(unreadableRun.envelope.message).toContain(
      "Could not read rumdl settings file",
    );
    expect(unreadableRun.envelope.message).toContain("EACCES");
    expect(unreadableRun.envelope.message).toContain("Repair:");
    expect(unreadableRun.envelope.result.repairAction).toContain(".rumdl.toml");
  } finally {
    chmodSync(unreadablePath, 0o644);
  }
});

test("refuses through real rumdl when the settings file misspells a key, because rumdl runs with --deny-config-warnings", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
    "misspelt.toml": `extends = ${JSON.stringify(join(root, "node_modules/agent-gates/config/rumdl-notes.toml"))}\n\n[global]\nflavour = "obsidian"\n`,
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_CONFIG_PATH: join(folder, "misspelt.toml"),
  });
  expect(exitCode).toBe(3);
  expect(envelope.result.outcome).toBe("refused");
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_FAILED");
  expect(envelope.message).toContain("flavour");
  expect(envelope.message).toContain("Repair:");
});
