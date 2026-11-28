import { describe, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { familyWikiFixture, runConsumerCli } from "./support/family-wiki.ts";
import { makeNamedPipe, wikiFixture } from "./support/wiki.ts";

const hostileTimeoutMilliseconds = 10_000;
const testTimeoutMilliseconds = 15_000;
const maxCopyBackingBytes = 64 * 1024;
const repairText =
  "remove or replace the named entry, then run the command again";

const validNote = `---
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

function expectHostileRefusal(
  args: readonly string[],
  expectedPath: string,
  expectedReason?: string,
): void {
  const run = runConsumerCli(args, hostileTimeoutMilliseconds);
  expect(run.exitCode).toBe(3);
  expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
  expect(run.envelope.message).toContain(expectedPath);
  expect(run.envelope.message).toContain(repairText);
  if (expectedReason !== undefined) {
    expect(run.envelope.message).toContain(expectedReason);
  }
}

describe("consumer CLI readers refuse hostile entries", () => {
  test(
    "readRenameInputs refuses a pipe at .raw/a.manifest.json through wikiReadCommand and withWikiRoot",
    () => {
      const folder = familyWikiFixture({
        notes: { "wiki/people/ada.md": validNote },
      });
      mkdirSync(join(folder, ".raw"), { recursive: true });
      makeNamedPipe(join(folder, ".raw/a.manifest.json"));

      expectHostileRefusal(
        ["reader", "rename-inputs", "--wiki", folder],
        ".raw/a.manifest.json",
      );
      expectHostileRefusal(
        ["plain", "read", "--wiki", folder, "--reader", "rename-inputs"],
        ".raw/a.manifest.json",
      );
      expectHostileRefusal(
        [
          "plain",
          "read",
          "--wiki",
          folder,
          "--reader",
          "rename-inputs",
          "--async",
        ],
        ".raw/a.manifest.json",
      );
    },
    testTimeoutMilliseconds,
  );

  test(
    "readRenameInputs refuses a pipe at .claude-obsidian.json through wikiReadCommand and withWikiRoot",
    () => {
      const folder = familyWikiFixture({
        notes: { "wiki/people/ada.md": validNote },
      });
      makeNamedPipe(join(folder, ".claude-obsidian.json"));

      expectHostileRefusal(
        ["reader", "rename-inputs", "--wiki", folder],
        ".claude-obsidian.json",
      );
      expectHostileRefusal(
        ["plain", "read", "--wiki", folder, "--reader", "rename-inputs"],
        ".claude-obsidian.json",
      );
      expectHostileRefusal(
        [
          "plain",
          "read",
          "--wiki",
          folder,
          "--reader",
          "rename-inputs",
          "--async",
        ],
        ".claude-obsidian.json",
      );
    },
    testTimeoutMilliseconds,
  );

  test(
    "readRenameInputs refuses a non-UTF-8 template through wikiReadCommand and withWikiRoot",
    () => {
      const folder = familyWikiFixture({
        notes: { "wiki/people/ada.md": validNote },
      });
      mkdirSync(join(folder, "templates"), { recursive: true });
      writeFileSync(
        join(folder, "templates/bad.md"),
        Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]),
      );

      expectHostileRefusal(
        ["reader", "rename-inputs", "--wiki", folder],
        "templates/bad.md",
        "not-utf8",
      );
      expectHostileRefusal(
        ["plain", "read", "--wiki", folder, "--reader", "rename-inputs"],
        "templates/bad.md",
        "not-utf8",
      );
    },
    testTimeoutMilliseconds,
  );

  test(
    "readTextIfExists refuses a named file under a linked folder through wikiReadCommand and withWikiRoot",
    () => {
      const outside = wikiFixture({ "external/secret.md": validNote });
      const folder = familyWikiFixture({
        notes: { "wiki/people/ada.md": validNote },
      });
      symlinkSync(join(outside, "external"), join(folder, "wiki/linked"));

      expectHostileRefusal(
        [
          "reader",
          "text-if-exists",
          "--wiki",
          folder,
          "--path",
          "wiki/linked/secret.md",
        ],
        "wiki/linked/secret.md",
      );
      expectHostileRefusal(
        [
          "plain",
          "read",
          "--wiki",
          folder,
          "--reader",
          "text-if-exists",
          "--path",
          "wiki/linked/secret.md",
        ],
        "wiki/linked/secret.md",
      );
      expectHostileRefusal(
        [
          "plain",
          "read",
          "--wiki",
          folder,
          "--reader",
          "text-if-exists",
          "--path",
          "wiki/linked/secret.md",
          "--async",
        ],
        "wiki/linked/secret.md",
      );
    },
    testTimeoutMilliseconds,
  );

  test(
    "readBytesInWiki refuses a named file under a linked folder through wikiReadCommand and withWikiRoot",
    () => {
      const outside = wikiFixture({ "external/secret.bin": "hello" });
      const folder = familyWikiFixture({
        notes: { "wiki/people/ada.md": validNote },
      });
      symlinkSync(join(outside, "external"), join(folder, "wiki/linked"));

      expectHostileRefusal(
        [
          "reader",
          "bytes-in-wiki",
          "--wiki",
          folder,
          "--path",
          "wiki/linked/secret.bin",
        ],
        "wiki/linked/secret.bin",
      );
      expectHostileRefusal(
        [
          "plain",
          "read",
          "--wiki",
          folder,
          "--reader",
          "bytes-in-wiki",
          "--path",
          "wiki/linked/secret.bin",
        ],
        "wiki/linked/secret.bin",
      );
    },
    testTimeoutMilliseconds,
  );

  test(
    "readTextIfExists and readBytesInWiki refuse a named path with .. with parent-step",
    () => {
      const folder = familyWikiFixture({
        notes: { "wiki/people/ada.md": validNote },
      });

      expectHostileRefusal(
        [
          "reader",
          "text-if-exists",
          "--wiki",
          folder,
          "--path",
          "wiki/../outside.md",
        ],
        "wiki/../outside.md",
        "parent-step",
      );
      expectHostileRefusal(
        [
          "plain",
          "read",
          "--wiki",
          folder,
          "--reader",
          "text-if-exists",
          "--path",
          "wiki/../outside.md",
        ],
        "wiki/../outside.md",
        "parent-step",
      );
      expectHostileRefusal(
        [
          "reader",
          "bytes-in-wiki",
          "--wiki",
          folder,
          "--path",
          "wiki/../outside.bin",
        ],
        "wiki/../outside.bin",
        "parent-step",
      );
      expectHostileRefusal(
        [
          "plain",
          "read",
          "--wiki",
          folder,
          "--reader",
          "bytes-in-wiki",
          "--path",
          "wiki/../outside.bin",
          "--async",
        ],
        "wiki/../outside.bin",
        "parent-step",
      );
    },
    testTimeoutMilliseconds,
  );

  test(
    "readWikiMarkdownTexts refuses a pipe named wiki/x.md and a non-UTF-8 template through wikiReadCommand and withWikiRoot",
    () => {
      const pipeFolder = familyWikiFixture({
        notes: { "wiki/people/ada.md": validNote },
      });
      makeNamedPipe(join(pipeFolder, "wiki/x.md"));

      expectHostileRefusal(
        ["reader", "wiki-markdown-texts", "--wiki", pipeFolder],
        "wiki/x.md",
      );
      expectHostileRefusal(
        [
          "plain",
          "read",
          "--wiki",
          pipeFolder,
          "--reader",
          "wiki-markdown-texts",
        ],
        "wiki/x.md",
      );

      const badTemplateFolder = familyWikiFixture({
        notes: { "wiki/people/ada.md": validNote },
      });
      mkdirSync(join(badTemplateFolder, "templates"), { recursive: true });
      writeFileSync(
        join(badTemplateFolder, "templates/bad.md"),
        Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]),
      );

      expectHostileRefusal(
        ["reader", "wiki-markdown-texts", "--wiki", badTemplateFolder],
        "templates/bad.md",
        "not-utf8",
      );
      expectHostileRefusal(
        [
          "plain",
          "read",
          "--wiki",
          badTemplateFolder,
          "--reader",
          "wiki-markdown-texts",
          "--async",
        ],
        "templates/bad.md",
        "not-utf8",
      );
    },
    testTimeoutMilliseconds,
  );

  test(
    "readFolderNotes refuses a pipe named wiki/x.md through wikiReadCommand and withWikiRoot",
    () => {
      const folder = familyWikiFixture({
        notes: { "wiki/people/ada.md": validNote },
      });
      makeNamedPipe(join(folder, "wiki/x.md"));

      expectHostileRefusal(
        ["reader", "folder-notes", "--wiki", folder, "--folder", "wiki"],
        "wiki/x.md",
      );
      expectHostileRefusal(
        [
          "plain",
          "read",
          "--wiki",
          folder,
          "--reader",
          "folder-notes",
          "--folder",
          "wiki",
        ],
        "wiki/x.md",
      );
      expectHostileRefusal(
        [
          "plain",
          "read",
          "--wiki",
          folder,
          "--reader",
          "folder-notes",
          "--folder",
          "wiki",
          "--async",
        ],
        "wiki/x.md",
      );
    },
    testTimeoutMilliseconds,
  );

  test(
    "readBytesInWiki returns a copied Buffer whose backing ArrayBuffer is under 64 KiB for a 5-byte file",
    () => {
      const folder = familyWikiFixture({
        extraFiles: { "wiki/small.bin": "12345" },
      });

      const run = runConsumerCli(
        [
          "reader",
          "bytes-in-wiki",
          "--wiki",
          folder,
          "--path",
          "wiki/small.bin",
        ],
        hostileTimeoutMilliseconds,
      );
      expect(run.exitCode).toBe(0);
      expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
      expect(run.envelope.result.data).not.toBeNull();
      expect(run.envelope.result.data?.["byteLength"]).toBe(5);
      const backingBytes = run.envelope.result.data?.["bufferByteLength"];
      expect(typeof backingBytes).toBe("number");
      if (typeof backingBytes === "number") {
        expect(backingBytes).toBeLessThan(maxCopyBackingBytes);
      }
    },
    testTimeoutMilliseconds,
  );

  test(
    "withWikiRoot refuses a missing or linked wiki/ folder and rethrows non-WikiReadRefusal errors",
    () => {
      const missingRoot = wikiFixture({});
      const missingRun = runConsumerCli(
        ["plain", "read", "--wiki", missingRoot, "--reader", "rename-inputs"],
        hostileTimeoutMilliseconds,
      );
      expect(missingRun.exitCode).toBe(3);
      expect(missingRun.envelope.result.causeCode).toBe(
        "DOMAIN_PRECONDITION_UNMET",
      );
      expect(missingRun.envelope.message).toContain("has no wiki/ folder");

      const outside = wikiFixture({ "real-wiki/people/ada.md": validNote });
      const linkedRoot = wikiFixture({});
      symlinkSync(join(outside, "real-wiki"), join(linkedRoot, "wiki"));
      const linkedRun = runConsumerCli(
        [
          "plain",
          "read",
          "--wiki",
          linkedRoot,
          "--reader",
          "rename-inputs",
          "--async",
        ],
        hostileTimeoutMilliseconds,
      );
      expect(linkedRun.exitCode).toBe(3);
      expect(linkedRun.envelope.result.causeCode).toBe(
        "DOMAIN_PRECONDITION_UNMET",
      );
      expect(linkedRun.envelope.message).toContain("wiki/");
      expect(linkedRun.envelope.message).toContain("symbolic link");

      const validFolder = familyWikiFixture({
        notes: { "wiki/people/ada.md": validNote },
      });
      const rethrownSync = runConsumerCli(
        [
          "plain",
          "read",
          "--wiki",
          validFolder,
          "--reader",
          "bytes-in-wiki",
          "--path",
          "wiki/does-not-exist.bin",
        ],
        hostileTimeoutMilliseconds,
      );
      expect(rethrownSync.exitCode).toBe(1);
      expect(rethrownSync.envelope.result.causeCode).toBe(
        "INTERNAL_RESULT_UNCHANGED",
      );

      const rethrownAsync = runConsumerCli(
        [
          "plain",
          "read",
          "--wiki",
          validFolder,
          "--reader",
          "bytes-in-wiki",
          "--path",
          "wiki/does-not-exist.bin",
          "--async",
        ],
        hostileTimeoutMilliseconds,
      );
      expect(rethrownAsync.exitCode).toBe(1);
      expect(rethrownAsync.envelope.result.causeCode).toBe(
        "INTERNAL_RESULT_UNCHANGED",
      );
    },
    testTimeoutMilliseconds,
  );
});
