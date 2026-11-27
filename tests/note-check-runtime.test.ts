import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanTargetNote,
  makeFakeRumdl,
  readDiagnosticsEvents,
  runNoteCheck,
} from "./support/note-check.ts";
import { root, wikiFixture } from "./support/wiki.ts";

test("refuses an unmapped rumdl rule with DOMAIN_NOTES_UNMAPPED_RULE, rumdl's own message, and a repair to add a mapping", () => {
  const folder = wikiFixture({
    "wiki/people/unmapped.md": cleanTargetNote,
  });
  const notePath = join(folder, "wiki/people/unmapped.md");
  const fakeRumdl = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
printf '[{"file":%s,"line":12,"column":1,"rule":"MD999","message":"Future rule triggered","severity":"warning","fixable":false}]\\n' '${JSON.stringify(notePath)}'
exit 1
`);
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: fakeRumdl,
  });
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_UNMAPPED_RULE");
  expect(envelope.message).toContain("[note] wiki/people/unmapped.md:12");
  expect(envelope.message).toContain("MD999");
  expect(envelope.message).toContain("Future rule triggered");
  expect(envelope.message).toContain("mapping");
});

test("refuses when rumdl is missing with DOMAIN_NOTES_LINTER_MISSING and a repair", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const missingPath = join(folder, "no-such-rumdl");
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: missingPath,
  });
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_MISSING");
  expect(envelope.message).toContain("0.3.5");
  expect(envelope.result.repairAction).toContain("bun install");
});

test("refuses when rumdl is at the wrong version with DOMAIN_NOTES_LINTER_VERSION_MISMATCH and a repair", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const wrongRumdl = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.4.0"
  exit 0
fi
exit 0
`);
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: wrongRumdl,
  });
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe(
    "DOMAIN_NOTES_LINTER_VERSION_MISMATCH",
  );
  expect(envelope.message).toContain("0.4.0");
  expect(envelope.message).toContain("0.3.5");
  expect(envelope.result.repairAction).toContain("0.3.5");
});

test("refuses when rumdl fails unexpectedly with DOMAIN_NOTES_LINTER_FAILED", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const failingRumdl = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
echo "config parse error" >&2
exit 2
`);
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: failingRumdl,
  });
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_FAILED");
  expect(envelope.message).toContain("config parse error");
  expect(envelope.result.repairAction).toContain(".rumdl.toml");
});

test("refuses exit 1 with empty stdout and stderr error as DOMAIN_NOTES_LINTER_FAILED instead of passing", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const silentFailRumdl = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
echo "scanner failed" >&2
exit 1
`);
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: silentFailRumdl,
  });
  expect(exitCode).toBe(3);
  expect(envelope.result.outcome).toBe("refused");
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_FAILED");
  expect(envelope.message).toContain("scanner failed");
  expect(envelope.message).toContain("Repair:");
  expect(envelope.result.repairAction).toContain(".rumdl.toml");
});

test("refuses exit 1 with empty JSON array or invalid JSON stdout as DOMAIN_NOTES_LINTER_FAILED", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const emptyArrayExit1 = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
printf '[]\\n'
exit 1
`);
  const emptyArrayRun = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: emptyArrayExit1,
  });
  expect(emptyArrayRun.exitCode).toBe(3);
  expect(emptyArrayRun.envelope.result.causeCode).toBe(
    "DOMAIN_NOTES_LINTER_FAILED",
  );
  expect(emptyArrayRun.envelope.message).toContain("Repair:");
  expect(emptyArrayRun.envelope.result.repairAction).toContain(".rumdl.toml");

  const invalidJsonExit1 = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
printf 'not-json\\n'
exit 1
`);
  const invalidJsonRun = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: invalidJsonExit1,
  });
  expect(invalidJsonRun.exitCode).toBe(3);
  expect(invalidJsonRun.envelope.result.causeCode).toBe(
    "DOMAIN_NOTES_LINTER_FAILED",
  );
  expect(invalidJsonRun.envelope.message).toContain("Repair:");
  expect(invalidJsonRun.envelope.result.repairAction).toContain(".rumdl.toml");
});

test("refuses exit 0 with empty stdout or non-empty findings as DOMAIN_NOTES_LINTER_FAILED", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const emptyExit0 = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
exit 0
`);
  const emptyRun = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: emptyExit0,
  });
  expect(emptyRun.exitCode).toBe(3);
  expect(emptyRun.envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_FAILED");
  expect(emptyRun.envelope.message).toContain("Repair:");
  expect(emptyRun.envelope.result.repairAction).toContain(".rumdl.toml");

  const notePath = join(folder, "wiki/people/ada-lovelace.md");
  const findingsExit0 = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
printf '[{"file":%s,"line":1,"column":1,"rule":"MD009","message":"Trailing spaces","severity":"warning","fixable":true}]\\n' '${JSON.stringify(notePath)}'
exit 0
`);
  const findingsRun = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: findingsExit0,
  });
  expect(findingsRun.exitCode).toBe(3);
  expect(findingsRun.envelope.result.causeCode).toBe(
    "DOMAIN_NOTES_LINTER_FAILED",
  );
  expect(findingsRun.envelope.message).toContain("Repair:");
  expect(findingsRun.envelope.result.repairAction).toContain(".rumdl.toml");
});

