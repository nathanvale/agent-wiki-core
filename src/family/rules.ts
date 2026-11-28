import { alwaysRenderedFields } from "../family-table/rules.ts";
import type { Family, FamilyTable } from "../family-table/rules.ts";

export type InstalledFamilyTemplate = {
  readonly path: string;
  readonly text: string | null;
};

export type TemplateDriftKind =
  | "template-missing"
  | "template-differs"
  | "template-unexpected";

export type TemplateDriftFinding = {
  readonly path: string;
  readonly kind: TemplateDriftKind;
  readonly detail: string;
};

function renderFamilyTemplate(family: Family, baseTag: string | null): string {
  const baseFieldValues: Record<(typeof alwaysRenderedFields)[number], string> =
    {
      family: family.family,
      title: '"{{title}}"',
      summary: '""',
      created: '"{{date}}"',
      tags: `[${baseTag === null ? "" : baseTag}]`,
    };
  const headerLines = [
    "---",
    ...alwaysRenderedFields.map((name) => `${name}: ${baseFieldValues[name]}`),
    ...family.familyFields.map((field) => `${field.name}: ${field.value}`),
    "---",
  ];
  const sections = family.headings.map((heading) =>
    heading.hint === undefined || heading.hint.trim() === ""
      ? `## ${heading.name}`
      : `## ${heading.name}\n\n<!-- ${heading.hint} -->`,
  );
  const body = ["# {{title}}", ...sections].join("\n\n");
  return `${headerLines.join("\n")}\n\n${body}\n`;
}

export function renderFamilyTemplates(
  table: FamilyTable,
): Readonly<Record<string, string>> {
  const templates: Record<string, string> = {};
  for (const family of table.families) {
    templates[`templates/${family.family}.md`] = renderFamilyTemplate(
      family,
      table.baseTag,
    );
  }
  return templates;
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function templateDriftFindings(
  expected: Readonly<Record<string, string>>,
  installed: readonly InstalledFamilyTemplate[],
): TemplateDriftFinding[] {
  const installedByPath = new Map<string, string | null>(
    installed.map((entry) => [entry.path, entry.text]),
  );
  const findings: TemplateDriftFinding[] = [];

  for (const [path, expectedText] of Object.entries(expected)) {
    if (!installedByPath.has(path)) {
      findings.push({
        path,
        kind: "template-missing",
        detail: "Installed family template is missing.",
      });
      continue;
    }
    const actualText = installedByPath.get(path);
    if (actualText === null) {
      findings.push({
        path,
        kind: "template-differs",
        detail: "the path is not a file",
      });
    } else if (actualText !== expectedText) {
      findings.push({
        path,
        kind: "template-differs",
        detail: "Installed family template differs from the rendered template.",
      });
    }
  }

  for (const entry of installed) {
    if (!Object.hasOwn(expected, entry.path)) {
      findings.push({
        path: entry.path,
        kind: "template-unexpected",
        detail: "Installed template is not declared in family-table.json.",
      });
    }
  }

  return findings.toSorted((left, right) =>
    comparePaths(left.path, right.path),
  );
}
