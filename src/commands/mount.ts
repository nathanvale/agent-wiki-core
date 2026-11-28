import { noteCheckFor } from "../note/check.ts";
import type { NoteCheckOptions } from "../note/check.ts";

export type WikiCoreOptions = NoteCheckOptions;

export function wikiCoreFor<const Cli extends string>(
  cli: Cli,
  options: WikiCoreOptions,
) {
  return [noteCheckFor(cli, options)] as const;
}

export { notesCauses as wikiCoreCauses } from "../note/causes.ts";
export { programPath, usePathParser } from "../shared/program-path.ts";
export {
  noInput,
  noInputCommand,
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
