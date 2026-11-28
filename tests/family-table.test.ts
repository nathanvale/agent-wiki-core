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

  function expectRefusedTable(
    table: Record<string, unknown>,
    expectedKey: string,
  ): void {
    const wiki = familyWikiFixture({ table });
    const run = runCoreCli(["family", "list", "--wiki", wiki]);

    expect(run.exitCode).toBe(3);
    expect(run.envelope.result.causeCode).toBe("DOMAIN_PRECONDITION_UNMET");
    expect(run.envelope.message).toContain("family-table.json");
    expect(run.envelope.message).toContain(expectedKey);
  }

  test("refuses noteNames: dated, tagLimit: -1, rootNotes, and subfolders with exit 3 naming the key", () => {
    const cases: readonly {
      readonly expectedKey: string;
      readonly table: Record<string, unknown>;
    }[] = [
      {
        expectedKey: "noteNames",
        table: { ...minimalTable, noteNames: "dated" },
      },
      {
        expectedKey: "noteNames",
        table: {
          families: [
            {
              ...minimalTable.families[0],
              noteNames: "dated",
            },
          ],
        },
      },
      {
        expectedKey: "tagLimit",
        table: { ...minimalTable, tagLimit: -1 },
      },
      {
        expectedKey: "rootNotes",
        table: { ...minimalTable, rootNotes: "allow" },
      },
      {
        expectedKey: "rootNotes",
        table: {
          families: [
            {
              ...minimalTable.families[0],
              rootNotes: "allow",
            },
          ],
        },
      },
      {
        expectedKey: "subfolders",
        table: { ...minimalTable, subfolders: true },
      },
      {
        expectedKey: "subfolders",
        table: {
          families: [
            {
              ...minimalTable.families[0],
              subfolders: true,
            },
          ],
        },
      },
    ];

    for (const entry of cases) {
      expectRefusedTable(entry.table, entry.expectedKey);
    }
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
});
