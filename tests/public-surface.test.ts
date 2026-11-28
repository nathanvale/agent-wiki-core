import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPublicSurface,
  compareCodepoints,
  publicSurfaceFile,
  readPackageExports,
} from "../scripts/record-public-surface.ts";
import type { PublicSurface } from "../scripts/record-public-surface.ts";
import { parseJsonRecord, readObject } from "./support/json.ts";
import { root } from "./support/wiki.ts";

function packageImportSpecifier(packageName: string, subpath: string): string {
  if (subpath === ".") return packageName;
  return `${packageName}/${subpath.replace(/^\.\//, "")}`;
}

function readRecordedSurface(): Record<string, unknown> {
  return parseJsonRecord(
    readFileSync(join(root, publicSurfaceFile), "utf8"),
    publicSurfaceFile,
  );
}

test("recorded public-surface.json matches the live CLI, exports, header fields, environment variables and skills", () => {
  const recorded = readRecordedSurface();
  const live: PublicSurface = buildPublicSurface(root);
  expect<unknown>(live).toEqual(recorded);
});

test("each package.json exports entry imports by package name and matches its recorded runtime value exports", async () => {
  const { packageName, entries } = readPackageExports(root);
  const recorded = readRecordedSurface();
  const recordedExports = readObject(
    recorded["exports"],
    `${publicSurfaceFile}.exports`,
    (record) => record,
  );
  expect(entries.map((entry) => entry.subpath)).toEqual(
    Object.keys(recordedExports).toSorted(compareCodepoints),
  );
  expect(entries.length).toBeGreaterThan(0);

  for (const entry of entries) {
    const specifier = packageImportSpecifier(packageName, entry.subpath);
    const loaded: unknown = await import(specifier);
    if (typeof loaded !== "object" || loaded === null) {
      throw new Error(`Expected ${specifier} to resolve to a module object.`);
    }
    const runtimeNames = Object.keys(loaded)
      .filter((key) => key !== "default")
      .toSorted(compareCodepoints);
    const entrySymbols = readObject(
      recordedExports[entry.subpath],
      `${publicSurfaceFile}.exports[${entry.subpath}]`,
      (record) => record,
    );
    const recordedValues = Object.entries(entrySymbols)
      .filter(([, kind]) => kind === "value")
      .map(([name]) => name)
      .toSorted(compareCodepoints);
    expect(runtimeNames).toEqual(recordedValues);
  }
});
