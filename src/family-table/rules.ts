import type { baseFields } from "../shared/rules.ts";
import {
  checkAfterVariants,
  checkFamilyVariantRules,
  checkVariants,
} from "./variants/rules.ts";
import type { Variant, VariantHeading } from "./variants/rules.ts";

export { placementOf } from "./placement/rules.ts";
export type { Variant, VariantHeading };

export type FamilyField = {
  readonly name: string;
  readonly value: string;
};

export type Heading = {
  readonly name: string;
  readonly hint?: string;
  readonly optional: boolean;
  readonly afterVariants?: boolean;
};

export type Rename = {
  readonly kind: "family" | "folder" | "heading";
  readonly from: string;
  readonly to: string;
};

export type Family = {
  readonly family: string;
  readonly folder: string;
  readonly familyFields: readonly FamilyField[];
  readonly headings: readonly Heading[];
  readonly variants?: readonly Variant[];
};

export type FamilyTable = {
  readonly baseTag: string | null;
  readonly discoveryTags: readonly string[] | null;
  readonly tagLimit: number | null;
  readonly summaryMaxLength: number | null;
  readonly unfiledFolder: string | null;
  readonly familyFreeFolders: readonly string[];
  readonly reservedFamilies: Readonly<Record<string, string>>;
  readonly renames: readonly Rename[];
  readonly families: readonly Family[];
};

type Check<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly detail: string };

const tableKeys = new Set([
  "baseTag",
  "discoveryTags",
  "tagLimit",
  "summaryMaxLength",
  "unfiledFolder",
  "familyFreeFolders",
  "reservedFamilies",
  "renames",
  "families",
]);

const familyKeys = new Set([
  "family",
  "folder",
  "familyFields",
  "headings",
  "variants",
]);
const familyFieldKeys = new Set(["name", "value"]);
const headingKeys = new Set(["name", "hint", "optional", "afterVariants"]);
const renameKeys = new Set(["kind", "from", "to"]);

export const alwaysRenderedFields = [
  "family",
  "title",
  "summary",
  "created",
  "tags",
] as const satisfies readonly (keyof typeof baseFields)[];

const alwaysRenderedFieldSet: ReadonlySet<string> = new Set(
  alwaysRenderedFields,
);

const familyFieldNamePattern = /^[a-z][a-z0-9_]*$/;

const defaultTagLimit = 2;
const defaultSummaryMaxLength = 200;
const defaultUnfiledFolder = "wiki/inbox/";

function ok<T>(value: T): Check<T> {
  return { ok: true, value };
}

function fail<T>(detail: string): Check<T> {
  return { ok: false, detail };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  const isMap =
    typeof value === "object" && value !== null && !Array.isArray(value);
  return isMap ? Object.fromEntries(Object.entries(value)) : null;
}

function checkAllowedKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  prefix: string,
): string | null {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      const qualified = prefix === "" ? key : `${prefix}.${key}`;
      return `Unknown key "${qualified}".`;
    }
  }
  return null;
}

function nonBlankString(value: unknown, key: string): Check<string> {
  if (typeof value !== "string" || value.trim() === "") {
    return fail(`Key "${key}" must be a non-empty string.`);
  }
  return ok(value);
}

function nullableString(
  value: unknown,
  key: string,
  fallback: string | null,
): Check<string | null> {
  if (value === undefined) return ok(fallback);
  if (value === null) return ok(null);
  return nonBlankString(value, key);
}

function nullableInteger(
  value: unknown,
  key: string,
  minimum: number,
  fallback: number,
): Check<number | null> {
  if (value === undefined) return ok(fallback);
  if (value === null) return ok(null);
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum
  ) {
    return fail(
      `Key "${key}" must be an integer >= ${String(minimum)} or null.`,
    );
  }
  return ok(value);
}

function checkList<T>(
  value: unknown,
  key: string,
  checkItem: (item: unknown, itemKey: string) => Check<T>,
  notArrayDetail = `Key "${key}" must be an array.`,
): Check<readonly T[]> {
  if (!Array.isArray(value)) return fail(notArrayDetail);
  const items: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = checkItem(value[index], `${key}[${String(index)}]`);
    if (!item.ok) return item;
    items.push(item.value);
  }
  return ok(items);
}

