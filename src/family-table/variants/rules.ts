export type VariantHeading = {
  readonly name: string;
  readonly hint?: string;
};

export type Variant = {
  readonly name: string;
  readonly headings: readonly VariantHeading[];
};

type Check<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly detail: string };

export type VariantCheckHelpers = {
  readonly toRecord: (value: unknown) => Record<string, unknown> | null;
  readonly checkAllowedKeys: (
    record: Record<string, unknown>,
    allowed: ReadonlySet<string>,
    prefix: string,
  ) => string | null;
  readonly nonBlankString: (value: unknown, key: string) => Check<string>;
  readonly checkList: <T>(
    value: unknown,
    key: string,
    checkItem: (item: unknown, itemKey: string) => Check<T>,
  ) => Check<readonly T[]>;
};

const variantKeys = new Set(["name", "headings"]);
const variantHeadingKeys = new Set(["name", "hint"]);
const variantNamePattern = /^[a-z][a-z0-9-]*$/;

function checkVariantHeading(
  value: unknown,
  prefix: string,
  helpers: VariantCheckHelpers,
): Check<VariantHeading> {
  const record = helpers.toRecord(value);
  if (record === null) {
    return { ok: false, detail: `Key "${prefix}" must be an object.` };
  }
  const unknown = helpers.checkAllowedKeys(record, variantHeadingKeys, prefix);
  if (unknown !== null) return { ok: false, detail: unknown };
  const name = helpers.nonBlankString(record["name"], `${prefix}.name`);
  if (!name.ok) return name;
  const hint = record["hint"];
  if (hint === undefined) return { ok: true, value: { name: name.value } };
  if (typeof hint !== "string") {
    return {
      ok: false,
      detail: `Key "${prefix}.hint" must be a string when present.`,
    };
  }
  return { ok: true, value: { name: name.value, hint } };
}

function checkVariant(
  value: unknown,
  prefix: string,
  helpers: VariantCheckHelpers,
): Check<Variant> {
  const record = helpers.toRecord(value);
  if (record === null) {
    return { ok: false, detail: `Key "${prefix}" must be an object.` };
  }
  const unknown = helpers.checkAllowedKeys(record, variantKeys, prefix);
  if (unknown !== null) return { ok: false, detail: unknown };
  const rawName = record["name"];
  if (typeof rawName !== "string" || !variantNamePattern.test(rawName)) {
    return {
      ok: false,
      detail: `Key "${prefix}.name" (${String(rawName)}) must match ^[a-z][a-z0-9-]*$.`,
    };
  }
  const headings = helpers.checkList(
    record["headings"],
    `${prefix}.headings`,
    (item, itemKey) => checkVariantHeading(item, itemKey, helpers),
  );
  if (!headings.ok) return headings;
  return { ok: true, value: { name: rawName, headings: headings.value } };
}

export function checkAfterVariants(
  value: unknown,
  prefix: string,
): Check<boolean | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "boolean") {
    return {
      ok: false,
      detail: `Key "${prefix}.afterVariants" must be a boolean when present.`,
    };
  }
  return { ok: true, value };
}

export function checkVariants(
  value: unknown,
  prefix: string,
  helpers: VariantCheckHelpers,
): Check<readonly Variant[] | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  const checked = helpers.checkList(value, prefix, (item, itemKey) =>
    checkVariant(item, itemKey, helpers),
  );
  if (!checked.ok) return checked;
  if (checked.value.length === 0) {
    return {
      ok: false,
      detail: `Key "${prefix}" must be a non-empty array when present.`,
    };
  }
  const seen = new Set<string>();
  for (let index = 0; index < checked.value.length; index += 1) {
    const variant = checked.value[index];
    if (variant === undefined) continue;
    if (seen.has(variant.name)) {
      return {
        ok: false,
        detail: `Key "${prefix}[${String(index)}].name" duplicates variant "${variant.name}".`,
      };
    }
    seen.add(variant.name);
  }
  return checked;
}

export function checkFamilyVariantRules(
  prefix: string,
  familyFields: readonly { readonly name: string }[],
  headings: readonly { readonly afterVariants?: boolean }[],
  variants: readonly Variant[] | undefined,
): string | null {
  if (variants === undefined) {
    for (let index = 0; index < headings.length; index += 1) {
      if (headings[index]?.afterVariants !== undefined) {
        return `Key "${prefix}.headings[${String(index)}].afterVariants" is only allowed on a family that declares variants.`;
      }
    }
    return null;
  }
  for (let index = 0; index < familyFields.length; index += 1) {
    if (familyFields[index]?.name === "variant") {
      return `Key "${prefix}.familyFields[${String(index)}].name" cannot be "variant" on a family that declares variants.`;
    }
  }
  return null;
}
