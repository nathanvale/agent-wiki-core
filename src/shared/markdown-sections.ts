import { baseFields } from "./rules.ts";
import {
  dateProperty,
  fieldsOf,
  nonBlank,
  texts,
  unixLineEndings,
} from "./values.ts";

type BaseFieldName = keyof typeof baseFields;

function headerField(
  properties: Readonly<Record<string, unknown>>,
  field: BaseFieldName,
): unknown {
  return Object.hasOwn(baseFields, field) ? properties[field] : undefined;
}

export type MarkdownFile = {
  readonly path: string;
  readonly text: string;
  readonly family: string | null;
  readonly tags: readonly string[];
  readonly title: string | null;
  readonly summary: string | null;
  readonly created: string | null;
  readonly replacedBy: string | null;
  readonly aliases: readonly string[];
  readonly recordId: string | null;
  readonly headerFields: Readonly<Record<string, unknown>>;
};

export type Note = MarkdownFile;

export function folderOf(path: string): string | null {
  const parts = path.split("/");
  return parts.length > 2 ? `${parts.slice(0, 2).join("/")}/` : null;
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
    recordId: asWritten(block, "record_id"),
    headerFields: properties,
  };
}

const headerPattern = /^---\n([\s\S]*?)\n---(?:\n|$)/;

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

export function bodyOf(note: { readonly text: string }): string {
  return note.text.replace(headerPattern, "");
}

export type MarkdownSection = {
  readonly name: string;
  readonly key: string;
  readonly body: string;
};

function nextFence(fence: string | null, line: string): string | null {
  const match = /^(```|~~~)/.exec(line);
  if (match === null) return fence;
  const marker = match[1] ?? "";
  if (fence === null) return marker;
  return fence === marker ? null : fence;
}

export function splitMarkdownSections(
  body: string,
  level: 2 | 3,
): { readonly preamble: string; readonly sections: MarkdownSection[] } {
  const prefix = level === 2 ? /^## (.+?)[ \t]*$/ : /^### (.+?)[ \t]*$/;
  const sections: MarkdownSection[] = [];
  const preambleLines: string[] = [];
  let fence: string | null = null;
  let current: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (current === null) return;
    sections.push({
      name: current,
      key: current.toLowerCase(),
      body: buffer.join("\n").trim(),
    });
  };
  for (const line of body.split("\n")) {
    fence = nextFence(fence, line);
    const heading = fence === null ? prefix.exec(line)?.[1]?.trim() : undefined;
    if (heading !== undefined) {
      flush();
      current = heading;
      buffer = [];
    } else {
      (current === null ? preambleLines : buffer).push(line);
    }
  }
  flush();
  return { preamble: preambleLines.join("\n").trim(), sections };
}

export function rawSectionsOf(note: {
  readonly text: string;
}): Map<string, string> {
  const sections = new Map<string, string>();
  for (const section of splitMarkdownSections(bodyOf(note), 2).sections) {
    const existing = sections.get(section.key);
    sections.set(
      section.key,
      existing === undefined ? section.body : `${existing}\n${section.body}`,
    );
  }
  return sections;
}

export function sectionsOf(note: {
  readonly text: string;
}): Map<string, string> {
  return splitSectionBodies(note.text, (heading) => heading.toLowerCase());
}
