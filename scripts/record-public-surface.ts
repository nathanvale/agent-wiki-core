import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { noteCheckEnvironmentVariables } from "../src/note/check-environment.ts";
import { baseFields } from "../src/shared/rules.ts";

export type ExportSymbolKind = "type" | "value";

export type PackageExportEntry = {
  readonly subpath: string;
  readonly target: string;
};

export type PublicSurface = {
  readonly discovery: Record<string, unknown>;
  readonly exports: Readonly<
    Record<string, Readonly<Record<string, ExportSymbolKind>>>
  >;
  readonly headerFields: Readonly<Record<string, string>>;
  readonly environmentVariables: readonly string[];
  readonly skills: readonly string[];
};

const cliTimeoutMilliseconds = 10_000;

export function compareCodepoints(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripRunIdentities(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripRunIdentities(item));
  }
  if (!isRecord(value)) return value;
  const cleaned: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (key === "runId") continue;
    cleaned[key] = stripRunIdentities(entryValue);
  }
  return cleaned;
}

function runCliDiscovery(repoRoot: string): Record<string, unknown> {
  const cliPath = join(repoRoot, "src/cli.ts");
  const run = Bun.spawnSync(
    [process.execPath, "run", cliPath, "--discover-all", "--json"],
    {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      timeout: cliTimeoutMilliseconds,
      killSignal: "SIGKILL",
    },
  );
  if (run.exitCode !== 0) {
    throw new Error(
      `CLI discovery exited ${String(run.exitCode)}: ${run.stderr.toString().trim()}`,
    );
  }
  const parsed: unknown = JSON.parse(run.stdout.toString());
  const cleaned = stripRunIdentities(parsed);
  if (!isRecord(cleaned)) {
    throw new Error("CLI discovery output was not a JSON object.");
  }
  return cleaned;
}

export function readPackageExports(repoRoot: string): {
  readonly packageName: string;
  readonly entries: readonly PackageExportEntry[];
} {
  const manifestPath = join(repoRoot, "package.json");
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error("package.json is not a JSON object.");
  }
  const packageName = parsed["name"];
  const rawExports = parsed["exports"];
  if (typeof packageName !== "string" || !isRecord(rawExports)) {
    throw new Error("package.json must declare string name and exports map.");
  }
  const entries = Object.entries(rawExports)
    .map(([subpath, target]): PackageExportEntry => {
      if (typeof target !== "string") {
        throw new Error(
          `package.json exports[${JSON.stringify(subpath)}] must be a string path.`,
        );
      }
      return { subpath, target };
    })
    .toSorted((left, right) => compareCodepoints(left.subpath, right.subpath));
  return { packageName, entries };
}

function isTypeOnlyDeclaration(declaration: ts.Declaration): boolean {
  if (ts.isExportSpecifier(declaration)) {
    if (declaration.isTypeOnly) return true;
    const namedExports = declaration.parent;
    if (
      ts.isNamedExports(namedExports) &&
      ts.isExportDeclaration(namedExports.parent)
    ) {
      return namedExports.parent.isTypeOnly;
    }
    return false;
  }
  return (
    ts.isTypeAliasDeclaration(declaration) ||
    ts.isInterfaceDeclaration(declaration)
  );
}