test("refuses a path that is not a wiki root with DOMAIN_PRECONDITION_UNMET", () => {
  const notAWiki = wikiFixture({ "notes/readme.md": "# Not a wiki\n" });
  const { exitCode, envelope } = runNoteCheck(["--wiki", notAWiki]);
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
  expect(envelope.message).toBe(
    "That path is not a wiki root: it has no wiki/ folder inside it.",
  );
});

test("refuses a regular file passed to --wiki with DOMAIN_PRECONDITION_UNMET and a repair", () => {
  const folder = wikiFixture({ "regular-file.md": "# Not a folder\n" });
  const regularFile = join(folder, "regular-file.md");
  const { exitCode, envelope } = runNoteCheck(["--wiki", regularFile]);
  expect(exitCode).toBe(3);
  expect(envelope.result.outcome).toBe("refused");
  expect(envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
  expect(envelope.message).toBe(
    "That path is not a wiki root: it has no wiki/ folder inside it.",
  );
  expect(envelope.result.repairAction).toContain("--wiki");
});

test("effective rumdl configuration from .rumdl.toml inherits the pinned agent-gates notes profile", () => {
  const effective = Bun.spawnSync(
    [
      join(root, "node_modules/.bin/rumdl"),
      "config",
      "--config",
      join(root, ".rumdl.toml"),
    ],
    { cwd: root, env: process.env, stdout: "pipe", stderr: "pipe" },
  );
  expect(effective.exitCode).toBe(0);
  const stdout = effective.stdout.toString();
  expect(stdout).toContain('flavor = "obsidian"');
  expect(stdout).toContain("cache = false");
  expect(stdout).toContain("respect_gitignore = true");
  expect(stdout).toContain('include = ["wiki/**/*.md", "templates/**/*.md"]');
  expect(stdout).toContain('exclude = ["wiki/inbox/**"]');
  expect(stdout).toContain("front-matter-title = false");
  expect(stdout).toContain('front-matter-title = ""');
  expect(stdout).toContain('"MD001"');
  expect(stdout).toContain('"MD004"');
  expect(stdout).toContain('"MD025"');
  expect(stdout).toContain('"MD057"');
  expect(stdout).not.toContain('"MD013"');
  expect(stdout).not.toContain('"MD041"');
  expect(stdout).not.toContain('"MD043"');
  expect(stdout).not.toContain('"MD051"');
  expect(stdout).not.toContain('"MD071"');
  expect(stdout).not.toContain('"MD072"');
});

test("always invokes rumdl with --output-format json, --no-cache, and --deny-config-warnings, and never passes --fix or another output format", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const argsFile = join(folder, "rumdl-args.txt");
  const spyRumdl = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
printf '%s\\n' "$@" > '${argsFile}'
printf '[]\\n'
exit 0
`);
  const { exitCode } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: spyRumdl,
  });
  expect(exitCode).toBe(0);
  const passedArgs = readFileSync(argsFile, "utf8")
    .trim()
    .split("\n")
    .filter((entry) => entry !== "");
  const formatIndices = passedArgs.flatMap((arg, index) =>
    arg === "--output-format" || arg.startsWith("--output-format=")
      ? [index]
      : [],
  );
  expect(formatIndices).toHaveLength(1);
  const formatIndex = formatIndices[0];
  expect(formatIndex).toBeDefined();
  if (formatIndex !== undefined) {
    expect(passedArgs[formatIndex]).toBe("--output-format");
    expect(passedArgs[formatIndex + 1]).toBe("json");
  }
  expect(passedArgs).toContain("--no-cache");
  expect(passedArgs).toContain("--deny-config-warnings");
  expect(passedArgs).not.toContain("--fix");
  expect(passedArgs).not.toContain("--fix-only");
});

test("refuses when rumdl reports an unknown configured rule on stderr even if it exits 0 with empty JSON", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const unknownRuleRumdl = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
echo "[config warning] Unknown rule in global.enable: MD999 (did you mean: MD009?)" >&2
printf '[]\\n'
exit 0
`);
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: unknownRuleRumdl,
  });
  expect(exitCode).toBe(3);
  expect(envelope.result.outcome).toBe("refused");
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_FAILED");
  expect(envelope.message).toContain("MD999");
  expect(envelope.message).toMatch(/Repair:.*MD999/);
  const failed = readDiagnosticsEvents(envelope).find(
    (entry) => entry["event"] === "notes.check.failed",
  );
  expect(failed?.["facts"]).toMatchObject({ unknownRules: ["MD999"] });
});

