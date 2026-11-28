import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { folderOf, parseNote } from "./markdown-sections.ts";
import type { MarkdownFile, Note } from "./markdown-sections.ts";
import { sha256Bytes, stagePathForMove } from "./note-hashes.ts";
import type { MoveSnapshot } from "./note-hashes.ts";
import {
  errorCode,
  errorReason,
  isRumdlMarkdownName,
  nativeRumdlPackageNames,
  parseRumdlExcludeGlobs,
} from "./rumdl-config.ts";
import type { ExcludeGlobsResult, OwnedFiles } from "./rumdl-config.ts";
import {
  readRootedBytesOptional,
  readRootedTextOptional,
  readRootedTextRequired,
  walkWikiOrThrow,
} from "./wiki-read.ts";
import { ownedFolders, statIfPresent, walkWikiFiles } from "./wiki-walk.ts";

export type RenameInputs = {
  readonly markdownFiles: readonly MarkdownFile[];
  readonly texts: ReadonlyMap<string, string>;
  readonly paths: ReadonlySet<string>;
};

export function canonicalWikiRoot(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync.native(absolute);
  } catch {
    return absolute;
  }
}

export function isWikiRoot(wikiRoot: string): boolean {
  return (
    statIfPresent(() =>
      lstatSync(join(wikiRoot, "wiki"), {
        throwIfNoEntry: false,
      }),
    )?.isDirectory() ?? false
  );
}

export function isFile(path: string): boolean {
  return (
    statIfPresent(() => lstatSync(path, { throwIfNoEntry: false }))?.isFile() ??
    false
  );
}

function isExecutableFile(path: string): boolean {
  const info = statIfPresent(() => statSync(path, { throwIfNoEntry: false }));
  if (info === undefined || !info.isFile()) return false;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function excludeGlobsFromConfig(
  configPath: string | undefined,
): ExcludeGlobsResult {
  if (configPath === undefined) return { ok: true, globs: [] };
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return { ok: true, globs: [] };
    return {
      ok: false,
      reason: `Could not read rumdl settings file at ${configPath}: ${errorReason(error)}`,
    };
  }
  return parseRumdlExcludeGlobs(configPath, raw);
}

export function ownedMarkdownFiles(
  wikiRoot: string,
  configPath?: string,
): OwnedFiles {
  const excluded = excludeGlobsFromConfig(configPath);
  if (!excluded.ok) {
    return { kind: "unreadable-settings", reason: excluded.reason };
  }
  return walkWikiFiles(wikiRoot, {
    isExcluded: (wikiRelativePath) =>
      excluded.globs.some((glob) => glob.match(wikiRelativePath)),
  });
}

function nativeRumdlBinary(repoRoot: string): string | null {
  for (const name of nativeRumdlPackageNames()) {
    const candidate = join(repoRoot, "node_modules/@rumdl", name, "rumdl");
    if (isExecutableFile(candidate)) return candidate;
  }
  return null;
}

export function resolvePinnedRumdl(
  repoRoot: string,
  overridePath: string | undefined,
): string | null {
  if (overridePath !== undefined) {
    const resolved = resolve(overridePath);
    return isExecutableFile(resolved) ? resolved : null;
  }
  const native = nativeRumdlBinary(repoRoot);
  if (native !== null) return native;
  const shim = join(repoRoot, "node_modules/.bin/rumdl");
  return isExecutableFile(shim) ? shim : null;
}

function readMarkdownFile(wikiRoot: string, path: string): MarkdownFile {
  return parseNote(path, readRootedTextRequired(wikiRoot, path));
}

export function readFolderNotes(wikiRoot: string, folder: string): Note[] {
  return walkWikiOrThrow(wikiRoot, {
    folders: [folder],
    includeEntry: (name) => name.endsWith(".md"),
  }).map((path) => readMarkdownFile(wikiRoot, path));
}

function wikiNotes(wikiRoot: string): Note[] {
  return walkWikiOrThrow(wikiRoot, {
    folders: ["wiki"],
    includeEntry: (name) => name.endsWith(".md"),
    isExcluded: (path) => path.startsWith("wiki/meta/"),
  }).map((path) => readMarkdownFile(wikiRoot, path));
}

export function readRecords(wikiRoot: string): Note[] {
  return wikiNotes(wikiRoot).filter(
    (note) => folderOf(note.path) !== null || note.family !== null,
  );
}

const configFile = ".claude-obsidian.json";

export function readRenameInputs(wikiRoot: string): RenameInputs {
  const wiki = walkWikiOrThrow(wikiRoot, {
    folders: ["wiki"],
    includeEntry: () => true,
  });
  const templates = walkWikiOrThrow(wikiRoot, {
    folders: ["templates"],
    includeEntry: () => true,
  });
  const manifests = walkWikiOrThrow(wikiRoot, {
    folders: [".raw"],
    includeEntry: (name) => name.endsWith(".manifest.json"),
  });
  const referenced = [
    ...wiki.filter((path) => path.endsWith(".md") || path.endsWith(".json")),
    ...templates,
    ...manifests,
  ];
  const texts = new Map<string, string>(
    referenced.map((path) => [path, readRootedTextRequired(wikiRoot, path)]),
  );
  const configText = readRootedTextOptional(wikiRoot, configFile);
  if (configText !== null) {
    texts.set(configFile, configText);
  }
  const markdownPaths = [
    ...wiki.filter(
      (path) => path.endsWith(".md") && !path.startsWith("wiki/meta/"),
    ),
    ...templates.filter((path) => path.endsWith(".md")),
  ];
  return {
    markdownFiles: markdownPaths.map((path) =>
      parseNote(path, texts.get(path) ?? ""),
    ),
    texts,
    paths: new Set([...wiki, ...templates]),
  };
}

