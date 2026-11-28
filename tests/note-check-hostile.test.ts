import { describe, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
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

function makeNamedPipe(pipePath: string): void {
  const created = Bun.spawnSync(["mkfifo", pipePath], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
    killSignal: "SIGKILL",
  });
  if (created.exitCode !== 0) {
    throw new Error(
      `mkfifo failed for ${pipePath}: ${created.stderr.toString()}`,
    );
  }
}

describe("hostile entries", () => {
  test("refuses a symbolic link to a file outside the wiki with exit 3 and DOMAIN_PRECONDITION_UNMET naming the path", () => {
    const outside = wikiFixture({ "outside.md": cleanTargetNote });
    const folder = wikiFixture({
      "wiki/people/ada-lovelace.md": cleanTargetNote,
    });
    symlinkSync(
      join(outside, "outside.md"),
      join(folder, "wiki/people/linked.md"),
    );

    const { exitCode, envelope } = runHostileNoteCheck(["--wiki", folder]);
    expect(exitCode).toBe(3);
    expect(envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(envelope.message).toContain("wiki/people/linked.md");
  });

  test("refuses a symbolic link to a folder outside the wiki with exit 3 and DOMAIN_PRECONDITION_UNMET naming the path", () => {
    const outside = wikiFixture({ "external/note.md": cleanTargetNote });
    const folder = wikiFixture({
      "wiki/people/ada-lovelace.md": cleanTargetNote,
    });
    symlinkSync(join(outside, "external"), join(folder, "wiki/linked"));

    const { exitCode, envelope } = runHostileNoteCheck(["--wiki", folder]);
    expect(exitCode).toBe(3);
    expect(envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(envelope.message).toContain("wiki/linked");
  });

  test("refuses a wiki/ folder that is a symbolic link with exit 3 and DOMAIN_PRECONDITION_UNMET naming the link", () => {
    const outside = wikiFixture({
      "real-wiki/people/ada-lovelace.md": cleanTargetNote,
    });
    const folder = wikiFixture({});
    symlinkSync(join(outside, "real-wiki"), join(folder, "wiki"));

    const { exitCode, envelope } = runHostileNoteCheck(["--wiki", folder]);
    expect(exitCode).toBe(3);
    expect(envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(envelope.message).toContain("wiki/");
    expect(envelope.message).toContain("symbolic link");
  });

  test("refuses a templates/ folder that is a symbolic link with exit 3 and DOMAIN_PRECONDITION_UNMET naming the link", () => {
    const outside = wikiFixture({
      "real-templates/person.md": cleanTargetNote,
    });
    const folder = wikiFixture({
      "wiki/people/ada-lovelace.md": cleanTargetNote,
    });
    symlinkSync(join(outside, "real-templates"), join(folder, "templates"));

    const { exitCode, envelope } = runHostileNoteCheck(["--wiki", folder]);
    expect(exitCode).toBe(3);
    expect(envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(envelope.message).toContain("templates/");
    expect(envelope.message).toContain("symbolic link");
  });

  test("refuses a named pipe with a Markdown name with exit 3 and DOMAIN_PRECONDITION_UNMET naming the path without opening it", () => {
    const folder = wikiFixture({
      "wiki/people/ada-lovelace.md": cleanTargetNote,
    });
    makeNamedPipe(join(folder, "wiki/pipe.md"));

    const { exitCode, envelope } = runHostileNoteCheck(["--wiki", folder]);
    expect(exitCode).toBe(3);
    expect(envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(envelope.message).toContain("wiki/pipe.md");
  });

  test("ignores .DS_Store inside wiki/ and templates/ and exits 0", () => {
    const folder = wikiFixture({
      "wiki/people/ada-lovelace.md": cleanTargetNote,
    });
    mkdirSync(join(folder, "templates"), { recursive: true });
    writeFileSync(join(folder, "wiki/.DS_Store"), "finder");
    writeFileSync(join(folder, "templates/.DS_Store"), "finder");

    const { exitCode, envelope } = runHostileNoteCheck(["--wiki", folder]);
    expect(exitCode).toBe(0);
    expect(envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
  });

  test("ignores a named pipe without a Markdown name and exits 0", () => {
    const folder = wikiFixture({
      "wiki/people/ada-lovelace.md": cleanTargetNote,
    });
    makeNamedPipe(join(folder, "wiki/pipe"));

    const { exitCode, envelope } = runHostileNoteCheck(["--wiki", folder]);
    expect(exitCode).toBe(0);
    expect(envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
  });
});

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
