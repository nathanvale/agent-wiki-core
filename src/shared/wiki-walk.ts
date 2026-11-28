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
  readonly folders?: readonly string[];
  readonly isExcluded?: (wikiRelativePath: string) => boolean;
  readonly includeEntry?: (name: string, wikiRelativePath: string) => boolean;
  readonly handleDirectory?: (
    name: string,
    wikiRelativePath: string,
  ) => "traverse" | "stop";
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
  readonly includeEntry: (name: string, wikiRelativePath: string) => boolean;
  readonly handleDirectory: (
    name: string,
    wikiRelativePath: string,
  ) => "traverse" | "stop";
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
    if (walk.handleDirectory(name, wikiRelativePath) === "stop") return null;
    return walkDirectory(walk, fullPath);
  }
  if (info.isFile()) {
    if (
      walk.includeEntry(name, wikiRelativePath) &&
      !walk.isExcluded(wikiRelativePath)
    ) {
      walk.files.push(fullPath);
    }
    return null;
  }
  if (walk.includeEntry(name, wikiRelativePath)) {
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

function resolveStartFolder(
  wikiRoot: string,
  folder: string,
):
  | { readonly kind: "directory"; readonly path: string }
  | { readonly kind: "skip" }
  | WalkFailure {
  const segments = folder
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");
  let current = wikiRoot;
  let relativePath = "";
  for (const segment of segments) {
    current = join(current, segment);
    relativePath = relativePath === "" ? segment : `${relativePath}/${segment}`;
    const info = statIfPresent(() =>
      lstatSync(current, { throwIfNoEntry: false }),
    );
    if (info === undefined) return { kind: "skip" };
    if (info.isSymbolicLink()) {
      return { kind: "linked", linkedPath: `${relativePath}/` };
    }
    if (!info.isDirectory()) return { kind: "skip" };
  }
  return { kind: "directory", path: current };
}

export function walkWikiFiles(
  wikiRoot: string,
  options: WalkWikiFilesOptions = {},
): WalkWikiFilesResult {
  const walk: WalkState = {
    wikiRoot,
    isExcluded: options.isExcluded ?? (() => false),
    includeEntry: options.includeEntry ?? ((name) => isRumdlMarkdownName(name)),
    handleDirectory: options.handleDirectory ?? (() => "traverse"),
    files: [],
  };
  for (const folder of options.folders ?? ownedFolders) {
    const resolved = resolveStartFolder(wikiRoot, folder);
    if (resolved.kind === "skip") continue;
    if (resolved.kind !== "directory") return resolved;
    const failure = walkDirectory(walk, resolved.path);
    if (failure !== null) return failure;
  }
  return { kind: "listed", files: walk.files };
}
