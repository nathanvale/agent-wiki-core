import { join } from "node:path";
import { familyTableFrom } from "../family-table/rules.ts";
import type { FamilyTable } from "../family-table/rules.ts";
import { errorReason } from "./rumdl-config.ts";
import { readRootedTextOptional } from "./wiki-read.ts";

const familyTableFileName = "family-table.json";

export function readFamilyTable(
  wikiRoot: string,
):
  | { readonly ok: true; readonly table: FamilyTable }
  | { readonly ok: false; readonly path: string; readonly detail: string } {
  const path = join(wikiRoot, familyTableFileName);
  const raw = readRootedTextOptional(wikiRoot, familyTableFileName);
  if (raw === null) {
    return { ok: false, path, detail: "File does not exist." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      path,
      detail: `Invalid JSON: ${errorReason(error)}`,
    };
  }
  const validated = familyTableFrom(parsed);
  if (!validated.ok) {
    return { ok: false, path, detail: validated.detail };
  }
  return { ok: true, table: validated.table };
}
