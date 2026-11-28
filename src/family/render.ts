import { wikiInput, wikiReadCommand } from "../shared/wiki-command.ts";
import { loadRenderedFamilyTemplates } from "./templates.ts";

export function familyRenderFor<const Cli extends string>(cli: Cli) {
  const identity: `${Cli}.family.render` = `${cli}.family.render`;
  return wikiReadCommand(
    {
      identity,
      route: ["family", "render"],
      summary:
        "Render one family template per defined family from the wiki's family table.",
    },
    wikiInput,
    (wikiRoot) => {
      const rendered = loadRenderedFamilyTemplates(wikiRoot);
      if (!rendered.ok) {
        return { kind: "refused", message: rendered.message };
      }
      const count = Object.keys(rendered.familyTemplates).length;
      const noun = count === 1 ? "template" : "templates";
      return {
        message: `Rendered ${String(count)} family ${noun} from family-table.json.`,
        data: { familyTemplates: rendered.familyTemplates },
      };
    },
  );
}
