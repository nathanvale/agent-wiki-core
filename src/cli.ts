import { commands } from "./commands.ts";
import { contractFor, runProcess } from "agent-cli-kernel";

const contract = contractFor({
  cli: "wiki-core",
  commands,
  installedAddons: [],
});

await runProcess(contract)(process.argv.slice(2));
