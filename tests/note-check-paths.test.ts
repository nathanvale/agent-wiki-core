import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { runNoteCheck } from "./support/note-check.ts";
import { root, wikiFixture } from "./support/wiki.ts";

const runsFromSixFolders = 60_000;

const cleanNote = "# Clean\n\nNothing to fix here.\n";

function linkingNote(target: string): string {
  return `# Linking\n\nSee [the record](${target}).\n`;
}

type CallerFolder = {
  readonly name: string;
  readonly workingDirectory: string;
  readonly wikiArgument: string;
};

function callerFolders(wikiRoot: string): readonly CallerFolder[] {
  return [
    { name: "the checkout", workingDirectory: root, wikiArgument: wikiRoot },
    { name: "the wiki root", workingDirectory: wikiRoot, wikiArgument: "." },
    {
      name: "wiki/",
      workingDirectory: join(wikiRoot, "wiki"),
      wikiArgument: "..",
    },
    {
      name: "wiki/people/ with a relative --wiki",
      workingDirectory: join(wikiRoot, "wiki/people"),
      wikiArgument: "../..",
    },
    {
      name: "wiki/people/ with an absolute --wiki",
      workingDirectory: join(wikiRoot, "wiki/people"),
      wikiArgument: wikiRoot,
    },
    {
      name: "the parent of the wiki root",
      workingDirectory: dirname(wikiRoot),
      wikiArgument: basename(wikiRoot),
    },
  ];
}

function checkFrom(caller: CallerFolder) {
  const run = runNoteCheck(
    ["--wiki", caller.wikiArgument],
    {},
    caller.workingDirectory,
  );
  return { caller: caller.name, ...run };
}

test(
  "refuses a broken note link with the same wiki-relative path from every caller working directory",
  () => {
    const folder = wikiFixture({
      "wiki/people/broken.md": linkingNote("../areas/missing.md"),
      "wiki/areas/ok.md": cleanNote,
    });
    const folders = callerFolders(folder);
    expect(folders).toHaveLength(6);
    for (const caller of folders) {
      const { exitCode, envelope } = checkFrom(caller);
      expect({ caller: caller.name, exitCode }).toEqual({
        caller: caller.name,
        exitCode: 3,
      });
      expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_BROKEN_LINKS");
      expect(envelope.message).toContain("[note] wiki/people/broken.md:3");
    }
  },
  runsFromSixFolders,
);

test(
  "labels a broken template link as [template] with its wiki-relative path from every caller working directory",
  () => {
    const folder = wikiFixture({
      "wiki/people/ok.md": cleanNote,
      "templates/person.md": linkingNote("./missing.md"),
    });
    for (const caller of callerFolders(folder)) {
      const { exitCode, envelope } = checkFrom(caller);
      expect({ caller: caller.name, exitCode }).toEqual({
        caller: caller.name,
        exitCode: 3,
      });
      expect(envelope.message).toContain("[template] templates/person.md:3");
      expect(envelope.message).not.toContain("[note]");
    }
  },
  runsFromSixFolders,
);

test(
  "skips a link that leaves the wiki root and lists it under its wiki-relative note path from every caller working directory",
  () => {
    const folder = wikiFixture({
      "wiki/people/ext.md": linkingNote("../../../old-vault/x.md"),
    });
    for (const caller of callerFolders(folder)) {
      const { exitCode, envelope } = checkFrom(caller);
      expect({ caller: caller.name, exitCode }).toEqual({
        caller: caller.name,
        exitCode: 0,
      });
      expect(envelope.result.data?.["externalLinksSkipped"]).toEqual([
        {
          path: "wiki/people/ext.md",
          line: 3,
          target: "../../../old-vault/x.md",
        },
      ]);
    }
  },
  runsFromSixFolders,
);

test("skips a broken note in <wiki root>/wiki/inbox/ and leaves it out of filesChecked", () => {
  const folder = wikiFixture({
    "wiki/ok.md": cleanNote,
    "wiki/inbox/draft.md": linkingNote("../missing.md"),
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(0);
  expect(envelope.result.data).toMatchObject({
    filesChecked: 1,
    findingCount: 0,
  });
});

test("refuses a broken note in a wiki/inbox/ folder nested deeper under wiki/", () => {
  const folder = wikiFixture({
    "wiki/ok.md": cleanNote,
    "wiki/projects/wiki/inbox/real.md": linkingNote("../missing.md"),
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_BROKEN_LINKS");
  expect(envelope.message).toContain(
    "[note] wiki/projects/wiki/inbox/real.md:3",
  );
  expect(envelope.message).toContain("1 Markdown finding in 2 files");
});

test("refuses a broken template in a wiki/inbox/ folder under templates/", () => {
  const folder = wikiFixture({
    "wiki/ok.md": cleanNote,
    "templates/wiki/inbox/real.md": linkingNote("../missing.md"),
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_BROKEN_LINKS");
  expect(envelope.message).toContain(
    "[template] templates/wiki/inbox/real.md:3",
  );
  expect(envelope.message).toContain("1 Markdown finding in 2 files");
});

test("checks a wiki root that sits under a folder path containing wiki/inbox/ like any other wiki root", () => {
  const brokenParent = wikiFixture({
    "wiki/inbox/my-wiki/wiki/people/broken.md": linkingNote("../missing.md"),
  });
  const brokenRun = runNoteCheck([
    "--wiki",
    join(brokenParent, "wiki/inbox/my-wiki"),
  ]);
  expect(brokenRun.exitCode).toBe(3);
  expect(brokenRun.envelope.result.causeCode).toBe("DOMAIN_NOTES_BROKEN_LINKS");
  expect(brokenRun.envelope.message).toContain(
    "[note] wiki/people/broken.md:3",
  );

  const cleanParent = wikiFixture({
    "wiki/inbox/my-wiki/wiki/people/ok.md": cleanNote,
  });
  const cleanRun = runNoteCheck([
    "--wiki",
    join(cleanParent, "wiki/inbox/my-wiki"),
  ]);
  expect(cleanRun.exitCode).toBe(0);
  expect(cleanRun.envelope.result.data).toMatchObject({ filesChecked: 1 });
});

test("refuses a wiki root whose templates/ folder is a symlink, with DOMAIN_PRECONDITION_UNMET and a repair, instead of passing", () => {
  const folder = wikiFixture({ "wiki/ok.md": cleanNote });
  const linkedTemplates = wikiFixture({});
  mkdirSync(join(linkedTemplates, "family"));
  writeFileSync(
    join(linkedTemplates, "family/person.md"),
    linkingNote("./missing.md"),
  );
  symlinkSync(join(linkedTemplates, "family"), join(folder, "templates"));
  const { exitCode, envelope } = runNoteCheck(["--wiki", folder]);
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
  expect(envelope.message).toContain("templates/");
  expect(envelope.message).toContain("Repair:");
});