function stringList(value: unknown, key: string): Check<readonly string[]> {
  return checkList(
    value,
    key,
    nonBlankString,
    `Key "${key}" must be an array of strings.`,
  );
}

function nullableStringList(
  value: unknown,
  key: string,
): Check<readonly string[] | null> {
  if (value === undefined || value === null) return ok(null);
  return stringList(value, key);
}

function checkReservedFamilies(
  value: unknown,
): Check<Readonly<Record<string, string>>> {
  if (value === undefined) return ok({});
  const record = toRecord(value);
  if (record === null) {
    return fail('Key "reservedFamilies" must be an object.');
  }
  const result: Record<string, string> = {};
  for (const [folder, familyName] of Object.entries(record)) {
    if (folder.trim() === "") {
      return fail('Key "reservedFamilies" cannot contain an empty folder key.');
    }
    const checked = nonBlankString(familyName, `reservedFamilies.${folder}`);
    if (!checked.ok) return checked;
    result[folder] = checked.value;
  }
  return ok(result);
}

function checkRenameKind(
  value: unknown,
  key: string,
): Check<"family" | "folder" | "heading"> {
  if (value === "family" || value === "folder" || value === "heading") {
    return ok(value);
  }
  return fail(`Key "${key}" must be "family", "folder", or "heading".`);
}

function checkRename(value: unknown, prefix: string): Check<Rename> {
  const record = toRecord(value);
  if (record === null) return fail(`Key "${prefix}" must be an object.`);
  const unknown = checkAllowedKeys(record, renameKeys, prefix);
  if (unknown !== null) return fail(unknown);
  const kind = checkRenameKind(record["kind"], `${prefix}.kind`);
  if (!kind.ok) return kind;
  const from = nonBlankString(record["from"], `${prefix}.from`);
  if (!from.ok) return from;
  const to = nonBlankString(record["to"], `${prefix}.to`);
  if (!to.ok) return to;
  return ok({ kind: kind.value, from: from.value, to: to.value });
}

function checkRenames(value: unknown): Check<readonly Rename[]> {
  if (value === undefined) return ok([]);
  return checkList(value, "renames", checkRename);
}

function checkFamilyField(value: unknown, prefix: string): Check<FamilyField> {
  const record = toRecord(value);
  if (record === null) return fail(`Key "${prefix}" must be an object.`);
  const unknown = checkAllowedKeys(record, familyFieldKeys, prefix);
  if (unknown !== null) return fail(unknown);
  const rawName = record["name"];
  if (typeof rawName !== "string" || !familyFieldNamePattern.test(rawName)) {
    return fail(
      `Key "${prefix}.name" (${String(rawName)}) must match ^[a-z][a-z0-9_]*$.`,
    );
  }
  if (alwaysRenderedFieldSet.has(rawName)) {
    return fail(
      `Key "${prefix}.name" cannot be "${rawName}", which is an always-rendered base field.`,
    );
  }
  const rawValue = record["value"];
  if (
    typeof rawValue !== "string" ||
    rawValue.includes("\n") ||
    rawValue.includes("\r")
  ) {
    return fail(`Key "${prefix}.value" must be a single-line YAML string.`);
  }
  return ok({ name: rawName, value: rawValue });
}

function checkFamilyFields(
  value: unknown,
  prefix: string,
): Check<readonly FamilyField[]> {
  if (value === undefined) return ok([]);
  return checkList(value, prefix, checkFamilyField);
}

function checkHeading(value: unknown, prefix: string): Check<Heading> {
  const record = toRecord(value);
  if (record === null) return fail(`Key "${prefix}" must be an object.`);
  const unknown = checkAllowedKeys(record, headingKeys, prefix);
  if (unknown !== null) return fail(unknown);
  const name = nonBlankString(record["name"], `${prefix}.name`);
  if (!name.ok) return name;
  const optional = record["optional"];
  if (typeof optional !== "boolean") {
    return fail(`Key "${prefix}.optional" must be a boolean.`);
  }
  const hint = record["hint"];
  if (hint !== undefined && typeof hint !== "string") {
    return fail(`Key "${prefix}.hint" must be a string when present.`);
  }
  const afterVariants = checkAfterVariants(record["afterVariants"], prefix);
  if (!afterVariants.ok) return afterVariants;
  return ok({
    name: name.value,
    ...(hint === undefined ? {} : { hint }),
    optional,
    ...(afterVariants.value === undefined
      ? {}
      : { afterVariants: afterVariants.value }),
  });
}

