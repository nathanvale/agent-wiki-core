import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { alwaysRenderedFields } from "../src/family-table/rules.ts";
import { headerPattern } from "../src/shared/rules.ts";
import {
  expectedDeskVariantTemplate,
  expectedFieldVariantTemplate,
  expectedNullBaseTagTemplate,
  expectedProjectTemplate,
  expectedTopicTemplate,
  multiFamilyTable,
  nullBaseTagTable,
  variantFamilyTable,
} from "./support/family-render-fixtures.ts";
import { familyWikiFixture, runCoreCli } from "./support/family-wiki.ts";
import { readObject, readString } from "./support/json.ts";

function renderedHeaderFieldNames(templateText: string): readonly string[] {
  const match = headerPattern.exec(templateText);
  if (match === null) return [];
  const headerBlock = match[1] ?? "";
  return headerBlock
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.slice(0, line.indexOf(":")));
}

describe("family render --wiki", () => {
  test("prints one template per defined family with exact header order, no type:, family fields as given, and hints only when present", () => {
    const wiki = familyWikiFixture({ table: multiFamilyTable });
    const run = runCoreCli(["family", "render", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.commandIdentity).toBe(
      "agent-wiki-core.family.render",
    );
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).not.toBeNull();
    if (run.envelope.result.data === null) return;

    expect(Object.keys(run.envelope.result.data)).toEqual(["familyTemplates"]);
    expect(run.envelope.result.data).toEqual({
      familyTemplates: {
        "templates/project.md": expectedProjectTemplate,
        "templates/topic.md": expectedTopicTemplate,
      },
    });
    expect(expectedProjectTemplate).not.toContain("type:");
    expect(expectedTopicTemplate).not.toContain("type:");
  });

  test("renders tags: [] when baseTag is null", () => {
    const wiki = familyWikiFixture({ table: nullBaseTagTable });
    const run = runCoreCli(["family", "render", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({
      familyTemplates: {
        "templates/note.md": expectedNullBaseTagTemplate,
      },
    });
  });

  test("renders the always-rendered base fields in the exact order owned by alwaysRenderedFields", () => {
    const wiki = familyWikiFixture({ table: nullBaseTagTable });
    const run = runCoreCli(["family", "render", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.data).not.toBeNull();
    if (run.envelope.result.data === null) return;

    const templates = readObject(
      run.envelope.result.data["familyTemplates"],
      "familyTemplates",
      (record) => record,
    );
    const noteTemplate = readString(
      templates["templates/note.md"],
      "familyTemplates[templates/note.md]",
    );
    const expectedBaseFields = [
      "family",
      "title",
      "summary",
      "created",
      "tags",
    ];
    expect(renderedHeaderFieldNames(noteTemplate)).toEqual(expectedBaseFields);
    expect<readonly string[]>(alwaysRenderedFields).toEqual(expectedBaseFields);
  });

  test("renders one family template per variant and no plain family template, with variant after tags and afterVariants headings last", () => {
    const wiki = familyWikiFixture({ table: variantFamilyTable });
    const run = runCoreCli(["family", "render", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.commandIdentity).toBe(
      "agent-wiki-core.family.render",
    );
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).not.toBeNull();
    if (run.envelope.result.data === null) return;

    const templates = readObject(
      run.envelope.result.data["familyTemplates"],
      "familyTemplates",
      (record) => record,
    );
    expect(Object.keys(templates)).toEqual([
      "templates/study-field.md",
      "templates/study-desk.md",
    ]);
    expect(Object.hasOwn(templates, "templates/study.md")).toBe(false);
    expect(run.envelope.result.data).toEqual({
      familyTemplates: {
        "templates/study-field.md": expectedFieldVariantTemplate,
        "templates/study-desk.md": expectedDeskVariantTemplate,
      },
    });
    const fieldTemplate = readString(
      templates["templates/study-field.md"],
      "familyTemplates[templates/study-field.md]",
    );
    expect(renderedHeaderFieldNames(fieldTemplate)).toEqual([
      "family",
      "title",
      "summary",
      "created",
      "tags",
      "variant",
      "status",
    ]);
  });

  test("refuses with exit 3 and DOMAIN_PRECONDITION_UNMET when family-table.json is missing", () => {
    const wiki = familyWikiFixture({});
    const run = runCoreCli(["family", "render", "--wiki", wiki]);

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.commandIdentity).toBe(
      "agent-wiki-core.family.render",
    );
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
  });
});

describe("family drift --wiki", () => {
  test("reports zero findings when installed templates match the render", () => {
    const wiki = familyWikiFixture({
      table: multiFamilyTable,
      templates: {
        "templates/project.md": expectedProjectTemplate,
        "templates/topic.md": expectedTopicTemplate,
      },
    });
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.commandIdentity).toBe(
      "agent-wiki-core.family.drift",
    );
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({ findings: [] });
  });

  test("reports template-missing when an installed template does not exist", () => {
    const wiki = familyWikiFixture({
      table: multiFamilyTable,
      templates: {
        "templates/topic.md": expectedTopicTemplate,
      },
    });
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({
      findings: [
        {
          path: "templates/project.md",
          kind: "template-missing",
          detail: "Installed family template is missing.",
        },
      ],
    });
  });

  test("reports template-differs when an installed template has been edited", () => {
    const wiki = familyWikiFixture({
      table: multiFamilyTable,
      templates: {
        "templates/project.md": `${expectedProjectTemplate}\n## Extra\n`,
        "templates/topic.md": expectedTopicTemplate,
      },
    });
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({
      findings: [
        {
          path: "templates/project.md",
          kind: "template-differs",
          detail:
            "Installed family template differs from the rendered template.",
        },
      ],
    });
  });

  test("reports template-differs with 'the path is not a file' when a folder is named like a template", () => {
    const wiki = familyWikiFixture({
      table: multiFamilyTable,
      templates: {
        "templates/topic.md": expectedTopicTemplate,
      },
    });
    mkdirSync(join(wiki, "templates/project.md"), { recursive: true });
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({
      findings: [
        {
          path: "templates/project.md",
          kind: "template-differs",
          detail: "the path is not a file",
        },
      ],
    });
  });

  test("reports template-unexpected when an extra template exists under templates/", () => {
    const wiki = familyWikiFixture({
      table: multiFamilyTable,
      templates: {
        "templates/project.md": expectedProjectTemplate,
        "templates/topic.md": expectedTopicTemplate,
        "templates/stray.md": "# Stray\n",
      },
    });
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({
      findings: [
        {
          path: "templates/stray.md",
          kind: "template-unexpected",
          detail: "Installed template is not declared in family-table.json.",
        },
      ],
    });
  });

  test("reports zero findings when installed variant family templates match the render", () => {
    const wiki = familyWikiFixture({
      table: variantFamilyTable,
      templates: {
        "templates/study-field.md": expectedFieldVariantTemplate,
        "templates/study-desk.md": expectedDeskVariantTemplate,
      },
    });
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.commandIdentity).toBe(
      "agent-wiki-core.family.drift",
    );
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({ findings: [] });
  });

  test("reports template-unexpected when a plain family template exists for a family with variants", () => {
    const wiki = familyWikiFixture({
      table: variantFamilyTable,
      templates: {
        "templates/study-field.md": expectedFieldVariantTemplate,
        "templates/study-desk.md": expectedDeskVariantTemplate,
        "templates/study.md": "# Plain study\n",
      },
    });
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({
      findings: [
        {
          path: "templates/study.md",
          kind: "template-unexpected",
          detail: "Installed template is not declared in family-table.json.",
        },
      ],
    });
  });

  test("reports template-missing when one variant family template is absent", () => {
    const wiki = familyWikiFixture({
      table: variantFamilyTable,
      templates: {
        "templates/study-field.md": expectedFieldVariantTemplate,
      },
    });
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({
      findings: [
        {
          path: "templates/study-desk.md",
          kind: "template-missing",
          detail: "Installed family template is missing.",
        },
      ],
    });
  });

  test("refuses with exit 3 and DOMAIN_PRECONDITION_UNMET when family-table.json is missing", () => {
    const wiki = familyWikiFixture({});
    const run = runCoreCli(["family", "drift", "--wiki", wiki]);

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.commandIdentity).toBe(
      "agent-wiki-core.family.drift",
    );
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
  });
});
