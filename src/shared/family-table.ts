import { readFileSync } from "node:fs";
import { join } from "node:path";
import { familyTableFrom } from "../family-table/rules.ts";
import type { FamilyTable } from "../family-table/rules.ts";
import { errorCode, errorReason } from "./rumdl-config.ts";

const familyTableFileName = "family-table.json";

export function readFamilyTable(
  wikiRoot: string,
):
  | { readonly ok: true; readonly table: FamilyTable }
  | { readonly ok: false; readonly path: string; readonly detail: string } {
  const path = join(wikiRoot, familyTableFileName);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    const detail =
      errorCode(error) === "ENOENT"
        ? "File does not exist."
        : `Could not read file: ${errorReason(error)}`;
    return { ok: false, path, detail };
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
