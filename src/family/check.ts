import { readFamilyTable } from "../shared/family-table.ts";
import { readRecords } from "../shared/markdown-files.ts";
import { wikiInput, wikiReadCommand } from "../shared/wiki-command.ts";
import { checkRecords } from "./rules.ts";
import type { FamilyCheckOptions } from "./rules.ts";

export function familyCheckFor<const Cli extends string>(
  cli: Cli,
  options: FamilyCheckOptions = {},
) {
  const identity: `${Cli}.family.check` = `${cli}.family.check`;
  return wikiReadCommand(
    {
      identity,
      route: ["family", "check"],
      summary:
        "Check every record in the wiki against the note contract and its family's heading rule.",
    },
    wikiInput,
    (wikiRoot) => {
      const loaded = readFamilyTable(wikiRoot);
      if (!loaded.ok) {
        return {
          kind: "refused",
          message: `${loaded.path}: ${loaded.detail}`,
        };
      }
      const records = readRecords(wikiRoot);
      const findings = checkRecords(records, loaded.table, options);
      const noteNoun = records.length === 1 ? "note" : "notes";
      const findingNoun = findings.length === 1 ? "finding" : "findings";
      return {
        message: `Checked ${String(records.length)} ${noteNoun} with ${String(findings.length)} ${findingNoun}.`,
        data: {
          notes: records.length,
          findings,
        },
      };
    },
  );
}
