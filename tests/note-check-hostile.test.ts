import { describe, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseJson, readObject, readString } from "./support/json.ts";
import { cleanTargetNote } from "./support/note-check.ts";
import { readResultFields, root, wikiFixture } from "./support/wiki.ts";

type HostileCheckEnvelope = {
  readonly message: string;
  readonly result: {
    readonly causeCode: string;
  };
};

function parseEnvelope(stdout: string): HostileCheckEnvelope {
  return readObject(parseJson(stdout, "envelope"), "envelope", (envelope) => {
    const result = readObject(
      envelope["result"],
      "envelope.result",
      (record, path) => readResultFields(record, path),
    );
    return {
      message: readString(envelope["message"], "envelope.message"),
      result: {
        causeCode: result.causeCode,
      },
    };
  });
}

function runHostileNoteCheck(wikiRoot: string): {
  readonly exitCode: number;
  readonly envelope: HostileCheckEnvelope;
} {
  const stateHome = wikiFixture({});
  const run = Bun.spawnSync(
    [
      "bun",
      join(root, "src/cli.ts"),
      "note",
      "check",
      "--wiki",
      wikiRoot,
      "--json",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        XDG_STATE_HOME: stateHome,
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
      killSignal: "SIGKILL",
    },
  );
  const stdout = run.stdout.toString();
  if (stdout.trim() === "") {
    throw new Error(
      `Expected JSON stdout, got exit=${String(run.exitCode)} stderr=${run.stderr.toString()}`,
    );
  }
  return {
    exitCode: run.exitCode,
    envelope: parseEnvelope(stdout),
  };
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

    const { exitCode, envelope } = runHostileNoteCheck(folder);
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

    const { exitCode, envelope } = runHostileNoteCheck(folder);
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

    const { exitCode, envelope } = runHostileNoteCheck(folder);
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

    const { exitCode, envelope } = runHostileNoteCheck(folder);
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

    const { exitCode, envelope } = runHostileNoteCheck(folder);
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

    const { exitCode, envelope } = runHostileNoteCheck(folder);
    expect(exitCode).toBe(0);
    expect(envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
  });

  test("ignores a named pipe without a Markdown name and exits 0", () => {
    const folder = wikiFixture({
      "wiki/people/ada-lovelace.md": cleanTargetNote,
    });
    makeNamedPipe(join(folder, "wiki/pipe"));

    const { exitCode, envelope } = runHostileNoteCheck(folder);
    expect(exitCode).toBe(0);
    expect(envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
  });
});
