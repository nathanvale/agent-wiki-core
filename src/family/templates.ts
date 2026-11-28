import { readFamilyTable } from "../shared/family-table.ts";
import {
  readRootedTextRequired,
  walkWikiOrThrow,
} from "../shared/wiki-read.ts";
import { renderFamilyTemplates } from "./rules.ts";
import type { InstalledFamilyTemplate } from "./rules.ts";

export function loadRenderedFamilyTemplates(wikiRoot: string):
  | {
      readonly ok: true;
      readonly familyTemplates: Readonly<Record<string, string>>;
    }
  | { readonly ok: false; readonly message: string } {
  const loaded = readFamilyTable(wikiRoot);
  if (!loaded.ok) {
    return { ok: false, message: `${loaded.path}: ${loaded.detail}` };
  }
  return { ok: true, familyTemplates: renderFamilyTemplates(loaded.table) };
}

export function readInstalledFamilyTemplates(
  wikiRoot: string,
): InstalledFamilyTemplate[] {
  const folderTemplates: InstalledFamilyTemplate[] = [];
  const filePaths = walkWikiOrThrow(wikiRoot, {
    folders: ["templates"],
    includeEntry: (name) => name.endsWith(".md"),
    handleDirectory: (name, wikiRelativePath) => {
      if (!name.endsWith(".md")) return "traverse";
      folderTemplates.push({ path: wikiRelativePath, text: null });
      return "stop";
    },
  });
  const fileTemplates: InstalledFamilyTemplate[] = filePaths.map((path) => ({
    path,
    text: readRootedTextRequired(wikiRoot, path),
  }));
  return [...fileTemplates, ...folderTemplates].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}
