import { describe, expect, test } from "bun:test";
import {
  checkNoteNames,
  checkTableSettings,
  tableSettingKeys,
} from "../src/family-table/settings/rules.ts";
import type {
  FamilyHeaderSetting,
  NoteNamesSetting,
  TableSettings,
  UndeclaredFoldersSetting,
} from "../src/family-table/settings/rules.ts";
import {
  familyWikiFixture,
  readFamilyCheckRun,
  runCoreCli,
} from "./support/family-wiki.ts";
import type { ObservedFinding } from "./support/family-wiki.ts";

const baseTable = {
  families: [
    {
      family: "project",
      folder: "wiki/projects/",
      headings: [{ name: "Purpose", optional: false }],
    },
  ],
};

type NoteOptions = {
  readonly family?: string | null;
  readonly heading?: string;
  readonly summary?: string | null;
  readonly created?: string | null;
  readonly tags?: readonly string[];
  readonly purpose?: string | null;
};

function projectNote(overrides: NoteOptions = {}): string {
  const family = overrides.family === undefined ? "project" : overrides.family;
  const heading = overrides.heading ?? "Sample Project";
  const summary =
    overrides.summary === undefined ? "Deliver the widget." : overrides.summary;
  const created =
    overrides.created === undefined ? "2026-11-28" : overrides.created;
  const tags = overrides.tags ?? [];
  const purpose =
    overrides.purpose === undefined
      ? "Ship the first version."
      : overrides.purpose;
  const lines = ["---"];
  if (family !== null) lines.push(`family: ${family}`);
  if (summary !== null) lines.push(`summary: "${summary}"`);
  if (created !== null) lines.push(`created: ${created}`);
  lines.push(`tags: [${tags.join(", ")}]`, "---", "", `# ${heading}`);
  if (purpose !== null) lines.push("", "## Purpose", "", purpose);
  return `${lines.join("\n")}\n`;
}

function checkKinds(
  table: Record<string, unknown>,
  notes: Readonly<Record<string, string>>,
): readonly string[] {
  const wiki = familyWikiFixture({ table, notes });
  const run = readFamilyCheckRun(
    runCoreCli(["family", "check", "--wiki", wiki], 10_000),
  );
  expect(run.exitCode).toBe(0);
  expect(run.causeCode).toBe("SUCCESS_UNCHANGED");
  return run.findings.map(
    (finding: ObservedFinding) => `${finding.path}|${finding.kind}`,
  );
}

