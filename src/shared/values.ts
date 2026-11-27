export function fieldsOf(value: unknown): Record<string, unknown> | null {
  const isMap =
    typeof value === "object" && value !== null && !Array.isArray(value);
  return isMap ? Object.fromEntries(Object.entries(value)) : null;
}

export function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function nonBlank(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function texts(value: unknown): string[] {
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => {
    const text = nonBlank(item);
    return text === null ? [] : [text];
  });
}

export function unixLineEndings(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isoDate(value: unknown): string | null {
  const date = nonEmpty(value);
  if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const real = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(real.getTime()) && utcDay(real) === date ? date : null;
}

export function dateProperty(value: unknown): string | null {
  if (value instanceof Date) return isoDate(utcDay(value));
  return isoDate(nonBlank(value));
}
