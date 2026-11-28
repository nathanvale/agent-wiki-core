import { lstatSync, readdirSync } from "node:fs";
import type { Stats } from "node:fs";
import { join, relative } from "node:path";
import { errorCode, isRumdlMarkdownName } from "./rumdl-config.ts";
import type {
  SpecialFileKind,
  WalkFailure,
  WalkWikiFilesResult,
} from "./rumdl-config.ts";

export type { WalkWikiFilesResult };

export const ownedFolders = ["wiki", "templates"] as const;

export type WalkWikiFilesOptions = {
  readonly isExcluded?: (wikiRelativePath: string) => boolean;
};

export function statIfPresent(
  read: () => Stats | undefined,
): Stats | undefined {
  try {
    return read();
  } catch (error) {
    if (errorCode(error) === "ENOTDIR") return undefined;
    throw error;
  }
}

export function wikiRootRefusal(wikiRoot: string): string | null {
  const wikiInfo = statIfPresent(() =>
    lstatSync(join(wikiRoot, "wiki"), { throwIfNoEntry: false }),
  );
  if (wikiInfo?.isSymbolicLink()) {
    return "wiki/ is a symbolic link; a wiki root needs a real folder. Repair: Replace wiki/ with a real folder.";
  }
  if (wikiInfo === undefined || !wikiInfo.isDirectory()) {
    return "That path is not a wiki root: it has no wiki/ folder inside it.";
  }
  const templatesInfo = statIfPresent(() =>
    lstatSync(join(wikiRoot, "templates"), { throwIfNoEntry: false }),
  );
  if (templatesInfo?.isSymbolicLink()) {
    return "templates/ is a symbolic link; a wiki root needs a real folder. Repair: Replace templates/ with a real folder.";
  }
  return null;
}

function specialFileKind(info: Stats): SpecialFileKind {
  if (info.isFIFO()) return "pipe";
  if (info.isSocket()) return "socket";
  if (info.isBlockDevice() || info.isCharacterDevice()) return "device";
  return "non-regular file";
}

type WalkState = {
  readonly wikiRoot: string;
  readonly isExcluded: (wikiRelativePath: string) => boolean;
  readonly files: string[];
};

function classifyEntry(
  walk: WalkState,
  folder: string,
  name: string,
): WalkFailure | null {
  const fullPath = join(folder, name);
  const info = statIfPresent(() =>
    lstatSync(fullPath, { throwIfNoEntry: false }),
  );
  if (info === undefined) return null;
  const wikiRelativePath = relative(walk.wikiRoot, fullPath).replaceAll(
    "\\",
    "/",
  );
  if (info.isSymbolicLink()) {
    return { kind: "linked", linkedPath: wikiRelativePath };
  }
  if (info.isDirectory()) {
    return walkDirectory(walk, fullPath);
  }
  if (info.isFile()) {
    if (isRumdlMarkdownName(name) && !walk.isExcluded(wikiRelativePath)) {
      walk.files.push(fullPath);
    }
    return null;
  }
  if (isRumdlMarkdownName(name)) {
    return {
      kind: "special-file",
      path: wikiRelativePath,
      entryKind: specialFileKind(info),
    };
  }
  return null;
}

function walkDirectory(walk: WalkState, folder: string): WalkFailure | null {
  const names = readdirSync(folder).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  for (const name of names) {
    const failure = classifyEntry(walk, folder, name);
    if (failure !== null) return failure;
  }
  return null;
}

export function walkWikiFiles(
  wikiRoot: string,
  options: WalkWikiFilesOptions = {},
): WalkWikiFilesResult {
  const walk: WalkState = {
    wikiRoot,
    isExcluded: options.isExcluded ?? (() => false),
    files: [],
  };
  for (const folder of ownedFolders) {
    const path = join(wikiRoot, folder);
    const info = statIfPresent(() =>
      lstatSync(path, { throwIfNoEntry: false }),
    );
    if (info === undefined) continue;
    if (info.isSymbolicLink()) {
      return { kind: "linked", linkedPath: `${folder}/` };
    }
    if (!info.isDirectory()) continue;
    const failure = walkDirectory(walk, path);
    if (failure !== null) return failure;
  }
  return { kind: "listed", files: walk.files };
}