describe("table settings toggle their policy rule kinds", () => {
  test("familyHeader toggles family-missing while keeping folder headings and family-mismatch", () => {
    const notes = {
      "wiki/projects/no-family.md": projectNote({
        family: null,
        heading: "No Family",
      }),
    };

    expect(
      checkKinds({ ...baseTable, familyHeader: "required" }, notes),
    ).toEqual(["wiki/projects/no-family.md|family-missing"]);
    expect(
      checkKinds({ ...baseTable, familyHeader: "from-folder" }, notes),
    ).toEqual([]);

    const missingHeading = {
      "wiki/projects/no-heading.md": projectNote({
        family: null,
        heading: "No Heading",
        purpose: null,
      }),
    };
    expect(
      checkKinds({ ...baseTable, familyHeader: "from-folder" }, missingHeading),
    ).toEqual(["wiki/projects/no-heading.md|required-section-empty"]);

    const wrongFamily = {
      "wiki/projects/wrong.md": projectNote({
        family: "area",
        heading: "Wrong",
      }),
    };
    expect(
      checkKinds(
        {
          ...baseTable,
          reservedFamilies: { "wiki/areas/": "area" },
          familyHeader: "from-folder",
        },
        wrongFamily,
      ),
    ).toEqual(["wiki/projects/wrong.md|family-mismatch"]);
  });

  test("undeclaredFolders toggles unknown-folder only", () => {
    const notes = {
      "wiki/misc/loose.md": projectNote({ heading: "Loose" }),
    };

    expect(
      checkKinds({ ...baseTable, undeclaredFolders: "finding" }, notes),
    ).toEqual(["wiki/misc/loose.md|unknown-folder"]);
    expect(
      checkKinds({ ...baseTable, undeclaredFolders: "family-free" }, notes),
    ).toEqual([]);
  });

  test("baseTag toggles base-tag-missing only", () => {
    const notes = {
      "wiki/projects/untagged.md": projectNote({
        heading: "Untagged",
        tags: [],
      }),
    };

    expect(
      checkKinds({ ...baseTable, baseTag: "example-wiki" }, notes),
    ).toEqual(["wiki/projects/untagged.md|base-tag-missing"]);
    expect(checkKinds({ ...baseTable, baseTag: null }, notes)).toEqual([]);
  });

  test("discoveryTags toggles unapproved-tag only", () => {
    const notes = {
      "wiki/projects/extra-tag.md": projectNote({
        heading: "Extra Tag",
        tags: ["unlisted"],
      }),
    };

    expect(
      checkKinds({ ...baseTable, discoveryTags: ["home"] }, notes),
    ).toEqual(["wiki/projects/extra-tag.md|unapproved-tag"]);
    expect(checkKinds({ ...baseTable, discoveryTags: null }, notes)).toEqual(
      [],
    );
  });

  test("tagLimit toggles too-many-tags only", () => {
    const notes = {
      "wiki/projects/many-tags.md": projectNote({
        heading: "Many Tags",
        tags: ["a", "b", "c"],
      }),
    };

    expect(checkKinds({ ...baseTable, tagLimit: 2 }, notes)).toEqual([
      "wiki/projects/many-tags.md|too-many-tags",
    ]);
    expect(checkKinds({ ...baseTable, tagLimit: null }, notes)).toEqual([]);
  });

  test("summaryRequired toggles summary-missing without disabling summary-too-long", () => {
    const missingSummary = {
      "wiki/projects/no-summary.md": projectNote({
        heading: "No Summary",
        summary: null,
      }),
    };

    expect(
      checkKinds({ ...baseTable, summaryRequired: true }, missingSummary),
    ).toEqual(["wiki/projects/no-summary.md|summary-missing"]);
    expect(
      checkKinds({ ...baseTable, summaryRequired: false }, missingSummary),
    ).toEqual([]);

    const longSummary = {
      "wiki/projects/long-summary.md": projectNote({
        heading: "Long Summary",
        summary: "a".repeat(25),
      }),
    };
    expect(
      checkKinds(
        { ...baseTable, summaryRequired: false, summaryMaxLength: 20 },
        longSummary,
      ),
    ).toEqual(["wiki/projects/long-summary.md|summary-too-long"]);
  });

  test("summaryMaxLength toggles summary-too-long only", () => {
    const notes = {
      "wiki/projects/long-summary.md": projectNote({
        heading: "Long Summary",
        summary: "a".repeat(25),
      }),
    };

    expect(checkKinds({ ...baseTable, summaryMaxLength: 20 }, notes)).toEqual([
      "wiki/projects/long-summary.md|summary-too-long",
    ]);
    expect(checkKinds({ ...baseTable, summaryMaxLength: null }, notes)).toEqual(
      [],
    );
  });

  test("createdRequired toggles created-missing only", () => {
    const notes = {
      "wiki/projects/no-created.md": projectNote({
        heading: "No Created",
        created: null,
      }),
    };

    expect(checkKinds({ ...baseTable, createdRequired: true }, notes)).toEqual([
      "wiki/projects/no-created.md|created-missing",
    ]);
    expect(checkKinds({ ...baseTable, createdRequired: false }, notes)).toEqual(
      [],
    );
  });

  test("noteNames toggles name-mismatch and a family dated-title clears dated names for its own notes only", () => {
    const mismatched = {
      "wiki/projects/wrong-name.md": projectNote({ heading: "Right Name" }),
    };

    expect(
      checkKinds({ ...baseTable, noteNames: "title" }, mismatched),
    ).toEqual(["wiki/projects/wrong-name.md|name-mismatch"]);
    expect(checkKinds({ ...baseTable, noteNames: "any" }, mismatched)).toEqual(
      [],
    );

    const datedNotes = {
      "wiki/meetings/2026-01-05-weekly-sync.md": projectNote({
        family: "meeting",
        heading: "Weekly Sync",
        created: "2026-01-05",
      }),
      "wiki/projects/2026-01-05-launch-plan.md": projectNote({
        family: "project",
        heading: "Launch Plan",
        created: "2026-01-05",
      }),
    };

    const twoFamilyTable = {
      families: [
        ...baseTable.families,
        {
          family: "meeting",
          folder: "wiki/meetings/",
          headings: [{ name: "Purpose", optional: false }],
        },
      ],
    };

    expect(checkKinds(twoFamilyTable, datedNotes)).toEqual([
      "wiki/meetings/2026-01-05-weekly-sync.md|name-mismatch",
      "wiki/projects/2026-01-05-launch-plan.md|name-mismatch",
    ]);

    const datedMeetingsTable = {
      families: [
        ...baseTable.families,
        {
          family: "meeting",
          folder: "wiki/meetings/",
          noteNames: "dated-title",
          headings: [{ name: "Purpose", optional: false }],
        },
      ],
    };

    expect(checkKinds(datedMeetingsTable, datedNotes)).toEqual([
      "wiki/projects/2026-01-05-launch-plan.md|name-mismatch",
    ]);
  });

  test("uniqueNoteNames toggles shared-note-name only", () => {
    const notes = {
      "wiki/projects/shared.md": projectNote({ heading: "Shared" }),
      "wiki/archive/shared.md": projectNote({
        family: null,
        heading: "Shared",
        purpose: null,
      }),
    };

    expect(
      checkKinds(
        {
          ...baseTable,
          familyFreeFolders: ["wiki/archive/"],
          uniqueNoteNames: true,
        },
        notes,
      ),
    ).toEqual([
      "wiki/archive/shared.md|shared-note-name",
      "wiki/projects/shared.md|shared-note-name",
    ]);
    expect(
      checkKinds(
        {
          ...baseTable,
          familyFreeFolders: ["wiki/archive/"],
          uniqueNoteNames: false,
        },
        notes,
      ),
    ).toEqual([]);
  });
});

