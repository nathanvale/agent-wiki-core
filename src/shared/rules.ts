export const canonicalRouteNames = {
  noteCheck: "note check",
} as const;

export const baseFields = {
  family: "string",
  tags: "list",
  title: "string",
  summary: "string",
  created: "date",
  replaced_by: "string",
  aliases: "list",
  record_id: "string",
} as const;

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

export type MarkdownSection = {
  readonly name: string;
  readonly key: string;
  readonly body: string;
};

export const headerPattern = /^---\n([\s\S]*?)\n---(?:\n|$)/;

export function unixLineEndings(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

export function folderOf(path: string): string | null {
  const parts = path.split("/");
  return parts.length > 2 ? `${parts.slice(0, 2).join("/")}/` : null;
}

export function bodyOf(note: { readonly text: string }): string {
  return note.text.replace(headerPattern, "");
}

export function nextFence(fence: string | null, line: string): string | null {
  const match = /^(```|~~~)/.exec(line);
  if (match === null) return fence;
  const marker = match[1] ?? "";
  if (fence === null) return marker;
  return fence === marker ? null : fence;
}

const namedHtmlEntities: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "\u2014",
  ndash: "\u2013",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  hellip: "\u2026",
};

function decodeCodePoint(raw: string, radix: 10 | 16): string | null {
  const codePoint = Number.parseInt(raw, radix);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return null;
  }
  return String.fromCodePoint(codePoint);
}

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#x([0-9a-fA-F]+)|#([0-9]+)|([a-zA-Z]+));/g,
    (
      match,
      hex: string | undefined,
      dec: string | undefined,
      name: string | undefined,
    ) => {
      if (hex !== undefined) return decodeCodePoint(hex, 16) ?? match;
      if (dec !== undefined) return decodeCodePoint(dec, 10) ?? match;
      if (name !== undefined) {
        return namedHtmlEntities[name.toLowerCase()] ?? match;
      }
      return match;
    },
  );
}

export function inertMarkup(text: string): string {
  return decodeEntities(
    text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/(\*\*|__|~~)(.*?)\1/g, "$2")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/(^|[^\w])_([^_]+)_(?=$|[^\w])/g, "$1$2")
      .replace(/\\([\\`*_{}[\]()#+\-.!~|])/g, "$1"),
  )
    .replace(/\s+/g, " ")
    .trim();
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
