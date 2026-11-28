import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readFamilyTable } from "../shared/family-table.ts";
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

function walkTemplates(
  directory: string,
  prefix: string,
): InstalledFamilyTemplate[] {
  const items = readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  const results: InstalledFamilyTemplate[] = [];
  for (const item of items) {
    if (item.isSymbolicLink()) continue;
    const fullPath = join(directory, item.name);
    const relativePath = `${prefix}/${item.name}`;
    if (item.isDirectory()) {
      if (item.name.endsWith(".md")) {
        results.push({ path: relativePath, text: null });
      } else {
        results.push(...walkTemplates(fullPath, relativePath));
      }
    } else if (item.isFile() && item.name.endsWith(".md")) {
      results.push({
        path: relativePath,
        text: readFileSync(fullPath, "utf8"),
      });
    }
  }
  return results;
}

export function readInstalledFamilyTemplates(
  wikiRoot: string,
): InstalledFamilyTemplate[] {
  const folder = join(wikiRoot, "templates");
  const info = lstatSync(folder, { throwIfNoEntry: false });
  if (info === undefined || !info.isDirectory()) return [];
  return walkTemplates(folder, "templates");
}
