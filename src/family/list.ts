import { readFamilyTable } from "../shared/family-table.ts";
import { wikiInput, wikiReadCommand } from "../shared/wiki-command.ts";

export function familyListFor<const Cli extends string>(cli: Cli) {
  const identity: `${Cli}.family.list` = `${cli}.family.list`;
  return wikiReadCommand(
    {
      identity,
      route: ["family", "list"],
      summary:
        "List the families, reserved families, tags, folders and renames in the wiki's family table.",
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
      const count = loaded.table.families.length;
      const noun = count === 1 ? "family" : "families";
      return {
        message: `${String(count)} ${noun} declared in family-table.json.`,
        data: loaded.table,
      };
    },
  );
}
