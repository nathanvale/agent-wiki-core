import { familyCheckFor } from "../family/check.ts";
import { familyDriftFor } from "../family/drift.ts";
import { familyListFor } from "../family/list.ts";
import { familyRenderFor } from "../family/render.ts";
import { noteCheckFor } from "../note/check.ts";
import type { NoteCheckOptions } from "../note/check.ts";

export type WikiCoreOptions = NoteCheckOptions;

export function wikiCoreFor<const Cli extends string>(
  cli: Cli,
  options: WikiCoreOptions,
) {
  return [
    noteCheckFor(cli, options),
    familyCheckFor(cli),
    familyDriftFor(cli),
    familyListFor(cli),
    familyRenderFor(cli),
  ] as const;
}

export { notesCauses as wikiCoreCauses } from "../note/causes.ts";
export { programPath, usePathParser } from "../shared/program-path.ts";
export {
  noInput,
  noWikiRoot,
  preconditionUnmet,
  refused,
  report,
  stringOption,
  succeeded,
  wikiInput,
  wikiOption,
  wikiReadCommand,
  wikiStations,
} from "../shared/wiki-command.ts";
