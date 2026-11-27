import { expect, test } from "bun:test";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import {
  cleanTargetNote,
  readDiagnosticsEvents,
  runNoteCheck,
} from "./support/note-check.ts";
import { wikiFixture } from "./support/wiki.ts";

function aliasOf(folder: string): string {
  const aliasRoot = join(wikiFixture({}), "alias-wiki");
  symlinkSync(folder, aliasRoot);
  return aliasRoot;
}

test("refuses a broken in-wiki link instead of skipping it as external when --wiki is given through a symlink to the wiki root", () => {
  const folder = wikiFixture({
    "wiki/people/broken-link.md": `---
title: "Broken Link"
---

# Broken Link

See [missing](./no-such-note.md).
`,
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", aliasOf(folder)]);
  expect(exitCode).toBe(3);
  expect(envelope.result.outcome).toBe("refused");
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_BROKEN_LINKS");
  expect(envelope.message).toContain("[note] wiki/people/broken-link.md:7");
  expect(envelope.message).toContain("MD057");

  const events = readDiagnosticsEvents(envelope);
  const completed = events.find(
    (entry) => entry["event"] === "notes.check.completed",
  );
  expect(completed?.["facts"]).toMatchObject({
    findingCount: 1,
    externalLinksSkippedCount: 0,
  });
});

test("passes a clean wiki given through a symlink to the wiki root with wiki-relative paths and no skipped links", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", aliasOf(folder)]);
  expect(exitCode).toBe(0);
  expect(envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
  expect(envelope.result.data?.["filesChecked"]).toBe(1);
  expect(envelope.result.data?.["externalLinksSkipped"]).toEqual([]);
});

test("labels a template finding as [template] with a wiki-relative path when --wiki is given through a symlink to the wiki root", () => {
  const folder = wikiFixture({
    "wiki/people/ada-lovelace.md": cleanTargetNote,
    "templates/person.md": `---
title: "{{title}}"
---

# {{title}}

- dash
* star
`,
  });
  const { exitCode, envelope } = runNoteCheck(["--wiki", aliasOf(folder)]);
  expect(exitCode).toBe(3);
  expect(envelope.result.causeCode).toBe("DOMAIN_NOTES_LIST_AND_TABLE_FORMAT");
  expect(envelope.message).toContain("[template] templates/person.md:8");
});
