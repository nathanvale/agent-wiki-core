import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

const corePackage = "agent-wiki-core";
const kernelPackage = "agent-cli-kernel";
const installedCorePath = `node_modules/${corePackage}`;
const installedCoreTagPath = `${installedCorePath}/.bun-tag`;
const wikiSkillPath = `${installedCorePath}/skills/wiki/SKILL.md`;
const shippedPointerPath = `${installedCorePath}/skills/wiki/pointer/SKILL.md`;
const installedPointerPath = ".agents/skills/wiki/SKILL.md";
const nestedKernelPath = `${installedCorePath}/node_modules/${kernelPackage}`;
const fullCommitPattern = /#([0-9a-f]{40})$/;
const resolvedCommitPattern = /#([0-9a-f]{7,40})$/;
const installedTagCommitPattern = /(?:^|-)([0-9a-f]{7,40})$/;

export type InstallFindingKind =
  | "core-pin-missing"
  | "lockfile-disagrees"
  | "installed-core-disagrees"
  | "wiki-skill-missing"
  | "shipped-pointer-missing"
  | "installed-pointer-missing"
  | "installed-pointer-differs"
  | "nested-kernel";

export type InstallFinding = {
  readonly kind: InstallFindingKind;
  readonly path: string;
  readonly detail: string;
  readonly repair: string;
};

type CorePinRead =
  | { readonly ok: true; readonly commit: string }
  | { readonly ok: false; readonly finding: InstallFinding };

