import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ownedMarkdownFiles } from "../src/shared/markdown-files.ts";
import {
  pathsGivenToRumdl,
  recordingRumdl,
  rumdlCheckRuns,
  runNoteCheck,
} from "./support/note-check.ts";
import { root, wikiFixture } from "./support/wiki.ts";

const cleanNote = "# Clean\n\nNothing to fix here.\n";
const brokenNote = "# Broken\n\nSee [the record](./missing.md).\n";

function git(folder: string, ...args: string[]): void {
  const run = Bun.spawnSync(
    [
      "git",
      "-C",
      folder,
      "-c",
      "user.name=Note Check Test",
      "-c",
      "user.email=note-check@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { env: process.env, stdout: "pipe", stderr: "pipe" },
  );
  if (run.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${run.stderr.toString()}`);
  }
}

function gitWiki(files: Record<string, string>): string {
  const folder = wikiFixture(files);
  git(folder, "init", "-q");
  return folder;
}

const hidingFiles: readonly {
  readonly name: string;
  readonly path: string;
  readonly entry: string;
}[] = [
  { name: ".gitignore", path: ".gitignore", entry: "wiki/people/hidden.md" },
  { name: ".ignore", path: ".ignore", entry: "hidden.md" },
  {
    name: ".git/info/exclude",
    path: ".git/info/exclude",
    entry: "wiki/people/hidden.md",
  },
  {
    name: ".markdownlintignore",
    path: ".markdownlintignore",
    entry: "hidden.md",
  },
];

test("refuses a broken note that .gitignore, .ignore, .git/info/exclude or .markdownlintignore lists, instead of passing it unchecked", () => {
  expect(hidingFiles).toHaveLength(4);
  for (const hiding of hidingFiles) {
    const folder = gitWiki({
      "wiki/people/ok.md": cleanNote,
      "wiki/people/hidden.md": brokenNote,
    });
    writeFileSync(join(folder, hiding.path), `${hiding.entry}\n`);
    const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
    expect({ hiding: hiding.name, exitCode }).toEqual({
      hiding: hiding.name,
      exitCode: 3,
    });
    expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_BROKEN_LINKS");
    expect(envelope.message).toContain("[note] wiki/people/hidden.md:3");
    expect(envelope.message).toContain("1 Markdown finding in 2 files");
  }
});

test("refuses a broken note committed under wiki/projects/coverage/ in a repository that carries this repository's .gitignore", () => {
  const folder = gitWiki({
    "wiki/people/ok.md": cleanNote,
    "wiki/projects/coverage/plan.md": brokenNote,
    ".gitignore": readFileSync(join(root, ".gitignore"), "utf8"),
  });
  git(folder, "add", "-f", ".gitignore", "wiki");
  git(folder, "commit", "-q", "-m", "plant a note under coverage");
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_BROKEN_LINKS");
  expect(envelope.message).toContain("[note] wiki/projects/coverage/plan.md:3");
});

test("reports as filesChecked exactly the Markdown files it names to rumdl, leaving out the inbox and files that are not Markdown", () => {
  const folder = gitWiki({
    "wiki/people/ok.md": cleanNote,
    "wiki/people/hidden.md": cleanNote,
    "wiki/people/UPPER.MD": cleanNote,
    "wiki/people/long.markdown": cleanNote,
    "wiki/people/photo.png": "not a note",
    "wiki/inbox/draft.md": brokenNote,
    "templates/person.md": cleanNote,
    ".gitignore": "wiki/people/hidden.md\n",
  });
  const logPath = join(wikiFixture({}), "rumdl-arguments.log");
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: recordingRumdl(logPath),
  });
  expect(exitCode).toBe(0);
  const given = pathsGivenToRumdl(logPath, folder).toSorted();
  expect(given).toEqual([
    "templates/person.md",
    "wiki/people/UPPER.MD",
    "wiki/people/hidden.md",
    "wiki/people/long.markdown",
    "wiki/people/ok.md",
  ]);
  expect(envelope.result.data?.["filesChecked"]).toBe(5);
});

test("passes with filesChecked 0 and never starts rumdl when the only Markdown file is an inbox draft", () => {
  const folder = wikiFixture({
    "wiki/inbox/draft.md": brokenNote,
    "wiki/people/photo.png": "not a note",
  });
  const logPath = join(wikiFixture({}), "rumdl-arguments.log");
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder], {
    WIKI_RUMDL_PATH: recordingRumdl(logPath),
  });
  expect(exitCode).toBe(0);
  expect(envelope.result.data).toMatchObject({
    filesChecked: 0,
    findingCount: 0,
  });
  expect(rumdlCheckRuns(logPath)).toBe(0);
});

test("refuses broken links in .MD and .markdown notes and counts both files", () => {
  const folder = wikiFixture({
    "wiki/people/UPPER.MD": brokenNote,
    "wiki/people/long.markdown": brokenNote,
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_BROKEN_LINKS");
  expect(envelope.message).toContain("[note] wiki/people/UPPER.MD:3");
  expect(envelope.message).toContain("[note] wiki/people/long.markdown:3");
  expect(envelope.message).toContain("2 Markdown findings in 2 files");
});

test("passes a clean wiki with a very large broken draft in wiki/inbox/, because the inbox is never given to rumdl", () => {
  const folder = wikiFixture({
    "wiki/people/ok.md": cleanNote,
    "wiki/inbox/huge-draft.md": `# Huge draft\n\n${"See [the record](./missing.md).\n\n".repeat(40_000)}`,
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(0);
  expect(envelope.result.data).toMatchObject({
    filesChecked: 1,
    findingCount: 0,
  });
});

function outsideBrokenFolder(): string {
  const outside = wikiFixture({ "linked/broken.md": brokenNote });
  return join(outside, "linked");
}

const linkedPlacements: readonly {
  readonly linkedPath: string;
  readonly plant: (folder: string) => void;
}[] = [
  {
    linkedPath: "wiki/people/linked.md",
    plant: (folder) => {
      symlinkSync(
        join(outsideBrokenFolder(), "broken.md"),
        join(folder, "wiki/people/linked.md"),
      );
    },
  },
  {
    linkedPath: "wiki/linked",
    plant: (folder) => {
      symlinkSync(outsideBrokenFolder(), join(folder, "wiki/linked"));
    },
  },
  {
    linkedPath: "templates/sub",
    plant: (folder) => {
      mkdirSync(join(folder, "templates"), { recursive: true });
      symlinkSync(outsideBrokenFolder(), join(folder, "templates/sub"));
    },
  },
];

test("refuses a symlinked note or folder anywhere under wiki/ or templates/ with DOMAIN_PRECONDITION_UNMET naming the linked path", () => {
  expect(linkedPlacements).toHaveLength(3);
  for (const placement of linkedPlacements) {
    const folder = wikiFixture({ "wiki/people/ok.md": cleanNote });
    placement.plant(folder);
    const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
    expect({ linked: placement.linkedPath, exitCode }).toEqual({
      linked: placement.linkedPath,
      exitCode: 3,
    });
    expect(envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(envelope.message).toContain(placement.linkedPath);
    expect(envelope.message).toContain("Repair:");
  }
});

test("treats a missing optional settings file as no exclusions while reporting read and parse errors with their reason", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanNote,
    "wiki/inbox/draft.md": cleanNote,
    "broken.toml": "[global\nexclude = [\n",
  });
  const omitted = ownedMarkdownFiles(folder);
  expect(omitted).toEqual({
    kind: "listed",
    files: [
      join(folder, "wiki/inbox/draft.md"),
      join(folder, "wiki/people/ada-lovelace.md"),
    ],
  });

  const missing = ownedMarkdownFiles(
    folder,
    join(folder, "does-not-exist.toml"),
  );
  expect(missing).toEqual(omitted);

  const malformed = ownedMarkdownFiles(folder, join(folder, "broken.toml"));
  expect(malformed.kind).toBe("unreadable-settings");
  if (malformed.kind === "unreadable-settings") {
    expect(malformed.reason).toContain("Could not parse rumdl settings file");
    expect(malformed.reason).toContain("TOML");
  }
});
