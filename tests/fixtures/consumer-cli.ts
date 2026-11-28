import { resolve } from "node:path";
import type { CauseTable } from "agent-cli-kernel";
import {
  command,
  commonCauses,
  contractFor,
  runProcess,
} from "agent-cli-kernel";
import { diagnosticsAddon } from "agent-cli-kernel/addons/diagnostics";
import { programsAddon } from "agent-cli-kernel/addons/programs";
import {
  noInput,
  preconditionUnmet,
  report,
  stringOption,
  succeeded,
  usePathParser,
  wikiCoreCauses,
  wikiCoreFor,
  wikiInput,
  wikiOption,
  wikiReadCommand,
  wikiStations,
  withWikiRoot,
} from "agent-wiki-core/commands";
import type {
  CrossRecordRules,
  NoteRules,
  WikiRuleFinding,
} from "agent-wiki-core/commands";
import {
  readBytesInWiki,
  readFolderNotes,
  readRenameInputs,
  readTextIfExists,
  readWikiMarkdownTexts,
} from "agent-wiki-core/notes";

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

const pathOption = stringOption(
  "--path",
  "Relative path inside the wiki root.",
  true,
);
const optionalPathOption = stringOption(
  "--path",
  "Relative path inside the wiki root.",
  false,
);
const folderOption = stringOption(
  "--folder",
  "Folder inside the wiki root to read.",
  true,
);
const optionalFolderOption = stringOption(
  "--folder",
  "Folder inside the wiki root to read.",
  false,
);
const excludeOption = stringOption(
  "--exclude",
  "Folder name to exclude from the walk.",
  false,
);

const readerChoiceOption = {
  name: "--reader",
  aliases: [],
  summary: "Which wiki core reader to run.",
  required: true,
  repeatable: false,
  value: {
    kind: "string",
    minLength: 1,
    maxLength: 64,
    choices: [
      "rename-inputs",
      "text-if-exists",
      "bytes-in-wiki",
      "wiki-markdown-texts",
      "folder-notes",
    ],
    pattern: null,
  },
} as const;

const asyncFlagOption = {
  name: "--async",
  aliases: [],
  summary: "Run the reader asynchronously inside withWikiRoot.",
  required: false,
  repeatable: false,
  value: null,
} as const;

const cliName = "fixture-wiki";

function runBytesSummary(wikiRoot: string, relativePath: string) {
  const bytes = readBytesInWiki(wikiRoot, relativePath);
  return {
    byteLength: bytes.byteLength,
    bufferByteLength: bytes.buffer.byteLength,
  };
}

function runRenameSummary(wikiRoot: string) {
  const inputs = readRenameInputs(wikiRoot);
  return {
    markdownCount: inputs.markdownFiles.length,
    textCount: inputs.texts.size,
    pathCount: inputs.paths.size,
  };
}

function runTextSummary(wikiRoot: string, relativePath: string) {
  const text = readTextIfExists(wikiRoot, relativePath);
  return {
    present: text !== null,
    length: text?.length ?? 0,
  };
}

function runMarkdownTextsSummary(wikiRoot: string, excludeFolder: string) {
  const texts = readWikiMarkdownTexts(wikiRoot, excludeFolder);
  return { count: texts.size };
}

function runFolderNotesSummary(wikiRoot: string, folder: string) {
  const notes = readFolderNotes(wikiRoot, folder);
  return { count: notes.length };
}

const renameInputsCommand = wikiReadCommand(
  {
    identity: `${cliName}.reader.rename-inputs`,
    route: ["reader", "rename-inputs"],
    summary: "Run readRenameInputs on a wiki root.",
  },
  wikiInput,
  (wikiRoot) => ({
    message: "Rename inputs read.",
    data: runRenameSummary(wikiRoot),
  }),
);

const textIfExistsCommand = wikiReadCommand(
  {
    identity: `${cliName}.reader.text-if-exists`,
    route: ["reader", "text-if-exists"],
    summary: "Run readTextIfExists on a wiki root and path.",
  },
  { ...noInput, options: [wikiOption, pathOption] } as const,
  (wikiRoot, parsed) => ({
    message: "Text read.",
    data: runTextSummary(wikiRoot, parsed["--path"]),
  }),
);