function classifyExportedSymbol(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
): ExportSymbolKind {
  const resolved =
    (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const hasValue = (resolved.flags & ts.SymbolFlags.Value) !== 0;
  const declarations = symbol.getDeclarations() ?? [];
  const allTypeOnly =
    declarations.length > 0 &&
    declarations.every((declaration) => isTypeOnlyDeclaration(declaration));
  return !hasValue || allTypeOnly ? "type" : "value";
}

function readCompilerOptions(repoRoot: string): ts.CompilerOptions {
  const configPath = ts.findConfigFile(
    repoRoot,
    (path) => ts.sys.fileExists(path),
    "tsconfig.json",
  );
  if (configPath === undefined) {
    throw new Error("tsconfig.json not found.");
  }
  const configFile = ts.readConfigFile(configPath, (path) =>
    ts.sys.readFile(path),
  );
  if (configFile.error !== undefined) {
    throw new Error(
      `Unable to read tsconfig.json: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n")}`,
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    repoRoot,
  );
  return parsed.options;
}

function collectExportedSymbols(
  repoRoot: string,
  entries: readonly PackageExportEntry[],
): Readonly<Record<string, Readonly<Record<string, ExportSymbolKind>>>> {
  const entryPaths = entries.map((entry) => resolve(repoRoot, entry.target));
  const program = ts.createProgram(entryPaths, readCompilerOptions(repoRoot));
  const checker = program.getTypeChecker();
  const recordedExports: Record<string, Record<string, ExportSymbolKind>> = {};
  for (const entry of entries) {
    const sourceFile = program.getSourceFile(resolve(repoRoot, entry.target));
    if (sourceFile === undefined) {
      throw new Error(`Export target not found by compiler: ${entry.target}`);
    }
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol === undefined) {
      throw new Error(`Export target is not a module: ${entry.target}`);
    }
    const symbols = checker
      .getExportsOfModule(moduleSymbol)
      .map((symbol) => ({
        name: symbol.getName(),
        kind: classifyExportedSymbol(checker, symbol),
      }))
      .toSorted((left, right) => compareCodepoints(left.name, right.name));
    const entryMap: Record<string, ExportSymbolKind> = {};
    for (const symbol of symbols) {
      entryMap[symbol.name] = symbol.kind;
    }
    recordedExports[entry.subpath] = entryMap;
  }
  return recordedExports;
}

function readHeaderFields(): Readonly<Record<string, string>> {
  const sorted: Record<string, string> = {};
  const entries = Object.entries(baseFields).toSorted(([left], [right]) =>
    compareCodepoints(left, right),
  );
  for (const [name, kind] of entries) {
    sorted[name] = kind;
  }
  return sorted;
}

function readEnvironmentVariables(): readonly string[] {
  return Object.values(noteCheckEnvironmentVariables).toSorted(
    compareCodepoints,
  );
}

function walkSkillFiles(
  directory: string,
  relativePrefix: string,
): readonly string[] {
  const entries = readdirSync(directory, { withFileTypes: true }).toSorted(
    (left, right) => compareCodepoints(left.name, right.name),
  );
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = `${relativePrefix}/${entry.name}`;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSkillFiles(fullPath, relativePath));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

export function buildPublicSurface(repoRoot: string): PublicSurface {
  const { entries } = readPackageExports(repoRoot);
  return {
    discovery: runCliDiscovery(repoRoot),
    exports: collectExportedSymbols(repoRoot, entries),
    headerFields: readHeaderFields(),
    environmentVariables: readEnvironmentVariables(),
    skills: walkSkillFiles(join(repoRoot, "skills"), "skills"),
  };
}

export const publicSurfaceFile = "public-surface.json";

function writePublicSurface(repoRoot: string): void {
  const surface = buildPublicSurface(repoRoot);
  const outputPath = join(repoRoot, publicSurfaceFile);
  writeFileSync(outputPath, `${JSON.stringify(surface, null, 2)}\n`);
  const formatRun = Bun.spawnSync(
    [
      join(repoRoot, "node_modules/.bin/biome"),
      "format",
      "--write",
      outputPath,
    ],
    {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      timeout: cliTimeoutMilliseconds,
      killSignal: "SIGKILL",
    },
  );
  if (formatRun.exitCode !== 0) {
    throw new Error(
      `biome format failed (${String(formatRun.exitCode)}): ${formatRun.stderr.toString().trim()}`,
    );
  }
}

if (import.meta.main) {
  writePublicSurface(resolve(import.meta.dir, ".."));
}
