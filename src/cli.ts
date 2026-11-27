import type { CauseTable } from "agent-cli-kernel";
import { commonCauses, contractFor, runProcess } from "agent-cli-kernel";
import { diagnosticsAddon } from "agent-cli-kernel/addons/diagnostics";
import { programsAddon } from "agent-cli-kernel/addons/programs";
import { commands } from "./commands.ts";
import { notesCauses } from "./note/causes.ts";
import { useNoteCheckEnvironment } from "./note/check-environment.ts";
import { usePathParser } from "./shared/program-path.ts";

const coreCauses = {
  ...commonCauses,
  ...notesCauses,
} as const satisfies CauseTable;

const argv = process.argv.slice(2);
const contract = contractFor({
  cli: "agent-wiki-core",
  commands,
  causes: coreCauses,
  installedAddons: ["programs", "diagnostics"],
});
usePathParser(contract.boundary.path);
useNoteCheckEnvironment(process.env);

await runProcess(contract, {
  addons: {
    programs: programsAddon(),
    diagnostics: diagnosticsAddon({
      cli: "agent-wiki-core",
      environment: process.env,
      argv,
    }),
  },
})(argv);
