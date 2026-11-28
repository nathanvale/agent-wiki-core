import { headerPattern } from "./rules.ts";
import type { baseFields, Note } from "./rules.ts";
import {
  dateProperty,
  fieldsOf,
  nonBlank,
  texts,
  unixLineEndings,
} from "./values.ts";

export {
  bodyOf,
  folderOf,
  rawSectionsOf,
  splitMarkdownSections,
} from "./rules.ts";
export type { MarkdownFile, MarkdownSection, Note } from "./rules.ts";

type BaseFieldName = keyof typeof baseFields;

function headerField(
  headerFields: Readonly<Record<string, unknown>>,
  field: BaseFieldName,
): unknown {
  return headerFields[field];
}

export function parseNote(path: string, text: string): Note {
  const content = unixLineEndings(text.replace(/^\uFEFF/, ""));
  const { block, properties } = parseHeader(content);
  return {
    path,
    text: content,
    family: nonBlank(headerField(properties, "family")),
    tags: texts(headerField(properties, "tags")),
    title: nonBlank(headerField(properties, "title")),
    summary: nonBlank(headerField(properties, "summary")),
    created: dateProperty(headerField(properties, "created")),
    replacedBy: nonBlank(headerField(properties, "replaced_by")),
    aliases: texts(headerField(properties, "aliases")),
    recordId: asWritten(block, "record_id" satisfies BaseFieldName),
    variant: nonBlank(headerField(properties, "variant")),
    headerFields: properties,
  };
}

function parsedHeader(block: string): Record<string, unknown> {
  try {
    return fieldsOf(Bun.YAML.parse(block)) ?? {};
  } catch {
    return {};
  }
}

export function asWritten(block: string, key: string): string | null {
  const line =
    new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*$`, "m").exec(block)?.[1] ?? "";
  return nonBlank(line.replace(/^(["'])(.*)\1$/, "$2"));
}

export function parseHeader(text: string): {
  readonly block: string;
  readonly properties: Record<string, unknown>;
  readonly body: string;
} {
  const content = unixLineEndings(text.replace(/^\uFEFF/, ""));
  const matched = headerPattern.exec(content);
  const block = matched?.[1] ?? "";
  return {
    block,
    properties: parsedHeader(block),
    body: matched === null ? content : content.slice(matched[0].length),
  };
}

export function normalized(name: string): string {
  return name.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}

function withoutCode(markdown: string): string {
  return markdown
    .replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, "")
    .replace(/`[^`\n]*`/g, "");
}

function splitSectionBodies(
  text: string,
  transformHeading: (heading: string) => string,
): Map<string, string> {
  const parts = withoutCode(text.replace(headerPattern, "")).split(
    /^## (.+?)[ \t]*$/m,
  );
  const sections = new Map<string, string>();
  for (let index = 1; index < parts.length - 1; index += 2) {
    const name = transformHeading(parts[index] ?? "");
    sections.set(name, `${sections.get(name) ?? ""}${parts[index + 1] ?? ""}`);
  }
  return sections;
}

export function sectionBodies(text: string): Map<string, string> {
  return splitSectionBodies(unixLineEndings(text), (heading) => heading);
}

export function sectionsOf(note: {
  readonly text: string;
}): Map<string, string> {
  return splitSectionBodies(note.text, (heading) => heading.toLowerCase());
}