function checkHeadings(
  value: unknown,
  prefix: string,
): Check<readonly Heading[]> {
  return checkList(value, prefix, checkHeading);
}

const variantHelpers = {
  toRecord,
  checkAllowedKeys,
  nonBlankString,
  checkList,
};

function checkFamily(value: unknown, prefix: string): Check<Family> {
  const record = toRecord(value);
  if (record === null) return fail(`Key "${prefix}" must be an object.`);
  const unknown = checkAllowedKeys(record, familyKeys, prefix);
  if (unknown !== null) return fail(unknown);
  const family = nonBlankString(record["family"], `${prefix}.family`);
  if (!family.ok) return family;
  const folder = nonBlankString(record["folder"], `${prefix}.folder`);
  if (!folder.ok) return folder;
  const familyFields = checkFamilyFields(
    record["familyFields"],
    `${prefix}.familyFields`,
  );
  if (!familyFields.ok) return familyFields;
  const headings = checkHeadings(record["headings"], `${prefix}.headings`);
  if (!headings.ok) return headings;
  const variants = checkVariants(
    record["variants"],
    `${prefix}.variants`,
    variantHelpers,
  );
  if (!variants.ok) return variants;
  const variantRuleFailure = checkFamilyVariantRules(
    prefix,
    familyFields.value,
    headings.value,
    variants.value,
  );
  if (variantRuleFailure !== null) return fail(variantRuleFailure);
  return ok({
    family: family.value,
    folder: folder.value,
    familyFields: familyFields.value,
    headings: headings.value,
    ...(variants.value === undefined ? {} : { variants: variants.value }),
  });
}

function checkFamilies(value: unknown): Check<readonly Family[]> {
  return checkList(
    value,
    "families",
    checkFamily,
    'Key "families" is required and must be an array.',
  );
}

export function familyTableFrom(
  value: unknown,
):
  | { readonly ok: true; readonly table: FamilyTable }
  | { readonly ok: false; readonly detail: string } {
  const record = toRecord(value);
  if (record === null) {
    return { ok: false, detail: "Family table must be a JSON object." };
  }
  const unknown = checkAllowedKeys(record, tableKeys, "");
  if (unknown !== null) return { ok: false, detail: unknown };

  const baseTag = nullableString(record["baseTag"], "baseTag", null);
  if (!baseTag.ok) return baseTag;
  const discoveryTags = nullableStringList(
    record["discoveryTags"],
    "discoveryTags",
  );
  if (!discoveryTags.ok) return discoveryTags;
  const tagLimit = nullableInteger(
    record["tagLimit"],
    "tagLimit",
    0,
    defaultTagLimit,
  );
  if (!tagLimit.ok) return tagLimit;
  const summaryMaxLength = nullableInteger(
    record["summaryMaxLength"],
    "summaryMaxLength",
    1,
    defaultSummaryMaxLength,
  );
  if (!summaryMaxLength.ok) return summaryMaxLength;
  const unfiledFolder = nullableString(
    record["unfiledFolder"],
    "unfiledFolder",
    defaultUnfiledFolder,
  );
  if (!unfiledFolder.ok) return unfiledFolder;
  const familyFreeFolders =
    record["familyFreeFolders"] === undefined
      ? ok<readonly string[]>([])
      : stringList(record["familyFreeFolders"], "familyFreeFolders");
  if (!familyFreeFolders.ok) return familyFreeFolders;
  const reservedFamilies = checkReservedFamilies(record["reservedFamilies"]);
  if (!reservedFamilies.ok) return reservedFamilies;
  const renames = checkRenames(record["renames"]);
  if (!renames.ok) return renames;
  const families = checkFamilies(record["families"]);
  if (!families.ok) return families;

  return {
    ok: true,
    table: {
      baseTag: baseTag.value,
      discoveryTags: discoveryTags.value,
      tagLimit: tagLimit.value,
      summaryMaxLength: summaryMaxLength.value,
      unfiledFolder: unfiledFolder.value,
      familyFreeFolders: familyFreeFolders.value,
      reservedFamilies: reservedFamilies.value,
      renames: renames.value,
      families: families.value,
    },
  };
}
