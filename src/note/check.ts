import { command, commonCauses, station } from "agent-cli-kernel";
import { notesCauses } from "./causes.ts";
import { defaultNotesBudgetMilliseconds, runNoteCheck } from "./check-run.ts";
import { parseNoteCheckEnvironment } from "./check-environment.ts";
import type { NotesEnvironment } from "./check-environment.ts";
import { pinnedRumdlVersion } from "./rules.ts";
import { canonicalWikiRoot } from "../shared/markdown-files.ts";
import { programPath } from "../shared/program-path.ts";
import { canonicalRouteNames } from "../shared/rules.ts";
import { refused, report, wikiInput } from "../shared/wiki-command.ts";

const noteCheckCauses = {
  ...commonCauses,
  ...notesCauses,
} as const;

const stationWords = {
  retryDelayPolicy: { kind: "none" },
  reachability: "required",
  unreachableRationale: null,
} as const;

export type NoteCheckOptions = {
  readonly repoRoot: string;
  readonly environment: NotesEnvironment;
};

export function noteCheckFor<const Cli extends string>(
  cli: Cli,
  options: NoteCheckOptions,
) {
  const noteCheckIdentity: `${Cli}.note.check` = `${cli}.note.check`;

  const noteCheckStations = [
    station(noteCheckCauses, {
      ...stationWords,
      commandIdentity: noteCheckIdentity,
      causeCode: "SUCCESS_UNCHANGED" satisfies keyof typeof commonCauses,
      trigger: "Every note and family template passed the Markdown check.",
      repairAction: null,
      guidance: { next: { kind: "done" } },
      independentObservable: `${noteCheckIdentity}:clean`,
    }),
    station(noteCheckCauses, {
      ...stationWords,
      commandIdentity: noteCheckIdentity,
      causeCode:
        "DOMAIN_PRECONDITION_UNMET" satisfies keyof typeof commonCauses,
      trigger: `The wiki root, a symlink under wiki/ or templates/, the rumdl settings file or a ${canonicalRouteNames.noteCheck} environment override cannot be used as given.`,
      repairAction: `Check that the --wiki path contains a wiki/ folder, that neither templates/ nor anything under wiki/ or templates/ is a symlink, that .rumdl.toml exists in the repository root, and that each environment override named in the message is valid or unset, then run ${canonicalRouteNames.noteCheck} again.`,
      guidance: {
        next: {
          kind: "instruction",
          text: `Correct the wiki root path, replace the named symlink with what it points at, restore .rumdl.toml, or fix or unset the named environment override, then run ${canonicalRouteNames.noteCheck} again.`,
        },
      },
      independentObservable: `${noteCheckIdentity}:precondition`,
    }),
    station(noteCheckCauses, {
      ...stationWords,
      commandIdentity: noteCheckIdentity,
      causeCode: "DOMAIN_NOTES_LINTER_MISSING",
      trigger: `Pinned rumdl ${pinnedRumdlVersion} is missing or not executable.`,
      repairAction: `Run bun install --frozen-lockfile in the repository root to install pinned rumdl ${pinnedRumdlVersion}.`,
      guidance: {
        next: {
          kind: "instruction",
          text: `Run bun install --frozen-lockfile to install pinned rumdl ${pinnedRumdlVersion}, then run ${canonicalRouteNames.noteCheck} again.`,
        },
      },
      independentObservable: `${noteCheckIdentity}:linter-missing`,
    }),
    station(noteCheckCauses, {
      ...stationWords,
      commandIdentity: noteCheckIdentity,
      causeCode: "DOMAIN_NOTES_LINTER_VERSION_MISMATCH",
      trigger: `The installed rumdl binary does not match pinned version ${pinnedRumdlVersion}.`,
      repairAction: `Run bun install --frozen-lockfile so the installed rumdl matches pinned version ${pinnedRumdlVersion}.`,
      guidance: {
        next: {
          kind: "instruction",
          text: `Reinstall dependencies with bun install --frozen-lockfile to restore rumdl ${pinnedRumdlVersion}, then run ${canonicalRouteNames.noteCheck} again.`,
        },
      },
      independentObservable: `${noteCheckIdentity}:version-mismatch`,
    }),
    station(noteCheckCauses, {
      ...stationWords,
      commandIdentity: noteCheckIdentity,
      causeCode: "DOMAIN_NOTES_LINTER_FAILED",
      trigger:
        "rumdl timed out, exited with an unexpected status, reported an unknown configured rule, produced unreadable JSON output, or .rumdl.toml could not be read or parsed.",
      repairAction: `Inspect the rumdl output in the message and verify .rumdl.toml syntax, then run ${canonicalRouteNames.noteCheck} again.`,
      guidance: {
        next: {
          kind: "instruction",
          text: `Inspect the rumdl failure details and .rumdl.toml, fix the setup, and run ${canonicalRouteNames.noteCheck} again.`,
        },
      },
      independentObservable: `${noteCheckIdentity}:linter-failed`,
    }),
    station(noteCheckCauses, {
      ...stationWords,
      commandIdentity: noteCheckIdentity,
      causeCode: "DOMAIN_NOTES_CHECK_BUDGET_EXCEEDED",
      trigger: `rumdl check took longer than the ${String(defaultNotesBudgetMilliseconds)} ms duration budget.`,
      repairAction: `Inspect the diagnostics log for slow files, move generated Markdown out of wiki/ and templates/ (${canonicalRouteNames.noteCheck} reads every Markdown file there, whatever .gitignore says), and run ${canonicalRouteNames.noteCheck} again.`,
      guidance: {
        next: {
          kind: "instruction",
          text: `Inspect the diagnostics log for the cause of the slowdown, remove oversized non-wiki files or move them out of wiki/ and templates/, and run ${canonicalRouteNames.noteCheck} again.`,
        },
      },
      independentObservable: `${noteCheckIdentity}:budget-exceeded`,
    }),
    station(noteCheckCauses, {
      ...stationWords,
      commandIdentity: noteCheckIdentity,
      causeCode: "DOMAIN_NOTES_BROKEN_LINKS",
      trigger: "One or more notes contain broken or malformed links.",
      repairAction: `Point each broken link at an existing note, fix malformed link syntax, or remove the link, then run ${canonicalRouteNames.noteCheck} again.`,
      guidance: {
        next: {
          kind: "instruction",
          text: `Apply each link Repair named in the message (point it at an existing note), then run ${canonicalRouteNames.noteCheck} again.`,
        },
      },
      independentObservable: `${noteCheckIdentity}:broken-links`,
    }),
    station(noteCheckCauses, {
      ...stationWords,
      commandIdentity: noteCheckIdentity,
      causeCode: "DOMAIN_NOTES_HEADING_STRUCTURE",
      trigger:
        "One or more notes break heading level, spacing, or properties-block structure rules.",
      repairAction: `Apply each heading Repair named in the message so headings increment cleanly without skipping levels, then run ${canonicalRouteNames.noteCheck} again.`,
      guidance: {
        next: {
          kind: "instruction",
          text: `Fix each heading finding named in the message, then run ${canonicalRouteNames.noteCheck} again.`,
        },
      },
      independentObservable: `${noteCheckIdentity}:heading-structure`,
    }),
    station(noteCheckCauses, {
      ...stationWords,
      commandIdentity: noteCheckIdentity,
      causeCode: "DOMAIN_NOTES_LIST_AND_TABLE_FORMAT",
      trigger:
        "One or more notes use inconsistent list markers, list spacing, blockquote spacing, or table columns.",
      repairAction: `Apply each list or table Repair named in the message (use '-' bullets consistently), then run ${canonicalRouteNames.noteCheck} again.`,
      guidance: {
        next: {
          kind: "instruction",
          text: `Fix each list or table finding named in the message, then run ${canonicalRouteNames.noteCheck} again.`,
        },
      },
      independentObservable: `${noteCheckIdentity}:list-and-table`,
    }),
    station(noteCheckCauses, {
      ...stationWords,
      commandIdentity: noteCheckIdentity,
      causeCode: "DOMAIN_NOTES_CODE_AND_INLINE_SYNTAX",
      trigger:
        "One or more notes contain malformed code fences, emphasis markers, or inline HTML.",
      repairAction: `Apply each code-fence or inline Markdown Repair named in the message, then run ${canonicalRouteNames.noteCheck} again.`,
      guidance: {
        next: {
          kind: "instruction",
          text: `Fix each code or inline syntax finding named in the message, then run ${canonicalRouteNames.noteCheck} again.`,
        },
      },
      independentObservable: `${noteCheckIdentity}:code-and-inline`,
    }),
    station(noteCheckCauses, {
      ...stationWords,
      commandIdentity: noteCheckIdentity,
      causeCode: "DOMAIN_NOTES_WHITESPACE_AND_ENCODING",
      trigger:
        "One or more notes contain trailing whitespace, tabs, encoding findings, or merge conflict markers.",
      repairAction: `Apply each whitespace or encoding Repair named in the message, then run ${canonicalRouteNames.noteCheck} again.`,
      guidance: {
        next: {
          kind: "instruction",
          text: `Fix each whitespace or encoding finding named in the message, then run ${canonicalRouteNames.noteCheck} again.`,
        },
      },
      independentObservable: `${noteCheckIdentity}:whitespace-and-encoding`,
    }),
    station(noteCheckCauses, {
      ...stationWords,
      commandIdentity: noteCheckIdentity,
      causeCode: "DOMAIN_NOTES_UNMAPPED_RULE",
      trigger:
        "rumdl reported a rule that does not yet have a wiki repair mapping.",
      repairAction: `Add a repair mapping for the reported rumdl rule in src/note/rules.ts and fix the note, then run ${canonicalRouteNames.noteCheck} again.`,
      guidance: {
        next: {
          kind: "instruction",
          text: `Add the missing rule mapping in src/note/rules.ts, fix the finding, and run ${canonicalRouteNames.noteCheck} again.`,
        },
      },
      independentObservable: `${noteCheckIdentity}:unmapped-rule`,
    }),
  ] as const;

  return command({
    identity: noteCheckIdentity,
    route: ["note", "check"],
    summary:
      "Check Markdown in the wiki folder and family templates with pinned rumdl, reporting findings with repairs. It writes nothing.",
    input: wikiInput,
    capabilities: { programs: true, diagnostics: true },
    stations: noteCheckStations,
    run: async (input, context) => {
      const overrides = parseNoteCheckEnvironment(options.environment);
      if (overrides.problems.length > 0) {
        return context.result(
          {
            commandIdentity: noteCheckIdentity,
            causeCode:
              "DOMAIN_PRECONDITION_UNMET" satisfies keyof typeof commonCauses,
          },
          refused(overrides.problems.join("\n")),
        );
      }
      const outcome = await runNoteCheck({
        repoRoot: options.repoRoot,
        wikiRoot: canonicalWikiRoot(input["--wiki"]),
        rumdlOverride: overrides.rumdlPath,
        configOverride: overrides.configPath,
        budgetMilliseconds: overrides.budgetMilliseconds,
        timeoutMilliseconds: overrides.timeoutMilliseconds,
        programs: context.programs,
        diagnostics: context.diagnostics,
        parsePath: programPath,
      });
      if (outcome.kind === "passed") {
        return context.result(
          {
            commandIdentity: noteCheckIdentity,
            causeCode: "SUCCESS_UNCHANGED" satisfies keyof typeof commonCauses,
          },
          report(outcome.message, outcome.data),
        );
      }
      return context.result(
        {
          commandIdentity: noteCheckIdentity,
          causeCode: outcome.causeCode,
        },
        refused(outcome.message),
      );
    },
  });
}
