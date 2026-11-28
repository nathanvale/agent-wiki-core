import { wikiInput, wikiReadCommand } from "../shared/wiki-command.ts";
import { templateDriftFindings } from "./rules.ts";
import {
  loadRenderedFamilyTemplates,
  readInstalledFamilyTemplates,
} from "./templates.ts";

export function familyDriftFor<const Cli extends string>(cli: Cli) {
  const identity: `${Cli}.family.drift` = `${cli}.family.drift`;
  return wikiReadCommand(
    {
      identity,
      route: ["family", "drift"],
      summary:
        "Compare installed family templates against the wiki's family table.",
    },
    wikiInput,
    (wikiRoot) => {
      const rendered = loadRenderedFamilyTemplates(wikiRoot);
      if (!rendered.ok) {
        return { kind: "refused", message: rendered.message };
      }
      const installed = readInstalledFamilyTemplates(wikiRoot);
      const findings = templateDriftFindings(
        rendered.familyTemplates,
        installed,
      );
      const count = findings.length;
      const noun = count === 1 ? "finding" : "findings";
      return {
        message:
          count === 0
            ? "No template drift found."
            : `${String(count)} template drift ${noun}.`,
        data: { findings },
      };
    },
  );
}
