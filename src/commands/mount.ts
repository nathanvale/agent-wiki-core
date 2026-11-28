import { familyCheckFor } from "../family/check.ts";
import { familyListFor } from "../family/list.ts";
import type { FamilyCheckOptions } from "../family/rules.ts";
import { noteCheckFor } from "../note/check.ts";
import type { NoteCheckOptions } from "../note/check.ts";

export type WikiCoreOptions = NoteCheckOptions & FamilyCheckOptions;

export function wikiCoreFor<const Cli extends string>(
  cli: Cli,
  options: WikiCoreOptions,
) {
  return [
    noteCheckFor(cli, options),
    familyCheckFor(cli, options),
    familyListFor(cli),
  ] as const;
}

export type {
  CrossRecordRules,
  NoteRules,
  WikiRuleFinding,
} from "../family/rules.ts";

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
