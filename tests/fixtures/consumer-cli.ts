import { resolve } from "node:path";
import type { CauseTable } from "agent-cli-kernel";
import { commonCauses, contractFor, runProcess } from "agent-cli-kernel";
import { diagnosticsAddon } from "agent-cli-kernel/addons/diagnostics";
import { programsAddon } from "agent-cli-kernel/addons/programs";
import {
  usePathParser,
  wikiCoreCauses,
  wikiCoreFor,
} from "agent-wiki-core/commands";
import type {
  CrossRecordRules,
  NoteRules,
  WikiRuleFinding,
} from "agent-wiki-core/commands";

const noteRuleMarker = "WIKI_RULE_MARKER";

const noteRules: NoteRules = (note, family, table) => {
  if (!note.text.includes(noteRuleMarker)) return [];
  const familyLabel = family?.family ?? "none";
  const baseTagLabel = table.baseTag ?? "none";
  return [
    {
      path: note.path,
      kind: "fixture-note-rule",
      detail: `Marker found in family=${familyLabel} baseTag=${baseTagLabel}.`,
    },
  ];
};

const crossRecordRules: CrossRecordRules = (records, table) => {
  const byRecordId = new Map<string, string[]>();
  for (const record of records) {
    if (record.recordId === null || record.recordId === "") continue;
    const paths = byRecordId.get(record.recordId) ?? [];
    paths.push(record.path);
    byRecordId.set(record.recordId, paths);
  }
  const uniquePaths = new Set(records.map((record) => record.path)).size;
  const findings: WikiRuleFinding[] = [];
  for (const [recordId, paths] of byRecordId) {
    if (paths.length < 2) continue;
    const sortedPaths = paths.toSorted();
    findings.push({
      path: sortedPaths[0] ?? "",
      kind: "duplicate-record-id",
      detail: `Duplicate record_id "${recordId}" across ${sortedPaths.join(", ")} (records=${String(records.length)}, unique=${String(uniquePaths)}, families=${String(table.families.length)}).`,
    });
  }
  return findings;
};

const repoRoot = resolve(import.meta.dirname, "../..");
const cliName = "fixture-wiki";
const commands = [
  ...wikiCoreFor(cliName, {
    repoRoot,
    environment: process.env,
    noteRules,
    crossRecordRules,
  }),
] as const;

const causes = {
  ...commonCauses,
  ...wikiCoreCauses,
} as const satisfies CauseTable;

const argv = process.argv.slice(2);
const contract = contractFor({
  cli: cliName,
  commands,
  causes,
  installedAddons: ["programs", "diagnostics"],
});
usePathParser(contract.boundary.path);

await runProcess(contract, {
  addons: {
    programs: programsAddon(),
    diagnostics: diagnosticsAddon({
      cli: cliName,
      environment: process.env,
      argv,
    }),
  },
})(argv);
