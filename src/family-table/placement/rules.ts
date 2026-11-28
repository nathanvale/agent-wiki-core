import { folderOf } from "../../shared/rules.ts";
import type { Note } from "../../shared/rules.ts";

type PlacementFamily = {
  readonly family: string;
  readonly folder: string;
};

type PlacementTable<F extends PlacementFamily> = {
  readonly unfiledFolder: string | null;
  readonly familyFreeFolders: readonly string[];
  readonly reservedFamilies: Readonly<Record<string, string>>;
  readonly families: readonly F[];
};

type NotePlacement<F extends PlacementFamily> =
  | {
      readonly kind: "unfiled";
      readonly folder: string;
      readonly expectedFamily: null;
      readonly effectiveFamily: null;
    }
  | {
      readonly kind: "family-folder";
      readonly folder: string;
      readonly expectedFamily: string;
      readonly effectiveFamily: F | null;
    }
  | {
      readonly kind: "family-free";
      readonly folder: string;
      readonly expectedFamily: null;
      readonly effectiveFamily: F | null;
    }
  | {
      readonly kind: "wiki-folder";
      readonly folder: null;
      readonly expectedFamily: null;
      readonly effectiveFamily: F | null;
    }
  | {
      readonly kind: "unknown-folder";
      readonly folder: string;
      readonly expectedFamily: null;
      readonly effectiveFamily: F | null;
    };

function definedFamily<F extends PlacementFamily>(
  familyName: string | null,
  table: PlacementTable<F>,
): F | null {
  if (familyName === null) return null;
  return table.families.find((entry) => entry.family === familyName) ?? null;
}

export function placementOf<F extends PlacementFamily>(
  note: Pick<Note, "path" | "family">,
  table: PlacementTable<F>,
): NotePlacement<F> {
  const folder = folderOf(note.path);
  if (table.unfiledFolder !== null && folder === table.unfiledFolder) {
    return {
      kind: "unfiled",
      folder,
      expectedFamily: null,
      effectiveFamily: null,
    };
  }
  const noteFamily = definedFamily(note.family, table);
  if (folder === null) {
    return {
      kind: "wiki-folder",
      folder: null,
      expectedFamily: null,
      effectiveFamily: noteFamily,
    };
  }
  const folderFamily =
    table.families.find((entry) => entry.folder === folder) ?? null;
  if (folderFamily !== null) {
    return {
      kind: "family-folder",
      folder,
      expectedFamily: folderFamily.family,
      effectiveFamily: noteFamily ?? folderFamily,
    };
  }
  if (Object.hasOwn(table.reservedFamilies, folder)) {
    const reserved = table.reservedFamilies[folder];
    if (reserved !== undefined) {
      return {
        kind: "family-folder",
        folder,
        expectedFamily: reserved,
        effectiveFamily: noteFamily ?? definedFamily(reserved, table),
      };
    }
  }
  if (table.familyFreeFolders.includes(folder)) {
    return {
      kind: "family-free",
      folder,
      expectedFamily: null,
      effectiveFamily: noteFamily,
    };
  }
  return {
    kind: "unknown-folder",
    folder,
    expectedFamily: null,
    effectiveFamily: noteFamily,
  };
}
