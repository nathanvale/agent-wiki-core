import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const fullSkillPath = join(root, "skills", "wiki", "SKILL.md");
const shippedPointerPath = join(root, "skills", "wiki", "pointer", "SKILL.md");
const installedFullSkillPath =
  "node_modules/agent-wiki-core/skills/wiki/SKILL.md";

type SkillDocument = {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly raw: string;
};

function readSkill(filePath: string): SkillDocument {
  const raw = readFileSync(filePath, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (match === null) {
    throw new Error(`Missing front matter in ${filePath}`);
  }
  const frontMatter = match[1] ?? "";
  const body = match[2] ?? "";
  const name = /^name:\s*(.+)$/m.exec(frontMatter)?.[1]?.trim() ?? "";
  const description =
    /^description:\s*(.+)$/m.exec(frontMatter)?.[1]?.trim() ?? "";
  return { name, description, body, raw };
}

function numberedSteps(body: string): string[] {
  return body.split("\n").filter((line) => /^\d+\.\s+/.test(line));
}

function namedRoutes(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1] ?? "";
    if (token !== "" && !token.startsWith("-")) {
      found.add(token);
    }
  }
  return [...found];
}

test("the full wiki skill has exactly three numbered steps and names only note check", () => {
  const fullSkill = readSkill(fullSkillPath);
  const steps = numberedSteps(fullSkill.body);

  expect(fullSkill.name).toBe("wiki");
  expect(fullSkill.description.length).toBeGreaterThan(0);
  expect(steps.map((step) => step.slice(0, 2))).toEqual(["1.", "2.", "3."]);
  expect(steps[0]).toContain("--help");
  expect(steps[1]).toContain("route");
  expect(steps[1]).toMatch(/stop and report.*missing route/i);
  expect(steps[2]).toContain("note check");
  expect(namedRoutes(fullSkill.body)).toEqual([
    "note check --wiki <wiki root>",
    "note check",
  ]);
});

test("the shipped pointer matches the full wiki skill front matter and points in prose", () => {
  const fullSkill = readSkill(fullSkillPath);
  const shippedPointer = readSkill(shippedPointerPath);

  expect(shippedPointer.name).toBe("wiki");
  expect(shippedPointer.name).toBe(fullSkill.name);
  expect(shippedPointer.description).toBe(fullSkill.description);
  expect(shippedPointer.raw).not.toMatch(/^Full skill:/m);
  expect(shippedPointer.raw).not.toMatch(/^Pinned commit:/m);
  expect(shippedPointer.raw).not.toMatch(/\b[0-9a-f]{40}\b/);
  expect(shippedPointer.body).toContain(installedFullSkillPath);
});
