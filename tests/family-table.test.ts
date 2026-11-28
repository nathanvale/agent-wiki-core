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
  familyHeader: "from-folder",
  undeclaredFolders: "family-free",
  baseTag: "example-wiki",
  discoveryTags: ["travel", "home"],
  tagLimit: 2,
  summaryRequired: false,
  summaryMaxLength: 200,
  createdRequired: false,
  noteNames: "dated-title",
  uniqueNoteNames: false,
  unfiledFolder: "wiki/inbox/",
  familyFreeFolders: ["wiki/inbox/", "wiki/archive/"],
  reservedFamilies: { "wiki/areas/": "area" },
  renames: [{ kind: "family", from: "trip", to: "project" }],
  families: [
    {
      family: "project",
      folder: "wiki/projects/",
      noteNames: "any",
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

  function expectRefusedTable(
    table: Record<string, unknown>,
    ...expectedFragments: readonly string[]
  ): ReturnType<typeof runCoreCli> {
    const wiki = familyWikiFixture({ table });
    const run = runCoreCli(["family", "list", "--wiki", wiki]);

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
    for (const fragment of expectedFragments) {
      expect(run.envelope.message).toContain(fragment);
    }
    return run;
  }

  function expectRefusedFamily(
    family: Record<string, unknown>,
    ...expectedFragments: readonly string[]
  ): ReturnType<typeof runCoreCli> {
    return expectRefusedTable({ families: [family] }, ...expectedFragments);
  }

  test("refuses with exit 3 and DOMAIN_PRECONDITION_UNMET on an unknown top-level key, naming the file and key", () => {
    expectRefusedTable(
      { ...minimalTable, unexpectedKey: true },
      "unexpectedKey",
    );
  });

  test("refuses with exit 3 and DOMAIN_PRECONDITION_UNMET on an unknown nested key", () => {
    expectRefusedFamily(
      { ...minimalTable.families[0], extraNestedKey: "bad" },
      "extraNestedKey",
    );
  });

  test("refuses with exit 3 and DOMAIN_PRECONDITION_UNMET when a family field is named tags or another always-rendered field", () => {
    for (const forbidden of ["family", "title", "summary", "created", "tags"]) {
      expectRefusedFamily(
        {
          ...minimalTable.families[0],
          familyFields: [{ name: forbidden, value: "x" }],
        },
        forbidden,
      );
    }
  });

  test("refuses when a family field name does not match ^[a-z][a-z0-9_]*$", () => {
    expectRefusedFamily(
      {
        ...minimalTable.families[0],
        familyFields: [{ name: "Bad-Name", value: "x" }],
      },
      "Bad-Name",
    );
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
      "createdRequired",
      "discoveryTags",
      "families",
      "familyFreeFolders",
      "familyHeader",
      "noteNames",
      "renames",
      "reservedFamilies",
      "summaryMaxLength",
      "summaryRequired",
      "tagLimit",
      "undeclaredFolders",
      "unfiledFolder",
      "uniqueNoteNames",
    ]);
    expect(run.envelope.result.data).toEqual({
      familyHeader: "required",
      undeclaredFolders: "finding",
      baseTag: null,
      discoveryTags: null,
      tagLimit: 2,
      summaryRequired: true,
      summaryMaxLength: 200,
      createdRequired: true,
      noteNames: "title",
      uniqueNoteNames: true,
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
      familyHeader: "required",
      undeclaredFolders: "finding",
      baseTag: null,
      discoveryTags: null,
      tagLimit: null,
      summaryRequired: true,
      summaryMaxLength: null,
      createdRequired: true,
      noteNames: "title",
      uniqueNoteNames: true,
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

  test("refuses noteNames: dated, tagLimit: -1, rootNotes, and subfolders with exit 3 naming the key", () => {
    const family = minimalTable.families[0];
    expectRefusedTable({ ...minimalTable, noteNames: "dated" }, "noteNames");
    expectRefusedFamily({ ...family, noteNames: "dated" }, "noteNames");
    expectRefusedTable({ ...minimalTable, tagLimit: -1 }, "tagLimit");
    expectRefusedTable({ ...minimalTable, rootNotes: "allow" }, "rootNotes");
    expectRefusedFamily({ ...family, rootNotes: "allow" }, "rootNotes");
    expectRefusedTable({ ...minimalTable, subfolders: true }, "subfolders");
    expectRefusedFamily({ ...family, subfolders: true }, "subfolders");
  });

  test("refuses bad values on every table setting naming the key", () => {
    const badSettings: readonly [string, unknown][] = [
      ["familyHeader", "auto"],
      ["undeclaredFolders", "ignore"],
      ["summaryRequired", "yes"],
      ["createdRequired", 1],
      ["uniqueNoteNames", "no"],
    ];

    for (const [key, value] of badSettings) {
      expectRefusedTable({ ...minimalTable, [key]: value }, key);
    }
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
      familyHeader: "required",
      undeclaredFolders: "finding",
      baseTag: null,
      discoveryTags: null,
      tagLimit: 2,
      summaryRequired: true,
      summaryMaxLength: 200,
      createdRequired: true,
      noteNames: "title",
      uniqueNoteNames: true,
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

  const studyFamily = {
    family: "study",
    folder: "wiki/studies/",
    headings: [{ name: "Answer", optional: false }],
  };

  test("refuses a duplicate variant name within a family", () => {
    expectRefusedFamily(
      {
        ...studyFamily,
        variants: [
          { name: "holiday", headings: [{ name: "Deadlines" }] },
          { name: "holiday", headings: [{ name: "Budget" }] },
        ],
      },
      "variants",
      "holiday",
    );
  });

  test("refuses a variant name with a capital letter", () => {
    expectRefusedFamily(
      {
        ...studyFamily,
        variants: [{ name: "Holiday", headings: [{ name: "Deadlines" }] }],
      },
      "variants[0].name",
      "Holiday",
    );
  });

  test("refuses an unknown key inside a variant", () => {
    expectRefusedFamily(
      {
        ...studyFamily,
        variants: [
          {
            name: "holiday",
            extraVariantKey: true,
            headings: [{ name: "Deadlines" }],
          },
        ],
      },
      "extraVariantKey",
    );
  });

  test("refuses optional: false and optional: true on a variant heading as an unknown key", () => {
    for (const optionalValue of [false, true]) {
      expectRefusedFamily(
        {
          ...studyFamily,
          variants: [
            {
              name: "holiday",
              headings: [{ name: "Deadlines", optional: optionalValue }],
            },
          ],
        },
        "Unknown key",
        "optional",
      );
    }
  });

  test("refuses afterVariants on a family without variants", () => {
    const run = expectRefusedFamily(
      {
        family: "project",
        folder: "wiki/projects/",
        headings: [{ name: "Purpose", optional: false, afterVariants: true }],
      },
      "afterVariants",
    );
    expect(run.envelope.message).not.toContain("Unknown key");
  });

  test("refuses an empty variants list", () => {
    const run = expectRefusedFamily(
      { ...studyFamily, variants: [] },
      "variants",
    );
    expect(run.envelope.message).not.toContain("Unknown key");
  });

  test("refuses a family field named variant on a family that declares variants", () => {
    expectRefusedFamily(
      {
        ...studyFamily,
        familyFields: [{ name: "variant", value: "holiday" }],
        variants: [{ name: "holiday", headings: [{ name: "Deadlines" }] }],
      },
      "familyFields",
      "variant",
    );
  });
});
