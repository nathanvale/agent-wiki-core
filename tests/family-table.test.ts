import { describe, expect, test } from "bun:test";
import { readFamilyTable } from "agent-wiki-core/family";
import type {
  Family,
  FamilyField,
  FamilyTable,
  Heading,
  Rename,
} from "agent-wiki-core/family";
import { familyWikiFixture, runCoreCli } from "./support/family-wiki.ts";

const minimalTable = {
  families: [
    {
      family: "project",
      folder: "wiki/projects/",
      headings: [{ name: "Purpose", optional: false }],
    },
  ],
};

const fullTable = {
  baseTag: "example-wiki",
  discoveryTags: ["travel", "home"],
  tagLimit: 2,
  summaryMaxLength: 200,
  unfiledFolder: "wiki/inbox/",
  familyFreeFolders: ["wiki/inbox/", "wiki/archive/"],
  reservedFamilies: { "wiki/areas/": "area" },
  renames: [{ kind: "family", from: "trip", to: "project" }],
  families: [
    {
      family: "project",
      folder: "wiki/projects/",
      familyFields: [
        { name: "status", value: "seed" },
        { name: "updated", value: '"{{date}}"' },
      ],
      headings: [
        {
          name: "Purpose",
          hint: "Why this project matters.",
          optional: false,
        },
        {
          name: "Notes",
          optional: true,
        },
      ],
    },
  ],
};