function ownValue(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

function readRegularFile(
  wikiRoot: string,
  relativePath: string,
): string | undefined {
  const fullPath = join(wikiRoot, relativePath);
  const stat = lstatSync(fullPath, { throwIfNoEntry: false });
  if (stat?.isFile() !== true) return undefined;
  return readFileSync(fullPath, "utf8");
}

function parseJsonc(text: string): unknown {
  try {
    return Bun.JSONC.parse(text);
  } catch {
    return undefined;
  }
}

function matchCommit(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === "string" ? pattern.exec(value)?.[1] : undefined;
}

function readCorePin(wikiRoot: string): CorePinRead {
  const manifestText = readRegularFile(wikiRoot, "package.json");
  if (manifestText === undefined) {
    return {
      ok: false,
      finding: {
        kind: "core-pin-missing",
        path: "package.json",
        detail: "package.json is missing from the wiki root.",
        repair: `restore package.json with a full 40-character core pin for ${corePackage}, then run bun install --frozen-lockfile.`,
      },
    };
  }
  const manifest = parseJsonc(manifestText);
  const spec = ownValue(ownValue(manifest, "dependencies"), corePackage);
  const commit = matchCommit(spec, fullCommitPattern);
  if (commit === undefined) {
    return {
      ok: false,
      finding: {
        kind: "core-pin-missing",
        path: "package.json",
        detail: `package.json does not pin dependencies["${corePackage}"] to a full 40-character commit (found ${JSON.stringify(spec)}).`,
        repair: `pin ${corePackage} in package.json dependencies to github:<owner>/${corePackage}#<full 40-character commit>, then run bun install and commit bun.lock.`,
      },
    };
  }
  return { ok: true, commit };
}

function lockfileFindings(
  wikiRoot: string,
  corePin: string,
): readonly InstallFinding[] {
  const lockText = readRegularFile(wikiRoot, "bun.lock");
  if (lockText === undefined) {
    return [
      {
        kind: "lockfile-disagrees",
        path: "bun.lock",
        detail: `bun.lock is missing, and package.json pins ${corePackage} at ${corePin}.`,
        repair:
          "run bun install, commit bun.lock, then run bun install --frozen-lockfile.",
      },
    ];
  }
  const lock = parseJsonc(lockText);
  const rootWorkspace = ownValue(ownValue(lock, "workspaces"), "");
  const declaredSpec = ownValue(
    ownValue(rootWorkspace, "dependencies"),
    corePackage,
  );
  const declaredCommit = matchCommit(declaredSpec, fullCommitPattern);
  if (declaredCommit !== corePin) {
    return [
      {
        kind: "lockfile-disagrees",
        path: "bun.lock",
        detail: `bun.lock pins ${corePackage} at ${declaredCommit ?? "no full commit"}, and package.json pins ${corePin}.`,
        repair:
          "run bun install after changing the core pin in package.json, commit bun.lock, then run bun install --frozen-lockfile.",
      },
    ];
  }
  const packageEntry = ownValue(ownValue(lock, "packages"), corePackage);
  const resolvedSpec: unknown = Array.isArray(packageEntry)
    ? packageEntry[0]
    : undefined;
  const resolvedCommit = matchCommit(resolvedSpec, resolvedCommitPattern);
  if (resolvedCommit === undefined || !corePin.startsWith(resolvedCommit)) {
    return [
      {
        kind: "lockfile-disagrees",
        path: "bun.lock",
        detail: `bun.lock resolves ${corePackage} to ${resolvedCommit ?? "no commit"}, and package.json pins ${corePin}.`,
        repair: `run bun update ${corePackage}, commit bun.lock, then run bun install --frozen-lockfile.`,
      },
    ];
  }
  return [];
}

function installedCoreFindings(
  wikiRoot: string,
  corePin: string,
): readonly InstallFinding[] {
  const installedTag = readRegularFile(wikiRoot, installedCoreTagPath)?.trim();
  const installedCommit = matchCommit(installedTag, installedTagCommitPattern);
  if (installedCommit !== undefined && corePin.startsWith(installedCommit))
    return [];
  return [
    {
      kind: "installed-core-disagrees",
      path: installedCorePath,
      detail: `installed ${corePackage} is ${installedTag ?? "not installed"}, and package.json pins ${corePin}.`,
      repair: "run bun install --frozen-lockfile.",
    },
  ];
}

function wikiSkillFindings(wikiRoot: string): readonly InstallFinding[] {
  if (readRegularFile(wikiRoot, wikiSkillPath) !== undefined) return [];
  return [
    {
      kind: "wiki-skill-missing",
      path: wikiSkillPath,
      detail: `the wiki skill is missing from the installed wiki core at ${wikiSkillPath}.`,
      repair:
        "run bun install --frozen-lockfile, or move the core pin to a commit that ships skills/wiki/SKILL.md.",
    },
  ];
}

function pointerFindings(wikiRoot: string): readonly InstallFinding[] {
  const findings: InstallFinding[] = [];
  const shipped = readRegularFile(wikiRoot, shippedPointerPath);
  const installed = readRegularFile(wikiRoot, installedPointerPath);
  if (shipped === undefined) {
    findings.push({
      kind: "shipped-pointer-missing",
      path: shippedPointerPath,
      detail: `the shipped pointer is missing from the installed wiki core at ${shippedPointerPath}.`,
      repair:
        "run bun install --frozen-lockfile, or move the core pin to a commit that ships skills/wiki/pointer/SKILL.md.",
    });
  }
  if (installed === undefined) {
    findings.push({
      kind: "installed-pointer-missing",
      path: installedPointerPath,
      detail: `the installed pointer is missing at ${installedPointerPath}.`,
      repair: `copy ${shippedPointerPath} to ${installedPointerPath}.`,
    });
  } else if (shipped !== undefined && installed !== shipped) {
    findings.push({
      kind: "installed-pointer-differs",
      path: installedPointerPath,
      detail: `the installed pointer at ${installedPointerPath} differs from the shipped pointer at ${shippedPointerPath}.`,
      repair: `copy ${shippedPointerPath} over ${installedPointerPath} without hand edits.`,
    });
  }
  return findings;
}

function nestedKernelFindings(wikiRoot: string): readonly InstallFinding[] {
  const nested = lstatSync(join(wikiRoot, nestedKernelPath), {
    throwIfNoEntry: false,
  });
  if (nested === undefined) return [];
  return [
    {
      kind: "nested-kernel",
      path: nestedKernelPath,
      detail: `a nested kernel is installed at ${nestedKernelPath} because the wiki core and the consumer wiki name different kernel commits.`,
      repair: `align the consumer wiki's ${kernelPackage} pin in package.json with the commit pinned by ${corePackage}, then run bun install.`,
    },
  ];
}

export function installFindings(wikiRoot: string): readonly InstallFinding[] {
  const corePin = readCorePin(wikiRoot);
  return [
    ...(corePin.ok
      ? [
          ...lockfileFindings(wikiRoot, corePin.commit),
          ...installedCoreFindings(wikiRoot, corePin.commit),
        ]
      : [corePin.finding]),
    ...wikiSkillFindings(wikiRoot),
    ...pointerFindings(wikiRoot),
    ...nestedKernelFindings(wikiRoot),
  ];
}
