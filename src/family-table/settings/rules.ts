export type FamilyHeaderSetting = "required" | "from-folder";
export type UndeclaredFoldersSetting = "finding" | "family-free";
export type NoteNamesSetting = "title" | "dated-title" | "any";

export type TableSettings = {
  readonly familyHeader: FamilyHeaderSetting;
  readonly undeclaredFolders: UndeclaredFoldersSetting;
  readonly summaryRequired: boolean;
  readonly createdRequired: boolean;
  readonly noteNames: NoteNamesSetting;
  readonly uniqueNoteNames: boolean;
};

export type Check<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly detail: string };

export const tableSettingKeys: readonly (keyof TableSettings)[] = [
  "familyHeader",
  "undeclaredFolders",
  "summaryRequired",
  "createdRequired",
  "noteNames",
  "uniqueNoteNames",
];

const familyHeaderChoices: readonly FamilyHeaderSetting[] = [
  "required",
  "from-folder",
];

const undeclaredFoldersChoices: readonly UndeclaredFoldersSetting[] = [
  "finding",
  "family-free",
];

const noteNamesChoices: readonly NoteNamesSetting[] = [
  "title",
  "dated-title",
  "any",
];

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

export function checkNoteNames(
  value: unknown,
  key: string,
): Check<NoteNamesSetting> {
  return checkChoice(value, key, noteNamesChoices);
}

export function checkTableSettings(
  record: Record<string, unknown>,
): Check<TableSettings> {
  const familyHeader = checkChoiceWithDefault(
    record["familyHeader"],
    "familyHeader",
    familyHeaderChoices,
    "required",
  );
  if (!familyHeader.ok) return familyHeader;
  const undeclaredFolders = checkChoiceWithDefault(
    record["undeclaredFolders"],
    "undeclaredFolders",
    undeclaredFoldersChoices,
    "finding",
  );
  if (!undeclaredFolders.ok) return undeclaredFolders;
  const summaryRequired = checkBoolean(
    record["summaryRequired"],
    "summaryRequired",
    true,
  );
  if (!summaryRequired.ok) return summaryRequired;
  const createdRequired = checkBoolean(
    record["createdRequired"],
    "createdRequired",
    true,
  );
  if (!createdRequired.ok) return createdRequired;
  const noteNames = checkChoiceWithDefault(
    record["noteNames"],
    "noteNames",
    noteNamesChoices,
    "title",
  );
  if (!noteNames.ok) return noteNames;
  const uniqueNoteNames = checkBoolean(
    record["uniqueNoteNames"],
    "uniqueNoteNames",
    true,
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
