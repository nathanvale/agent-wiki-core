import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { readNullableRecord, readNullableString, readString } from "./json.ts";
import { testFolder } from "./test-folder.ts";

export const root = join(import.meta.dir, "../..");

export function readResultFields(
  record: Record<string, unknown>,
  path: string,
): {
  readonly causeCode: string;
  readonly outcome: string;
  readonly repairAction: string | null;
  readonly data: Record<string, unknown> | null;
} {
  return {
    causeCode: readString(record["causeCode"], `${path}.causeCode`),
    outcome: readString(record["outcome"], `${path}.outcome`),
    repairAction: readNullableString(
      record["repairAction"],
      `${path}.repairAction`,
    ),
    data: readNullableRecord(record["data"], `${path}.data`),
  };
}

export function wikiFixture(files: Record<string, string>): string {
  const folder = testFolder("wiki-cli-test-");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  return folder;
}

export function fingerprint(folder: string): string {
  const walk = (path: string): string[] =>
    readdirSync(path)
      .sort()
      .flatMap((name) => {
        const child = join(path, name);
        return statSync(child).isDirectory()
          ? walk(child)
          : [
              `${child}:${createHash("sha256").update(readFileSync(child)).digest("hex")}`,
            ];
      });
  return walk(folder).join("\n");
}

export const personTemplate = `---
type: entity
title: "{{title}}"
status: active
created: "{{date}}"
updated: "{{date}}"
tags: [vault-pilot]
record_id: ""
family: person
aliases: []
contact_sources: []
---

# {{title}}

## Context

<!-- Say who this person is to the wiki's owner and why the record exists, in one or two sentences. -->

## Facts

<!-- One supported fact per line, each linked to its evidence. Omit this section if empty. -->

## Current relationship context

<!-- At most three claims that matter for a decision. Give each an "As of" date, one provenance label (Confirmed fact, Owner's report or Approved interpretation) and a link. Omit this section if empty. -->

## Open questions

<!-- Details that are unverified, in conflict or of unclear origin. Say what is not recorded. Omit this section if empty. -->

## Evidence

<!-- Link the original evidence for the retained facts. -->
`;
