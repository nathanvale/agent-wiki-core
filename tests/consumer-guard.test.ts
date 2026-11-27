import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type InstallFinding,
  installFindings,
} from "../src/consumer-guard/index.ts";
import { testFolder } from "./support/test-folder.ts";

const pinnedCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const otherCommit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const shippedPointerBody = [
  "---",
  "name: wiki",
  "description: Pointer to the wiki skill.",
  "---",
  "",
  "Read node_modules/agent-wiki-core/skills/wiki/SKILL.md.",
  "",
].join("\n");

type ConsumerWikiOptions = {
  readonly packageJson?: string;
  readonly bunLock?: string | null;
  readonly bunTag?: string | null;
  readonly fullSkill?: string | null;
  readonly shippedPointer?: string | null;
  readonly installedPointer?: string | null;
  readonly nestedKernel?: boolean;
};

function writeFixtureFile(root: string, path: string, content: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function defaultPackageJson(commit = pinnedCommit): string {
  return JSON.stringify(
    {
      name: "example-wiki",
      private: true,
      dependencies: {
        "agent-wiki-core": `github:example/agent-wiki-core#${commit}`,
      },
    },
    null,
    2,
  );
}

function defaultBunLock(
  declaredCommit = pinnedCommit,
  resolvedCommit = pinnedCommit.slice(0, 7),
): string {
  return JSON.stringify(
    {
      lockfileVersion: 3,
      workspaces: {
        "": {
          dependencies: {
            "agent-wiki-core": `github:example/agent-wiki-core#${declaredCommit}`,
          },
        },
      },
      packages: {
        "agent-wiki-core": [
          `agent-wiki-core@github:example/agent-wiki-core#${resolvedCommit}`,
          {},
          `example-agent-wiki-core-${resolvedCommit}`,
          "sha512-example",
        ],
      },
    },
    null,
    2,
  );
}

function withConsumerWiki(
  options: ConsumerWikiOptions,
  check: (wikiRoot: string) => void,
): void {
  const wikiRoot = testFolder("consumer-guard-");
  try {
    writeFixtureFile(
      wikiRoot,
      "package.json",
      options.packageJson ?? defaultPackageJson(),
    );
    if (options.bunLock !== null)
      writeFixtureFile(
        wikiRoot,
        "bun.lock",
        options.bunLock ?? defaultBunLock(),
      );
    if (options.bunTag !== null)
      writeFixtureFile(
        wikiRoot,
        "node_modules/agent-wiki-core/.bun-tag",
        options.bunTag ??
          `example-agent-wiki-core-${pinnedCommit.slice(0, 7)}\n`,
      );
    if (options.fullSkill !== null)
      writeFixtureFile(
        wikiRoot,
        "node_modules/agent-wiki-core/skills/wiki/SKILL.md",
        options.fullSkill ?? "# Wiki skill\n",
      );
    if (options.shippedPointer !== null)
      writeFixtureFile(
        wikiRoot,
        "node_modules/agent-wiki-core/skills/wiki/pointer/SKILL.md",
        options.shippedPointer ?? shippedPointerBody,
      );
    if (options.installedPointer !== null)
      writeFixtureFile(
        wikiRoot,
        ".agents/skills/wiki/SKILL.md",
        options.installedPointer ?? shippedPointerBody,
      );
    if (options.nestedKernel === true)
      writeFixtureFile(
        wikiRoot,
        "node_modules/agent-wiki-core/node_modules/agent-cli-kernel/package.json",
        JSON.stringify({ name: "agent-cli-kernel" }),
      );
    check(wikiRoot);
  } finally {
    rmSync(wikiRoot, { recursive: true, force: true });
  }
}

function expectSingleFinding(
  findings: readonly InstallFinding[],
  kind: InstallFinding["kind"],
  path: string,
): InstallFinding {
  expect(findings).toHaveLength(1);
  const [finding] = findings;
  if (finding === undefined)
    throw new Error(`Expected one ${kind} finding, got none.`);
  expect(finding.kind).toBe(kind);
  expect(finding.path).toBe(path);
  expect(finding.detail.length).toBeGreaterThan(0);
  expect(finding.repair.length).toBeGreaterThan(0);
  return finding;
}

test("clean consumer wiki install returns no install findings", () => {
  withConsumerWiki({}, (wikiRoot) => {
    expect(installFindings(wikiRoot)).toEqual([]);
  });
});

test("hand-edited installed pointer returns an install finding with repair", () => {
  withConsumerWiki(
    { installedPointer: `${shippedPointerBody}\nHand edit.\n` },
    (wikiRoot) => {
      const finding = expectSingleFinding(
        installFindings(wikiRoot),
        "installed-pointer-differs",
        ".agents/skills/wiki/SKILL.md",
      );
      expect(finding.repair).toContain(".agents/skills/wiki/SKILL.md");
    },
  );
});

test("missing installed pointer returns an install finding with repair", () => {
  withConsumerWiki({ installedPointer: null }, (wikiRoot) => {
    const finding = expectSingleFinding(
      installFindings(wikiRoot),
      "installed-pointer-missing",
      ".agents/skills/wiki/SKILL.md",
    );
    expect(finding.repair).toContain(".agents/skills/wiki/SKILL.md");
  });
});

test("missing full wiki skill returns an install finding with repair", () => {
  withConsumerWiki({ fullSkill: null }, (wikiRoot) => {
    const finding = expectSingleFinding(
      installFindings(wikiRoot),
      "wiki-skill-missing",
      "node_modules/agent-wiki-core/skills/wiki/SKILL.md",
    );
    expect(finding.repair).toContain("bun install --frozen-lockfile");
  });
});

test("missing shipped pointer returns an install finding with repair", () => {
  withConsumerWiki({ shippedPointer: null }, (wikiRoot) => {
    const finding = expectSingleFinding(
      installFindings(wikiRoot),
      "shipped-pointer-missing",
      "node_modules/agent-wiki-core/skills/wiki/pointer/SKILL.md",
    );
    expect(finding.repair).toContain("bun install --frozen-lockfile");
  });
});

test("core pin that disagrees with bun.lock declared commit returns an install finding", () => {
  withConsumerWiki(
    { bunLock: defaultBunLock(otherCommit, otherCommit.slice(0, 7)) },
    (wikiRoot) => {
      const finding = expectSingleFinding(
        installFindings(wikiRoot),
        "lockfile-disagrees",
        "bun.lock",
      );
      expect(finding.repair).toContain("bun install");
    },
  );
});

test("core pin that disagrees with bun.lock resolved commit returns an install finding", () => {
  withConsumerWiki(
    { bunLock: defaultBunLock(pinnedCommit, otherCommit.slice(0, 7)) },
    (wikiRoot) => {
      const finding = expectSingleFinding(
        installFindings(wikiRoot),
        "lockfile-disagrees",
        "bun.lock",
      );
      expect(finding.repair).toContain("bun update agent-wiki-core");
    },
  );
});

test("missing bun.lock returns an install finding with repair", () => {
  withConsumerWiki({ bunLock: null }, (wikiRoot) => {
    const finding = expectSingleFinding(
      installFindings(wikiRoot),
      "lockfile-disagrees",
      "bun.lock",
    );
    expect(finding.repair).toContain("bun install");
  });
});

test("installed package that disagrees with the core pin returns an install finding", () => {
  withConsumerWiki(
    { bunTag: `example-agent-wiki-core-${otherCommit.slice(0, 7)}\n` },
    (wikiRoot) => {
      const finding = expectSingleFinding(
        installFindings(wikiRoot),
        "installed-core-disagrees",
        "node_modules/agent-wiki-core",
      );
      expect(finding.repair).toContain("bun install --frozen-lockfile");
    },
  );
});

test("missing core pin in package.json returns an install finding with repair", () => {
  withConsumerWiki(
    { packageJson: JSON.stringify({ name: "example-wiki", dependencies: {} }) },
    (wikiRoot) => {
      const finding = expectSingleFinding(
        installFindings(wikiRoot),
        "core-pin-missing",
        "package.json",
      );
      expect(finding.repair).toContain("package.json");
    },
  );
});

test("nested kernel under installed wiki core returns a nested-kernel install finding", () => {
  withConsumerWiki({ nestedKernel: true }, (wikiRoot) => {
    const finding = expectSingleFinding(
      installFindings(wikiRoot),
      "nested-kernel",
      "node_modules/agent-wiki-core/node_modules/agent-cli-kernel",
    );
    expect(finding.repair).toContain("agent-cli-kernel");
  });
});

test("consumer-guard subpath export exposes installFindings", async () => {
  const exported = await import("agent-wiki-core/consumer-guard");
  expect(exported.installFindings).toBe(installFindings);
});
