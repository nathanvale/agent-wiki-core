import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  cleanTargetNote,
  makeFakeRumdl,
  runNoteCheck,
} from "./support/note-check.ts";
import { wikiFixture } from "./support/wiki.ts";

function passingRumdl(): string {
  return makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
printf '[]\\n'
exit 0
`);
}

test("refuses a set but invalid note check environment override with DOMAIN_PRECONDITION_UNMET naming the variable and the value instead of falling back", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const fakeRumdl = passingRumdl();
  const invalidOverrides: readonly (readonly [string, string])[] = [
    ["WIKI_NOTES_CHECK_BUDGET_MS", "100abc"],
    ["WIKI_NOTES_CHECK_BUDGET_MS", "abc"],
    ["WIKI_NOTES_CHECK_BUDGET_MS", "0"],
    ["WIKI_NOTES_CHECK_BUDGET_MS", "-1"],
    ["WIKI_NOTES_CHECK_BUDGET_MS", ""],
    ["WIKI_NOTES_CHECK_TIMEOUT_MS", "100abc"],
    ["WIKI_NOTES_CHECK_TIMEOUT_MS", "abc"],
    ["WIKI_NOTES_CHECK_TIMEOUT_MS", "0"],
    ["WIKI_NOTES_CHECK_TIMEOUT_MS", "-1"],
    ["WIKI_NOTES_CHECK_TIMEOUT_MS", ""],
    ["WIKI_NOTES_CHECK_TIMEOUT_MS", "1.5"],
    ["WIKI_RUMDL_CONFIG_PATH", ""],
    ["WIKI_RUMDL_CONFIG_PATH", "   "],
  ];
  for (const [variable, value] of invalidOverrides) {
    const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
      WIKI_RUMDL_PATH: fakeRumdl,
      [variable]: value,
    });
    expect({ variable, value, exitCode }).toEqual({
      variable,
      value,
      exitCode: 3,
    });
    expect(envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(envelope.message).toContain(
      `${variable} is set to ${JSON.stringify(value)}`,
    );
    expect(envelope.message).toContain(`Repair: Set ${variable}`);
  }

  for (const blank of ["", "   "]) {
    const blankRumdl = runNoteCheck(["--wiki", folder], {
      WIKI_RUMDL_PATH: blank,
    });
    expect(blankRumdl.exitCode).toBe(3);
    expect(blankRumdl.envelope.result.causeCode).toBe(
      "DOMAIN_PRECONDITION_UNMET",
    );
    expect(blankRumdl.envelope.message).toContain(
      `WIKI_RUMDL_PATH is set to ${JSON.stringify(blank)}`,
    );
    expect(blankRumdl.envelope.message).toContain(
      "Repair: Set WIKI_RUMDL_PATH",
    );
  }
});

test("accepts a whole positive WIKI_NOTES_CHECK_BUDGET_MS and reports it as budgetMilliseconds on a clean wiki", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: passingRumdl(),
    WIKI_NOTES_CHECK_BUDGET_MS: "250",
  });
  expect(exitCode).toBe(0);
  expect(envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
  expect(envelope.result.data?.["budgetMilliseconds"]).toBe(250);
});

test("refuses WIKI_RUMDL_CONFIG_PATH under a regular file with DOMAIN_PRECONDITION_UNMET and a repair", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
    "regular-file.txt": "not a folder\n",
  });
  const configPath = join(folder, "regular-file.txt", "sub.toml");
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: passingRumdl(),
    WIKI_RUMDL_CONFIG_PATH: configPath,
  });
  expect(exitCode).toBe(3);
  expect(envelope.result.outcome).toBe("refused");
  expect(envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
  expect(envelope.message).toContain(
    `Missing rumdl settings file at ${configPath}.`,
  );
  expect(envelope.result.repairAction).toContain(".rumdl.toml");
});

test("refuses WIKI_RUMDL_PATH under a regular file with DOMAIN_NOTES_LINTER_MISSING and a repair", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
    "regular-file.txt": "not a folder\n",
  });
  const rumdlPath = join(folder, "regular-file.txt", "rumdl");
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: rumdlPath,
  });
  expect(exitCode).toBe(3);
  expect(envelope.result.outcome).toBe("refused");
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_MISSING");
  expect(envelope.message).toContain("0.3.5");
  expect(envelope.result.repairAction).toContain("bun install");
});