test("refuses with DOMAIN_NOTES_CHECK_BUDGET_EXCEEDED and a repair when rumdl exceeds the duration budget", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const slowRumdl = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
bun -e 'const end = Date.now() + 25; while (Date.now() < end) {}'
printf '[]\\n'
exit 0
`);
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: slowRumdl,
    WIKI_NOTES_CHECK_BUDGET_MS: "1",
  });
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_CHECK_BUDGET_EXCEEDED");
  expect(envelope.result.data).toBeNull();
  expect(envelope.message).toContain("exceeding the 1 ms budget");
  expect(envelope.message).toContain("Repair:");

  const events = readDiagnosticsEvents(envelope);
  const completed = events.find(
    (entry) => entry["event"] === "notes.check.completed",
  );
  expect(completed?.["facts"]).toMatchObject({
    budgetMilliseconds: 1,
    budgetExceeded: true,
  });
});

test("still reports DOMAIN_NOTES_CHECK_BUDGET_EXCEEDED when both Markdown findings and a budget overrun occur", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const notePath = join(folder, "wiki/people/ada-lovelace.md");
  const slowFindingRumdl = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
bun -e 'const end = Date.now() + 25; while (Date.now() < end) {}'
printf '[{"file":%s,"line":1,"column":1,"rule":"MD009","message":"Trailing spaces","severity":"warning","fixable":true}]\\n' '${JSON.stringify(notePath)}'
exit 1
`);
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: slowFindingRumdl,
    WIKI_NOTES_CHECK_BUDGET_MS: "1",
  });
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe(
    "DOMAIN_NOTES_WHITESPACE_AND_ENCODING",
  );
  expect(envelope.message).toContain("MD009");
  expect(envelope.message).toContain("DOMAIN_NOTES_CHECK_BUDGET_EXCEEDED");
  expect(envelope.message).toContain("exceeding the 1 ms budget");
});

test("refuses a timed-out rumdl run as DOMAIN_NOTES_LINTER_FAILED even when it traps SIGTERM and exits 0 with [] under a raised budget", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const trappingZeroRumdl = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
exec bun -e 'process.on("SIGTERM", () => { process.stdout.write("[]\\n"); process.exit(0); }); setInterval(() => {}, 1000);'
`);
  const zeroRun = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: trappingZeroRumdl,
    WIKI_NOTES_CHECK_BUDGET_MS: "60000",
    WIKI_NOTES_CHECK_TIMEOUT_MS: "100",
  });
  expect(zeroRun.exitCode).toBe(3);
  expect(zeroRun.envelope.result.outcome).toBe("refused");
  expect(zeroRun.envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_FAILED");
  expect(zeroRun.envelope.message).toContain("timed out");
  expect(zeroRun.envelope.message).toContain("Repair:");
  expect(zeroRun.envelope.result.repairAction).toContain(".rumdl.toml");

  const zeroEvents = readDiagnosticsEvents(zeroRun.envelope);
  const failed = zeroEvents.find(
    (entry) => entry["event"] === "notes.check.failed",
  );
  expect(failed?.["facts"]).toMatchObject({ timedOut: true });

  const notePath = join(folder, "wiki/people/ada-lovelace.md");
  const trappingFindingsRumdl = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
exec bun -e 'process.on("SIGTERM", () => { process.stdout.write(JSON.stringify([{file:${JSON.stringify(notePath)},line:1,column:1,rule:"MD009",message:"Trailing spaces",severity:"warning",fixable:true}]) + "\\n"); process.exit(1); }); setInterval(() => {}, 1000);'
`);
  const findingsRun = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: trappingFindingsRumdl,
    WIKI_NOTES_CHECK_BUDGET_MS: "60000",
    WIKI_NOTES_CHECK_TIMEOUT_MS: "100",
  });
  expect(findingsRun.exitCode).toBe(3);
  expect(findingsRun.envelope.result.outcome).toBe("refused");
  expect(findingsRun.envelope.result.causeCode).toBe(
    "DOMAIN_NOTES_LINTER_FAILED",
  );
  expect(findingsRun.envelope.message).toContain("timed out");
  expect(findingsRun.envelope.message).toContain("Repair:");
});

test("refuses rumdl output over the output limit as DOMAIN_NOTES_LINTER_FAILED with a short message that says the output was cut", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const floodingRumdl = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
head -c 9000000 /dev/zero | tr '\\0' 'x'
exit 1
`);
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: floodingRumdl,
  });
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_FAILED");
  expect(envelope.message.length).toBeLessThan(2_000);
  expect(envelope.message).toContain(
    "rumdl check output exceeded the 8000000-byte limit and was cut",
  );
  expect(envelope.message).toContain("Repair:");

  const events = readDiagnosticsEvents(envelope);
  const failed = events.find(
    (entry) => entry["event"] === "notes.check.failed",
  );
  expect(failed?.["facts"]).toMatchObject({
    exitCode: 1,
    outputTruncated: true,
  });
});