export function readTextIfExists(
  wikiRoot: string,
  relativePath: string,
): string | null {
  return readRootedTextOptional(wikiRoot, relativePath);
}

export function pathExistsInWiki(
  wikiRoot: string,
  relativePath: string,
): boolean {
  return existsSync(join(wikiRoot, relativePath));
}

export function blockingParentPath(
  wikiRoot: string,
  relativePath: string,
): string | null {
  const parts = relativePath.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    const ancestor = parts.slice(0, index).join("/");
    const info = lstatSync(join(wikiRoot, ancestor), {
      throwIfNoEntry: false,
    });
    if (info !== undefined && !info.isDirectory()) return ancestor;
  }
  return null;
}

export function readWikiMarkdownTexts(
  wikiRoot: string,
  excludeFolder: string,
): ReadonlyMap<string, string> {
  const paths = walkWikiOrThrow(wikiRoot, {
    folders: ownedFolders,
    includeEntry: (name) => isRumdlMarkdownName(name),
    isExcluded: (path) => folderOf(path) === excludeFolder,
  });
  return new Map(
    paths.map((path) => [path, readRootedTextRequired(wikiRoot, path)]),
  );
}

const atomicTempSuffix = ".note-name-tmp";

function tempPathFor(destination: string): string {
  return `${destination}${atomicTempSuffix}`;
}

function writeFileAtomicVerified(destination: string, bytes: Buffer): void {
  const temp = tempPathFor(destination);
  writeFileSync(temp, bytes);
  if (!readFileSync(temp).equals(bytes)) {
    rmSync(temp, { force: true });
    throw new Error(`Temporary read-back mismatch for ${destination}.`);
  }
  renameSync(temp, destination);
  if (!readFileSync(destination).equals(bytes)) {
    throw new Error(`Destination read-back mismatch for ${destination}.`);
  }
}

export function readBytesInWiki(
  wikiRoot: string,
  relativePath: string,
): Buffer {
  const bytes = readRootedBytesOptional(wikiRoot, relativePath);
  if (bytes === null) {
    throw new Error(`Missing file in wiki: ${relativePath}`);
  }
  return bytes;
}

export function sha256InWiki(
  wikiRoot: string,
  relativePath: string,
): string | null {
  const bytes = readRootedBytesOptional(wikiRoot, relativePath);
  return bytes === null ? null : sha256Bytes(bytes);
}

export function entryExistsInWiki(
  wikiRoot: string,
  relativePath: string,
): boolean {
  return (
    lstatSync(join(wikiRoot, relativePath), { throwIfNoEntry: false }) !==
    undefined
  );
}

export function writeBytesInWiki(
  wikiRoot: string,
  relativePath: string,
  bytes: Buffer,
): void {
  const full = join(wikiRoot, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileAtomicVerified(full, bytes);
}

export function removeInWiki(wikiRoot: string, relativePath: string): void {
  rmSync(join(wikiRoot, relativePath), { recursive: true, force: true });
}

export function applyMovesOnDisk(
  wikiRoot: string,
  moves: readonly { readonly from: string; readonly to: string }[],
): readonly MoveSnapshot[] {
  for (const move of moves) {
    mkdirSync(dirname(join(wikiRoot, move.to)), { recursive: true });
  }
  const targets = new Set(moves.map((move) => move.to));
  const entries = moves.map((move) => {
    const stage = stagePathForMove(move.from, move.to);
    const bytes = readFileSync(join(wikiRoot, move.from));
    return { from: move.from, to: move.to, stage, bytes };
  });
  for (const entry of entries) {
    renameSync(join(wikiRoot, entry.from), join(wikiRoot, entry.stage));
  }
  for (const entry of entries) {
    renameSync(join(wikiRoot, entry.stage), join(wikiRoot, entry.to));
    rmSync(tempPathFor(join(wikiRoot, entry.to)), { force: true });
  }
  for (const entry of entries) {
    if (!targets.has(entry.from)) {
      rmSync(tempPathFor(join(wikiRoot, entry.from)), { force: true });
    }
  }
  return entries.map(({ from, to, bytes }) => ({ from, to, bytes }));
}

export function verifyMovesOnDisk(
  wikiRoot: string,
  snapshots: readonly MoveSnapshot[],
): boolean {
  const targets = new Set(snapshots.map((snapshot) => snapshot.to));
  for (const snapshot of snapshots) {
    const destination = join(wikiRoot, snapshot.to);
    if (!existsSync(destination)) return false;
    if (!readFileSync(destination).equals(snapshot.bytes)) return false;
    const stage = stagePathForMove(snapshot.from, snapshot.to);
    if (existsSync(join(wikiRoot, stage))) return false;
    if (
      !targets.has(snapshot.from) &&
      existsSync(join(wikiRoot, snapshot.from))
    ) {
      return false;
    }
  }
  return true;
}

export function applyTextUpdatesOnDisk(
  wikiRoot: string,
  updates: ReadonlyMap<string, string>,
): void {
  for (const [relativePath, content] of updates) {
    const full = join(wikiRoot, relativePath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileAtomicVerified(full, Buffer.from(content, "utf8"));
  }
}

export function verifyTextUpdatesOnDisk(
  wikiRoot: string,
  updates: ReadonlyMap<string, string>,
): boolean {
  for (const [relativePath, content] of updates) {
    const full = join(wikiRoot, relativePath);
    if (!existsSync(full)) return false;
    if (readFileSync(full, "utf8") !== content) return false;
  }
  return true;
}
