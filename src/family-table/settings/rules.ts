const familyHeaderChoices = ["required", "from-folder"] as const;
const undeclaredFoldersChoices = ["finding", "family-free"] as const;
const noteNamesChoices = ["title", "dated-title", "any"] as const;

export type FamilyHeaderSetting = (typeof familyHeaderChoices)[number];
export type UndeclaredFoldersSetting =
  (typeof undeclaredFoldersChoices)[number];
export type NoteNamesSetting = (typeof noteNamesChoices)[number];

export type Check<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly detail: string };

type CheckedValue<T> = T extends {
  readonly ok: true;
  readonly value: infer Value;
}
  ? Value
  : never;

function checkChoice<const T extends string>(
  value: unknown,
  key: string,
  allowed: readonly T[],
): Check<T> {
  for (const choice of allowed) {
    if (value === choice) return { ok: true, value: choice };
  }
  const labels = allowed.map((choice) => `"${choice}"`).join(", ");
  return { ok: false, detail: `Key "${key}" must be one of ${labels}.` };
}

function checkChoiceWithDefault<const T extends string>(
  value: unknown,
  key: string,
  allowed: readonly T[],
  fallback: T,
): Check<T> {
  return value === undefined
    ? { ok: true, value: fallback }
    : checkChoice(value, key, allowed);
}

function checkBoolean(
  value: unknown,
  key: string,
  fallback: boolean,
): Check<boolean> {
  if (value === undefined) return { ok: true, value: fallback };
  if (typeof value !== "boolean") {
    return { ok: false, detail: `Key "${key}" must be a boolean.` };
  }
  return { ok: true, value };
}

const tableSettingChecks = {
  familyHeader: (value: unknown) =>
    checkChoiceWithDefault(
      value,
      "familyHeader",
      familyHeaderChoices,
      "required",
    ),
  undeclaredFolders: (value: unknown) =>
    checkChoiceWithDefault(
      value,
      "undeclaredFolders",
      undeclaredFoldersChoices,
      "finding",
    ),
  summaryRequired: (value: unknown) =>
    checkBoolean(value, "summaryRequired", true),
  createdRequired: (value: unknown) =>
    checkBoolean(value, "createdRequired", true),
  noteNames: (value: unknown) =>
    checkChoiceWithDefault(value, "noteNames", noteNamesChoices, "title"),
  uniqueNoteNames: (value: unknown) =>
    checkBoolean(value, "uniqueNoteNames", true),
} as const;

export type TableSettings = {
  readonly [Key in keyof typeof tableSettingChecks]: CheckedValue<
    ReturnType<(typeof tableSettingChecks)[Key]>
  >;
};

export const tableSettingKeys: readonly string[] =
  Object.keys(tableSettingChecks);

export function checkNoteNames(
  value: unknown,
  key: string,
): Check<NoteNamesSetting> {
  return checkChoice(value, key, noteNamesChoices);
}

export function checkTableSettings(
  record: Record<string, unknown>,
): Check<TableSettings> {
  const familyHeader = tableSettingChecks.familyHeader(record["familyHeader"]);
  if (!familyHeader.ok) return familyHeader;
  const undeclaredFolders = tableSettingChecks.undeclaredFolders(
    record["undeclaredFolders"],
  );
  if (!undeclaredFolders.ok) return undeclaredFolders;
  const summaryRequired = tableSettingChecks.summaryRequired(
    record["summaryRequired"],
  );
  if (!summaryRequired.ok) return summaryRequired;
  const createdRequired = tableSettingChecks.createdRequired(
    record["createdRequired"],
  );
  if (!createdRequired.ok) return createdRequired;
  const noteNames = tableSettingChecks.noteNames(record["noteNames"]);
  if (!noteNames.ok) return noteNames;
  const uniqueNoteNames = tableSettingChecks.uniqueNoteNames(
    record["uniqueNoteNames"],
  );
  if (!uniqueNoteNames.ok) return uniqueNoteNames;
  return {
    ok: true,
    value: {
      familyHeader: familyHeader.value,
      undeclaredFolders: undeclaredFolders.value,
      summaryRequired: summaryRequired.value,
      createdRequired: createdRequired.value,
      noteNames: noteNames.value,
      uniqueNoteNames: uniqueNoteNames.value,
    },
  };
}
