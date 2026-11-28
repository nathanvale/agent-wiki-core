import { lstatSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { readRootedFile } from "agent-cli-kernel/rooted-file";
import type { RootedRefusal } from "agent-cli-kernel/rooted-file";
import { walkWikiFiles } from "./wiki-walk.ts";
import type { WalkWikiFilesOptions } from "./wiki-walk.ts";

export type WikiReadRefusalReason =
  | RootedRefusal["reason"]
  | "not-a-regular-file"
  | "not-utf8";

export class WikiReadRefusal extends Error {
  readonly path: string;
  readonly reason: WikiReadRefusalReason;

  constructor(path: string, reason: WikiReadRefusalReason, message?: string) {
    super(message ?? `${path} cannot be read (${reason}).`);
    this.name = "WikiReadRefusal";
    this.path = path;
    this.reason = reason;
  }
}

const maxWikiReadBytes = 64 * 1024 * 1024;
const strictUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

function hasParentStep(path: string): boolean {
  return path.replaceAll("\\", "/").split("/").includes("..");
}

function readLimitBytes(wikiRoot: string, relativePath: string): number {
  if (hasParentStep(relativePath)) {
    return 0;
  }
  try {
    const info = lstatSync(join(wikiRoot, relativePath), {
      throwIfNoEntry: false,
    });
    if (info === undefined || !info.isFile()) return 0;
    return Math.min(maxWikiReadBytes, info.size + 1);
  } catch {
    return 0;
  }
}

function decodeUtf8Strict(relativePath: string, bytes: Uint8Array): string {
  try {
    return strictUtf8Decoder.decode(bytes);
  } catch {
    throw new WikiReadRefusal(
      relativePath,
      "not-utf8",
      `${relativePath} is not valid UTF-8.`,
    );
  }
}

function readRootedRawBytes(
  wikiRoot: string,
  relativePath: string,
): Uint8Array | null {
  const result = readRootedFile(
    wikiRoot,
    relativePath,
    readLimitBytes(wikiRoot, relativePath),
  );
  if (result.kind === "missing") return null;
  if (result.kind === "refused") {
    throw new WikiReadRefusal(result.path, result.reason, result.message);
  }
  return result.bytes;
}

export function readRootedBytesOptional(
  wikiRoot: string,
  relativePath: string,
): Buffer | null {
  const bytes = readRootedRawBytes(wikiRoot, relativePath);
  return bytes === null ? null : Buffer.from(bytes);
}

export function readRootedTextOptional(
  wikiRoot: string,
  relativePath: string,
): string | null {
  const bytes = readRootedRawBytes(wikiRoot, relativePath);
  return bytes === null ? null : decodeUtf8Strict(relativePath, bytes);
}

export function readRootedTextRequired(
  wikiRoot: string,
  relativePath: string,
): string {
  const text = readRootedTextOptional(wikiRoot, relativePath);
  if (text === null) {
    throw new Error(`Missing file in wiki: ${relativePath}`);
  }
  return text;
}

function normalizeWalkFolder(wikiRoot: string, folder: string): string {
  if (hasParentStep(folder)) {
    throw new WikiReadRefusal(folder, "parent-step");
  }
  if (!isAbsolute(folder)) return folder;
  const rel = relative(resolve(wikiRoot), resolve(folder));
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new WikiReadRefusal(folder, "outside-root");
  }
  return rel;
}

export function walkWikiOrThrow(
  wikiRoot: string,
  options: WalkWikiFilesOptions = {},
): string[] {
  const folders =
    options.folders === undefined
      ? undefined
      : options.folders.map((folder) => normalizeWalkFolder(wikiRoot, folder));
  const walked = walkWikiFiles(wikiRoot, {
    ...options,
    ...(folders === undefined ? {} : { folders }),
  });
  if (walked.kind === "linked") {
    throw new WikiReadRefusal(walked.linkedPath, "symbolic-link");
  }
  if (walked.kind === "special-file") {
    throw new WikiReadRefusal(walked.path, "not-a-regular-file");
  }
  return walked.files.map((fullPath) =>
    relative(wikiRoot, fullPath).replaceAll("\\", "/"),
  );
}
