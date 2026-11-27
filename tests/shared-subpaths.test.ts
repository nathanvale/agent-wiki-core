import { expect, test } from "bun:test";

test("shared subpath exports resolve every moved shared module", async () => {
  const markdownFiles = await import("agent-wiki-core/shared/markdown-files");
  const markdownSections = await import(
    "agent-wiki-core/shared/markdown-sections"
  );
  const noteHashes = await import("agent-wiki-core/shared/note-hashes");
  const programPath = await import("agent-wiki-core/shared/program-path");
  const rules = await import("agent-wiki-core/shared/rules");
  const rumdlConfig = await import("agent-wiki-core/shared/rumdl-config");
  const values = await import("agent-wiki-core/shared/values");
  const wikiCommand = await import("agent-wiki-core/shared/wiki-command");

  expect(markdownFiles.isWikiRoot).toBeTypeOf("function");
  expect(markdownSections.parseNote).toBeTypeOf("function");
  expect(noteHashes.sha256Bytes).toBeTypeOf("function");
  expect(programPath.programPath).toBeTypeOf("function");
  expect(rules.canonicalRouteNames).toBeDefined();
  expect(rumdlConfig.parseRumdlExcludeGlobs).toBeTypeOf("function");
  expect(values.isoDate).toBeTypeOf("function");
  expect(wikiCommand.wikiReadCommand).toBeTypeOf("function");
});