const bytesInWikiCommand = wikiReadCommand(
  {
    identity: `${cliName}.reader.bytes-in-wiki`,
    route: ["reader", "bytes-in-wiki"],
    summary: "Run readBytesInWiki on a wiki root and path.",
  },
  { ...noInput, options: [wikiOption, pathOption] } as const,
  (wikiRoot, parsed) => ({
    message: "Bytes read.",
    data: runBytesSummary(wikiRoot, parsed["--path"]),
  }),
);

const wikiMarkdownTextsCommand = wikiReadCommand(
  {
    identity: `${cliName}.reader.wiki-markdown-texts`,
    route: ["reader", "wiki-markdown-texts"],
    summary: "Run readWikiMarkdownTexts on a wiki root.",
  },
  { ...noInput, options: [wikiOption, excludeOption] } as const,
  (wikiRoot, parsed) => ({
    message: "Wiki markdown texts read.",
    data: runMarkdownTextsSummary(wikiRoot, parsed["--exclude"] ?? ""),
  }),
);

const folderNotesCommand = wikiReadCommand(
  {
    identity: `${cliName}.reader.folder-notes`,
    route: ["reader", "folder-notes"],
    summary: "Run readFolderNotes on a wiki root and folder.",
  },
  { ...noInput, options: [wikiOption, folderOption] } as const,
  (wikiRoot, parsed) => ({
    message: "Folder notes read.",
    data: runFolderNotesSummary(wikiRoot, parsed["--folder"]),
  }),
);

function runSelectedReader(
  wikiRoot: string,
  reader: string,
  options: {
    readonly path: string | undefined;
    readonly folder: string | undefined;
    readonly exclude: string | undefined;
  },
) {
  switch (reader) {
    case "rename-inputs":
      return runRenameSummary(wikiRoot);
    case "text-if-exists":
      return runTextSummary(wikiRoot, options.path ?? "");
    case "bytes-in-wiki":
      return runBytesSummary(wikiRoot, options.path ?? "");
    case "wiki-markdown-texts":
      return runMarkdownTextsSummary(wikiRoot, options.exclude ?? "");
    case "folder-notes":
      return runFolderNotesSummary(wikiRoot, options.folder ?? "wiki");
    default:
      throw new Error(`Unknown reader: ${reader}`);
  }
}

const plainReadIdentity = `${cliName}.plain.read` as const;
const plainReadCommand = command({
  identity: plainReadIdentity,
  route: ["plain", "read"],
  summary: "Run a wiki core reader directly through withWikiRoot.",
  input: {
    ...noInput,
    options: [
      wikiOption,
      readerChoiceOption,
      optionalPathOption,
      optionalFolderOption,
      excludeOption,
      asyncFlagOption,
    ],
  },
  capabilities: {},
  stations: wikiStations(plainReadIdentity),
  run: async (parsed, context) => {
    const options = {
      path: parsed["--path"],
      folder: parsed["--folder"],
      exclude: parsed["--exclude"],
    };
    const outcome =
      parsed["--async"] === true
        ? await withWikiRoot(parsed["--wiki"], async (wikiRoot) => {
            await Promise.resolve();
            return runSelectedReader(wikiRoot, parsed["--reader"], options);
          })
        : withWikiRoot(parsed["--wiki"], (wikiRoot) =>
            runSelectedReader(wikiRoot, parsed["--reader"], options),
          );
    if (!outcome.ok) {
      return context.result(
        preconditionUnmet(plainReadIdentity),
        outcome.refusal,
      );
    }
    return context.result(
      succeeded(plainReadIdentity),
      report("Plain reader read.", outcome.value),
    );
  },
});

const repoRoot = resolve(import.meta.dirname, "../..");
const commands = [
  ...wikiCoreFor(cliName, {
    repoRoot,
    environment: process.env,
    noteRules,
    crossRecordRules,
  }),
  renameInputsCommand,
  textIfExistsCommand,
  bytesInWikiCommand,
  wikiMarkdownTextsCommand,
  folderNotesCommand,
  plainReadCommand,
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
