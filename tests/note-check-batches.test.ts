import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rumdlFileBatches } from "../src/note/rumdl-runs.ts";
import {
  makeFakeRumdl,
  pathsGivenToRumdl,
  recordingRumdl,
  rumdlCheckRuns,
  runNoteCheck,
} from "./support/note-check.ts";
import { wikiFixture } from "./support/wiki.ts";

const generatedNotes = 10_000;
const largeWikiMilliseconds = 120_000;

test("splits the owned files into rumdl runs that each fit the argument budget, in order, with no file lost or repeated", () => {
  const longPath = "d".repeat(30);
  expect(rumdlFileBatches(["aaaa", "bb", "c", longPath], 30)).toEqual([
    ["aaaa", "bb"],
    ["c"],
    [longPath],
  ]);
  expect(rumdlFileBatches([], 30)).toEqual([]);
});

test(
  "checks a wiki of 10,000 clean notes and one broken note across several rumdl runs and names the broken note",
  () => {
    const folder = wikiFixture({});
    const people = join(folder, "wiki/people");
    mkdirSync(people, { recursive: true });
    for (let index = 1; index <= generatedNotes; index += 1) {
      writeFileSync(
        join(people, `generated-person-number-${String(index)}.md`),
        `# Person ${String(index)}\n\nNothing to fix here.\n`,
      );
    }
    writeFileSync(
      join(people, "zz-broken.md"),
      "# Broken\n\nSee [the record](./missing.md).\n",
    );
    const logPath = join(wikiFixture({}), "rumdl-arguments.log");
    const { exitCode, envelope } = runNoteCheck(
      ["--wiki", folder],
      { WIKI_RUMDL_PATH: recordingRumdl(logPath) },
      undefined,
      largeWikiMilliseconds,
    );
    expect(exitCode).toBe(3);
    expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_BROKEN_LINKS");
    expect(envelope.message).toContain("[note] wiki/people/zz-broken.md:3");
    expect(envelope.message).toContain("1 Markdown finding in 10001 files");
    expect(envelope.message).not.toContain(
      "DOMAIN_NOTES_CHECK_BUDGET_EXCEEDED",
    );
    expect(new Set(pathsGivenToRumdl(logPath, folder)).size).toBe(10_001);
    expect(pathsGivenToRumdl(logPath, folder)).toHaveLength(10_001);
    expect(rumdlCheckRuns(logPath)).toBeGreaterThan(1);
  },
  largeWikiMilliseconds,
);

test("refuses when rumdl output across several runs passes the output limit, even though no single run does", () => {
  const folder = wikiFixture({});
  const people = join(folder, "wiki/people");
  mkdirSync(people, { recursive: true });
  const longName = "n".repeat(200);
  const filesOverOneRunWhateverTheTempPath = 1_500;
  for (let index = 1; index <= filesOverOneRunWhateverTheTempPath; index += 1) {
    writeFileSync(
      join(people, `${longName}-${String(index)}.md`),
      "# Clean\n\nNothing to fix here.\n",
    );
  }
  const logPath = join(wikiFixture({}), "rumdl-arguments.log");
  const paddedRumdl = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
printf 'check\\n' >> ${JSON.stringify(logPath)}
printf '['
head -c 4500000 /dev/zero | tr '\\0' ' '
printf ']\\n'
exit 0
`);
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: paddedRumdl,
  });
  expect(rumdlCheckRuns(logPath)).toBe(2);
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_FAILED");
  expect(envelope.message).toContain(
    "rumdl check output exceeded the 8000000-byte limit and was cut",
  );
});
