import { describe, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  familyWikiFixture,
  readFamilyCheckRun,
  runCoreCli,
} from "./support/family-wiki.ts";
import { makeNamedPipe, wikiFixture } from "./support/wiki.ts";

const hostileTimeoutMilliseconds = 10_000;
const testTimeoutMilliseconds = 15_000;

const personTable = {
  baseTag: "example-wiki",
  families: [
    {
      family: "person",
      folder: "wiki/people/",
      headings: [{ name: "Summary", optional: false }],
    },
  ],
};

const validPersonNote = `---
family: person
title: "Ada Lovelace"
summary: "Mathematician."
created: "2026-11-01"
tags: [example-wiki]
---

# Ada Lovelace

## Summary

Mathematician.
`;

describe("family check hostile entries", () => {
  test(
    "refuses a symbolic link to a note with exit 3 and DOMAIN_PRECONDITION_UNMET naming the path",
    () => {
      const outside = wikiFixture({ "outside.md": validPersonNote });
      const folder = familyWikiFixture({
        table: personTable,
        notes: { "wiki/people/ada-lovelace.md": validPersonNote },
      });
      symlinkSync(
        join(outside, "outside.md"),
        join(folder, "wiki/people/linked.md"),
      );

      const run = runCoreCli(
        ["family", "check", "--wiki", folder],
        hostileTimeoutMilliseconds,
      );
      expect(run.exitCode).toBe(3);
      expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
      expect(run.envelope.message).toContain("wiki/people/linked.md");
    },
    testTimeoutMilliseconds,
  );

  test(
    "refuses a symbolic link to a folder with exit 3 and DOMAIN_PRECONDITION_UNMET naming the path",
    () => {
      const outside = wikiFixture({ "external/note.md": validPersonNote });
      const folder = familyWikiFixture({
        table: personTable,
        notes: { "wiki/people/ada-lovelace.md": validPersonNote },
      });
      symlinkSync(join(outside, "external"), join(folder, "wiki/linked"));

      const run = runCoreCli(
        ["family", "check", "--wiki", folder],
        hostileTimeoutMilliseconds,
      );
      expect(run.exitCode).toBe(3);
      expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
      expect(run.envelope.message).toContain("wiki/linked");
    },
    testTimeoutMilliseconds,
  );

  test(
    "refuses a named pipe pipe.md without hanging with exit 3 and DOMAIN_PRECONDITION_UNMET naming the path",
    () => {
      const folder = familyWikiFixture({
        table: personTable,
        notes: { "wiki/people/ada-lovelace.md": validPersonNote },
      });
      makeNamedPipe(join(folder, "wiki/pipe.md"));

      const run = runCoreCli(
        ["family", "check", "--wiki", folder],
        hostileTimeoutMilliseconds,
      );
      expect(run.exitCode).toBe(3);
      expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
      expect(run.envelope.message).toContain("wiki/pipe.md");
    },
    testTimeoutMilliseconds,
  );

  test(
    "refuses a non-UTF-8 note with exit 3 and DOMAIN_PRECONDITION_UNMET naming the path",
    () => {
      const folder = familyWikiFixture({
        table: personTable,
        notes: { "wiki/people/ada-lovelace.md": validPersonNote },
      });
      writeFileSync(
        join(folder, "wiki/people/bad-bytes.md"),
        Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]),
      );

      const run = runCoreCli(
        ["family", "check", "--wiki", folder],
        hostileTimeoutMilliseconds,
      );
      expect(run.exitCode).toBe(3);
      expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
      expect(run.envelope.message).toContain("wiki/people/bad-bytes.md");
    },
    testTimeoutMilliseconds,
  );

  test(
    "refuses a wiki/ folder that is a symbolic link with exit 3 and the linked-folder message",
    () => {
      const outside = wikiFixture({
        "real-wiki/people/ada-lovelace.md": validPersonNote,
      });
      const folder = wikiFixture({
        "family-table.json": `${JSON.stringify(personTable, null, 2)}\n`,
      });
      symlinkSync(join(outside, "real-wiki"), join(folder, "wiki"));

      const run = runCoreCli(
        ["family", "check", "--wiki", folder],
        hostileTimeoutMilliseconds,
      );
      expect(run.exitCode).toBe(3);
      expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
      expect(run.envelope.message).toContain("wiki/");
      expect(run.envelope.message).toContain("symbolic link");
    },
    testTimeoutMilliseconds,
  );

  test(
    "ignores .DS_Store and a non-Markdown named pipe and exits 0",
    () => {
      const folder = familyWikiFixture({
        table: personTable,
        notes: { "wiki/people/ada-lovelace.md": validPersonNote },
      });
      writeFileSync(join(folder, "wiki/.DS_Store"), "finder");
      makeNamedPipe(join(folder, "wiki/pipe"));

      const run = readFamilyCheckRun(
        runCoreCli(
          ["family", "check", "--wiki", folder],
          hostileTimeoutMilliseconds,
        ),
      );
      expect(run.exitCode).toBe(0);
      expect(run.causeCode).toBe("SUCCESS_UNCHANGED");
      expect(run.notes).toBe(1);
      expect(run.findings).toEqual([]);
    },
    testTimeoutMilliseconds,
  );
});

describe("family drift hostile entries", () => {
  test(
    "reports template-differs and exits 0 when templates/person.md is a folder",
    () => {
      const folder = familyWikiFixture({ table: personTable });
      mkdirSync(join(folder, "templates/person.md"), { recursive: true });

      const run = runCoreCli(
        ["family", "drift", "--wiki", folder],
        hostileTimeoutMilliseconds,
      );
      expect(run.exitCode).toBe(0);
      expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
      expect(run.envelope.result.data).toEqual({
        findings: [
          {
            path: "templates/person.md",
            kind: "template-differs",
            detail: "the path is not a file",
          },
        ],
      });
    },
    testTimeoutMilliseconds,
  );

  test(
    "refuses a pipe named templates/person.md without hanging with exit 3 naming it",
    () => {
      const folder = familyWikiFixture({ table: personTable });
      mkdirSync(join(folder, "templates"), { recursive: true });
      makeNamedPipe(join(folder, "templates/person.md"));

      const run = runCoreCli(
        ["family", "drift", "--wiki", folder],
        hostileTimeoutMilliseconds,
      );
      expect(run.exitCode).toBe(3);
      expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
      expect(run.envelope.message).toContain("templates/person.md");
    },
    testTimeoutMilliseconds,
  );

  test(
    "refuses a templates/ folder that is a symbolic link with exit 3 naming templates/",
    () => {
      const outside = wikiFixture({
        "real-templates/person.md": validPersonNote,
      });
      const folder = familyWikiFixture({ table: personTable });
      symlinkSync(join(outside, "real-templates"), join(folder, "templates"));

      const run = runCoreCli(
        ["family", "drift", "--wiki", folder],
        hostileTimeoutMilliseconds,
      );
      expect(run.exitCode).toBe(3);
      expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
      expect(run.envelope.message).toContain("templates/");
      expect(run.envelope.message).toContain("symbolic link");
    },
    testTimeoutMilliseconds,
  );
});
