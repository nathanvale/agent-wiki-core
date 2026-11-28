import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseJson, readObject, readString } from "./support/json.ts";
import { cleanTargetNote, makeFakeRumdl } from "./support/note-check.ts";
import { readResultFields, root, wikiFixture } from "./support/wiki.ts";

const hostileTimeoutMilliseconds = 10_000;

function runHostileNoteCheck(
  args: readonly string[],
  extraEnv: Readonly<Record<string, string>> = {},
) {
  const stateHome = wikiFixture({});
  const run = Bun.spawnSync(
    ["bun", join(root, "src/cli.ts"), "note", "check", ...args, "--json"],
    {
      cwd: root,
      env: {
        ...process.env,
        XDG_STATE_HOME: stateHome,
        ...extraEnv,
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: hostileTimeoutMilliseconds,
      killSignal: "SIGKILL",
    },
  );
  const stdout = run.stdout.toString();
  if (stdout.trim() === "") {
    throw new Error(
      `Expected JSON stdout, got exit=${String(run.exitCode)} stderr=${run.stderr.toString()}`,
    );
  }
  const envelope = readObject(
    parseJson(stdout, "envelope"),
    "envelope",
    (record) => ({
      message: readString(record["message"], "envelope.message"),
      result: readObject(
        record["result"],
        "envelope.result",
        (resultRecord, path) => readResultFields(resultRecord, path),
      ),
    }),
  );
  return { exitCode: run.exitCode, envelope };
}

function noisyNoteContent(findingCount: number): string {
  return `# Noisy\n\n${"trailing spaces line   \n".repeat(findingCount)}`;
}

describe("too many findings", () => {
  test(
    "refuses a note with 200,000 findings with DOMAIN_NOTES_LINTER_FAILED and names that note in the message",
    () => {
      const folder = wikiFixture({
        "wiki/people/clean.md": cleanTargetNote,
        "wiki/people/noisy.md": noisyNoteContent(200_000),
      });
      const { exitCode, envelope } = runHostileNoteCheck(["--wiki", folder]);
      expect(exitCode).toBe(3);
      expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_FAILED");
      expect(envelope.message).toContain(
        "rumdl check output exceeded the 8000000-byte limit and was cut",
      );
      expect(envelope.message).toContain(
        "Files reached in cut output: wiki/people/noisy.md.",
      );
      expect(envelope.message).toContain(
        "Repair: Fix the findings in wiki/people/noisy.md",
      );
      expect(envelope.message).not.toContain("wiki/people/clean.md");
    },
    hostileTimeoutMilliseconds,
  );

  test(
    "names files reached past the opening preview when several notes overflow standard output",
    () => {
      const folder = wikiFixture({
        "wiki/people/first-noisy.md": noisyNoteContent(5_000),
        "wiki/people/second-noisy.md": noisyNoteContent(200_000),
      });
      const { exitCode, envelope } = runHostileNoteCheck(["--wiki", folder]);
      expect(exitCode).toBe(3);
      expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_FAILED");
      expect(envelope.message).toContain("wiki/people/first-noisy.md");
      expect(envelope.message).toContain("wiki/people/second-noisy.md");
      expect(envelope.message).toContain("Files reached in cut output:");
    },
    hostileTimeoutMilliseconds,
  );

  test(
    "bounds the named file list when more than ten notes appear in cut standard output",
    () => {
      const files: Record<string, string> = {};
      for (let index = 1; index <= 11; index += 1) {
        files[`wiki/people/noisy-${String(index).padStart(2, "0")}.md`] =
          noisyNoteContent(500);
      }
      files["wiki/people/noisy-12.md"] = noisyNoteContent(200_000);
      const folder = wikiFixture(files);
      const { exitCode, envelope } = runHostileNoteCheck(["--wiki", folder]);
      expect(exitCode).toBe(3);
      expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_FAILED");
      expect(envelope.message).toContain("Files reached in cut output:");
      expect(envelope.message).toContain("(and 2 more)");
    },
    hostileTimeoutMilliseconds,
  );

  test(
    "refuses a fake linter flooding standard error with DOMAIN_NOTES_LINTER_FAILED and names no files",
    () => {
      const folder = wikiFixture({
        "wiki/people/ada-lovelace.md": cleanTargetNote,
      });
      const floodingStderrRumdl = makeFakeRumdl(`
if [ "$1" = "--version" ]; then
  echo "rumdl 0.3.5"
  exit 0
fi
head -c 9000000 /dev/zero | tr '\\0' 'e' >&2
exit 2
`);
      const { exitCode, envelope } = runHostileNoteCheck(["--wiki", folder], {
        WIKI_RUMDL_PATH: floodingStderrRumdl,
      });
      expect(exitCode).toBe(3);
      expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LINTER_FAILED");
      expect(envelope.message).toContain(
        "rumdl check output exceeded the 8000000-byte limit and was cut",
      );
      expect(envelope.message).not.toContain("Files reached in cut output:");
      expect(envelope.message).not.toContain("wiki/people/ada-lovelace.md");
    },
    hostileTimeoutMilliseconds,
  );
});