describe("hard rules and null-safe unfiled placement", () => {
  test("a note with family directly under wiki/ gives outside-family-folder under every setting", () => {
    const notes = {
      "wiki/stray.md": projectNote({
        heading: "Stray",
        summary: null,
        created: null,
        tags: [],
      }),
    };

    const relaxedTable = {
      ...baseTable,
      familyHeader: "from-folder",
      undeclaredFolders: "family-free",
      baseTag: null,
      discoveryTags: null,
      tagLimit: null,
      summaryRequired: false,
      summaryMaxLength: null,
      createdRequired: false,
      noteNames: "any",
      uniqueNoteNames: false,
      unfiledFolder: null,
    };

    expect(checkKinds(relaxedTable, notes)).toEqual([
      "wiki/stray.md|outside-family-folder",
    ]);

    const strictTable = {
      ...baseTable,
      familyHeader: "required",
      undeclaredFolders: "finding",
      summaryRequired: true,
      createdRequired: true,
      unfiledFolder: "wiki/inbox/",
    };

    expect(checkKinds(strictTable, notes)).toEqual([
      "wiki/stray.md|outside-family-folder",
      "wiki/stray.md|created-missing",
      "wiki/stray.md|summary-missing",
    ]);
  });

  test("unfiled placement is null-safe when unfiledFolder is null", () => {
    const notes = {
      "wiki/stray.md": projectNote({ heading: "Stray" }),
      "wiki/projects/stray.md": projectNote({ heading: "Stray" }),
      "wiki/inbox/draft.md": projectNote({ family: null, heading: "Draft" }),
    };

    expect(checkKinds({ ...baseTable, unfiledFolder: null }, notes)).toEqual([
      "wiki/inbox/draft.md|unknown-folder",
      "wiki/stray.md|outside-family-folder",
      "wiki/projects/stray.md|shared-note-name",
      "wiki/stray.md|shared-note-name",
    ]);
  });
});

describe("table setting types and validators share one sealed vocabulary", () => {
  test("every setting value and key accepted by the types is accepted by the validators, and no unlisted value is accepted", () => {
    const familyHeaderValues = {
      required: true,
      "from-folder": true,
    } as const satisfies Record<FamilyHeaderSetting, true>;
    const undeclaredFoldersValues = {
      finding: true,
      "family-free": true,
    } as const satisfies Record<UndeclaredFoldersSetting, true>;
    const noteNamesValues = {
      title: true,
      "dated-title": true,
      any: true,
    } as const satisfies Record<NoteNamesSetting, true>;
    const settingKeyMap = {
      familyHeader: true,
      undeclaredFolders: true,
      summaryRequired: true,
      createdRequired: true,
      noteNames: true,
      uniqueNoteNames: true,
    } as const satisfies Record<keyof TableSettings, true>;

    expect<readonly string[]>([...tableSettingKeys].sort()).toEqual(
      Object.keys(settingKeyMap).sort(),
    );

    const familyHeaderList = Object.keys(familyHeaderValues);
    for (const value of familyHeaderList) {
      const checked = checkTableSettings({ familyHeader: value });
      expect(checked.ok).toBe(true);
      if (checked.ok) expect<string>(checked.value.familyHeader).toBe(value);
    }
    expect(checkTableSettings({ familyHeader: "__invalid__" })).toEqual({
      ok: false,
      detail: `Key "familyHeader" must be one of ${familyHeaderList.map((v) => `"${v}"`).join(", ")}.`,
    });

    const undeclaredFoldersList = Object.keys(undeclaredFoldersValues);
    for (const value of undeclaredFoldersList) {
      const checked = checkTableSettings({ undeclaredFolders: value });
      expect(checked.ok).toBe(true);
      if (checked.ok) {
        expect<string>(checked.value.undeclaredFolders).toBe(value);
      }
    }
    expect(checkTableSettings({ undeclaredFolders: "__invalid__" })).toEqual({
      ok: false,
      detail: `Key "undeclaredFolders" must be one of ${undeclaredFoldersList.map((v) => `"${v}"`).join(", ")}.`,
    });

    const noteNamesList = Object.keys(noteNamesValues);
    for (const value of noteNamesList) {
      const checked = checkTableSettings({ noteNames: value });
      expect(checked.ok).toBe(true);
      if (checked.ok) expect<string>(checked.value.noteNames).toBe(value);
      const checkedNoteNames = checkNoteNames(value, "noteNames");
      expect(checkedNoteNames.ok).toBe(true);
      if (checkedNoteNames.ok) {
        expect<string>(checkedNoteNames.value).toBe(value);
      }
    }
    const noteNamesExpectedDetail = `Key "noteNames" must be one of ${noteNamesList.map((v) => `"${v}"`).join(", ")}.`;
    expect(checkTableSettings({ noteNames: "__invalid__" })).toEqual({
      ok: false,
      detail: noteNamesExpectedDetail,
    });
    expect(checkNoteNames("__invalid__", "noteNames")).toEqual({
      ok: false,
      detail: noteNamesExpectedDetail,
    });
  });
});