describe("family list --wiki", () => {
  test("refuses with exit 3 and DOMAIN_PRECONDITION_UNMET when family-table.json is missing", () => {
    const wiki = familyWikiFixture({});
    const run = runCoreCli(["family", "list", "--wiki", wiki]);

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.commandIdentity).toBe(
      "agent-wiki-core.family.list",
    );
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
  });

  test("refuses with exit 3 and DOMAIN_PRECONDITION_UNMET when family-table.json has invalid JSON", () => {
    const wiki = familyWikiFixture({ rawTable: "{ not valid json" });
    const run = runCoreCli(["family", "list", "--wiki", wiki]);

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
  });

  test("refuses with exit 3 and DOMAIN_PRECONDITION_UNMET on an unknown top-level key, naming the file and key", () => {
    const wiki = familyWikiFixture({
      table: {
        ...minimalTable,
        unexpectedKey: true,
      },
    });
    const run = runCoreCli(["family", "list", "--wiki", wiki]);

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
    expect(run.envelope.message).toContain("unexpectedKey");
  });

  test("refuses with exit 3 and DOMAIN_PRECONDITION_UNMET on an unknown nested key", () => {
    const wiki = familyWikiFixture({
      table: {
        families: [
          {
            family: "project",
            folder: "wiki/projects/",
            extraNestedKey: "bad",
            headings: [{ name: "Purpose", optional: false }],
          },
        ],
      },
    });
    const run = runCoreCli(["family", "list", "--wiki", wiki]);

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
    expect(run.envelope.message).toContain("extraNestedKey");
  });

  test("refuses with exit 3 and DOMAIN_PRECONDITION_UNMET when a family field is named tags or another always-rendered field", () => {
    for (const forbidden of ["family", "title", "summary", "created", "tags"]) {
      const wiki = familyWikiFixture({
        table: {
          families: [
            {
              family: "project",
              folder: "wiki/projects/",
              familyFields: [{ name: forbidden, value: "x" }],
              headings: [{ name: "Purpose", optional: false }],
            },
          ],
        },
      });
      const run = runCoreCli(["family", "list", "--wiki", wiki]);

      expect(run.exitCode).toBe(3);
      expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
      expect(run.envelope.message).toContain("family-table.json");
      expect(run.envelope.message).toContain(forbidden);
    }
  });

  test("refuses when a family field name does not match ^[a-z][a-z0-9_]*$", () => {
    const wiki = familyWikiFixture({
      table: {
        families: [
          {
            family: "project",
            folder: "wiki/projects/",
            familyFields: [{ name: "Bad-Name", value: "x" }],
            headings: [{ name: "Purpose", optional: false }],
          },
        ],
      },
    });
    const run = runCoreCli(["family", "list", "--wiki", wiki]);

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
    expect(run.envelope.message).toContain("Bad-Name");
  });

  test("loads a families-only table with D1 defaults and lists every table key by literal value", () => {
    const wiki = familyWikiFixture({ table: minimalTable });
    const run = runCoreCli(["family", "list", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.commandIdentity).toBe(
      "agent-wiki-core.family.list",
    );
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).not.toBeNull();
    if (run.envelope.result.data === null) return;

    expect(Object.keys(run.envelope.result.data).toSorted()).toEqual([
      "baseTag",
      "discoveryTags",
      "families",
      "familyFreeFolders",
      "renames",
      "reservedFamilies",
      "summaryMaxLength",
      "tagLimit",
      "unfiledFolder",
    ]);
    expect(run.envelope.result.data).toEqual({
      baseTag: null,
      discoveryTags: null,
      tagLimit: 2,
      summaryMaxLength: 200,
      unfiledFolder: "wiki/inbox/",
      familyFreeFolders: [],
      reservedFamilies: {},
      renames: [],
      families: [
        {
          family: "project",
          folder: "wiki/projects/",
          familyFields: [],
          headings: [{ name: "Purpose", optional: false }],
        },
      ],
    });
  });

  test("loads and prints a full family table with all keys populated", () => {
    const wiki = familyWikiFixture({
      table: fullTable,
      notes: {
        "wiki/projects/alpha.md": "# Alpha\n",
      },
    });
    const run = runCoreCli(["family", "list", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual(fullTable);
  });

  test("accepts null for unfiledFolder, tagLimit, and summaryMaxLength", () => {
    const wiki = familyWikiFixture({
      table: {
        ...minimalTable,
        unfiledFolder: null,
        tagLimit: null,
        summaryMaxLength: null,
      },
    });
    const run = runCoreCli(["family", "list", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.data).toEqual({
      baseTag: null,
      discoveryTags: null,
      tagLimit: null,
      summaryMaxLength: null,
      unfiledFolder: null,
      familyFreeFolders: [],
      reservedFamilies: {},
      renames: [],
      families: [
        {
          family: "project",
          folder: "wiki/projects/",
          familyFields: [],
          headings: [{ name: "Purpose", optional: false }],
        },
      ],
    });
  });

  test("agent-wiki-core/family exports readFamilyTable and the table types", () => {
    const wiki = familyWikiFixture({ table: fullTable });
    const loaded = readFamilyTable(wiki);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const table: FamilyTable = loaded.table;
    const firstFamily: Family | undefined = table.families[0];
    const firstField: FamilyField | undefined = firstFamily?.familyFields[0];
    const firstHeading: Heading | undefined = firstFamily?.headings[0];
    const firstRename: Rename | undefined = table.renames[0];

    expect(firstFamily?.family).toBe("project");
    expect(firstField?.name).toBe("status");
    expect(firstHeading?.name).toBe("Purpose");
    expect(firstRename?.kind).toBe("family");

    const missing = readFamilyTable(familyWikiFixture({}));
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.path).toContain("family-table.json");
    expect(missing.detail).toContain("exist");
  });

  test("loads a family declaring variants and afterVariants by literal value", () => {
    const tableWithVariants = {
      families: [
        {
          family: "study",
          folder: "wiki/studies/",
          headings: [
            { name: "Answer", optional: false },
            { name: "Evidence", optional: false, afterVariants: true },
          ],
          variants: [
            {
              name: "holiday",
              headings: [
                {
                  name: "Deadlines",
                  hint: "Book, cancel and pay by dates.",
                },
              ],
            },
            {
              name: "engineering",
              headings: [{ name: "Constraints" }],
            },
          ],
        },
      ],
    };
    const wiki = familyWikiFixture({ table: tableWithVariants });
    const run = runCoreCli(["family", "list", "--wiki", wiki]);

    expect(run.exitCode).toBe(0);
    expect(run.envelope.result.causeCode).toBe("SUCCESS_UNCHANGED");
    expect(run.envelope.result.data).toEqual({
      baseTag: null,
      discoveryTags: null,
      tagLimit: 2,
      summaryMaxLength: 200,
      unfiledFolder: "wiki/inbox/",
      familyFreeFolders: [],
      reservedFamilies: {},
      renames: [],
      families: [
        {
          family: "study",
          folder: "wiki/studies/",
          familyFields: [],
          headings: [
            { name: "Answer", optional: false },
            { name: "Evidence", optional: false, afterVariants: true },
          ],
          variants: [
            {
              name: "holiday",
              headings: [
                {
                  name: "Deadlines",
                  hint: "Book, cancel and pay by dates.",
                },
              ],
            },
            {
              name: "engineering",
              headings: [{ name: "Constraints" }],
            },
          ],
        },
      ],
    });
  });

  function runSingleFamilyList(family: Record<string, unknown>) {
    const wiki = familyWikiFixture({ table: { families: [family] } });
    return runCoreCli(["family", "list", "--wiki", wiki]);
  }

  test("refuses a duplicate variant name within a family", () => {
    const run = runSingleFamilyList({
      family: "study",
      folder: "wiki/studies/",
      headings: [{ name: "Answer", optional: false }],
      variants: [
        { name: "holiday", headings: [{ name: "Deadlines" }] },
        { name: "holiday", headings: [{ name: "Budget" }] },
      ],
    });

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
    expect(run.envelope.message).toContain("variants");
    expect(run.envelope.message).toContain("holiday");
  });

  test("refuses a variant name with a capital letter", () => {
    const run = runSingleFamilyList({
      family: "study",
      folder: "wiki/studies/",
      headings: [{ name: "Answer", optional: false }],
      variants: [{ name: "Holiday", headings: [{ name: "Deadlines" }] }],
    });

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
    expect(run.envelope.message).toContain("variants[0].name");
    expect(run.envelope.message).toContain("Holiday");
  });

  test("refuses an unknown key inside a variant", () => {
    const run = runSingleFamilyList({
      family: "study",
      folder: "wiki/studies/",
      headings: [{ name: "Answer", optional: false }],
      variants: [
        {
          name: "holiday",
          extraVariantKey: true,
          headings: [{ name: "Deadlines" }],
        },
      ],
    });

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
    expect(run.envelope.message).toContain("extraVariantKey");
  });

  test("refuses optional: false and optional: true on a variant heading as an unknown key", () => {
    for (const optionalValue of [false, true]) {
      const run = runSingleFamilyList({
        family: "study",
        folder: "wiki/studies/",
        headings: [{ name: "Answer", optional: false }],
        variants: [
          {
            name: "holiday",
            headings: [{ name: "Deadlines", optional: optionalValue }],
          },
        ],
      });

      expect(run.exitCode).toBe(3);
      expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
      expect(run.envelope.message).toContain("family-table.json");
      expect(run.envelope.message).toContain("Unknown key");
      expect(run.envelope.message).toContain("optional");
    }
  });

  test("refuses afterVariants on a family without variants", () => {
    const run = runSingleFamilyList({
      family: "project",
      folder: "wiki/projects/",
      headings: [{ name: "Purpose", optional: false, afterVariants: true }],
    });

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
    expect(run.envelope.message).toContain("afterVariants");
    expect(run.envelope.message).not.toContain("Unknown key");
  });

  test("refuses an empty variants list", () => {
    const run = runSingleFamilyList({
      family: "study",
      folder: "wiki/studies/",
      headings: [{ name: "Answer", optional: false }],
      variants: [],
    });

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
    expect(run.envelope.message).toContain("variants");
    expect(run.envelope.message).not.toContain("Unknown key");
  });

  test("refuses a family field named variant on a family that declares variants", () => {
    const run = runSingleFamilyList({
      family: "study",
      folder: "wiki/studies/",
      familyFields: [{ name: "variant", value: "holiday" }],
      headings: [{ name: "Answer", optional: false }],
      variants: [{ name: "holiday", headings: [{ name: "Deadlines" }] }],
    });

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
    expect(run.envelope.message).toContain("familyFields");
    expect(run.envelope.message).toContain("variant");
  });
});
