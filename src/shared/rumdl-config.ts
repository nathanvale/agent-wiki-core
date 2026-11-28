import { extname } from "node:path";
import { fieldsOf, texts } from "./values.ts";

const rumdlFolderScanExtensions: ReadonlySet<string> = new Set([
  ".md",
  ".markdown",
  ".mdx",
  ".mkd",
  ".mkdn",
  ".mdown",
  ".mdwn",
  ".qmd",
  ".rmd",
]);

export type SpecialFileKind = "pipe" | "socket" | "device" | "non-regular file";

export type WalkFailure =
  | { readonly kind: "linked"; readonly linkedPath: string }
  | {
      readonly kind: "special-file";
      readonly path: string;
      readonly entryKind: SpecialFileKind;
    };

export type WalkWikiFilesResult =
  | { readonly kind: "listed"; readonly files: readonly string[] }
  | WalkFailure;

export type OwnedFiles =
  | WalkWikiFilesResult
  | { readonly kind: "unreadable-settings"; readonly reason: string };

export type ExcludeGlobsResult =
  | { readonly ok: true; readonly globs: readonly Bun.Glob[] }
  | { readonly ok: false; readonly reason: string };

export function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (!Object.hasOwn(error, "code")) return undefined;
  const code: unknown = Reflect.get(error, "code");
  return typeof code === "string" ? code : undefined;
}

export function errorReason(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message.trim();
  }
  return String(error);
}

export function parseRumdlExcludeGlobs(
  configPath: string,
  raw: string,
): ExcludeGlobsResult {
  try {
    const parsedConfig = fieldsOf(Bun.TOML.parse(raw));
    const globalSection = fieldsOf(parsedConfig?.["global"]);
    return {
      ok: true,
      globs: texts(globalSection?.["exclude"]).map(
        (pattern) => new Bun.Glob(pattern),
      ),
    };
  } catch (error) {
    return {
      ok: false,
      reason: `Could not parse rumdl settings file at ${configPath}: ${errorReason(error)}`,
    };
  }
}

export function isRumdlMarkdownName(name: string): boolean {
  return rumdlFolderScanExtensions.has(extname(name).toLowerCase());
}

const nativeRumdlPackages: Readonly<Record<string, readonly string[]>> = {
  "darwin-arm64": ["cli-darwin-arm64"],
  "darwin-x64": ["cli-darwin-x64"],
  "linux-x64": ["cli-linux-x64", "cli-linux-x64-musl"],
  "linux-arm64": ["cli-linux-arm64", "cli-linux-arm64-musl"],
};

export function nativeRumdlPackageNames(): readonly string[] {
  const key = `${process.platform}-${process.arch}`;
  return Object.hasOwn(nativeRumdlPackages, key)
    ? (nativeRumdlPackages[key] ?? [])
    : [];
}
