function describeKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function wrongShape(path: string, expected: string, actual: unknown): never {
  throw new Error(
    `Expected ${expected} at ${path}, got ${describeKind(actual)}`,
  );
}

export function parseJson(text: string, path: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON at ${path}: ${detail}`, { cause: error });
  }
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    wrongShape(path, "object", value);
  return Object.fromEntries(Object.entries(value));
}

export function parseJsonRecord(
  text: string,
  path: string,
): Record<string, unknown> {
  return readRecord(parseJson(text, path), path);
}

export function readString(value: unknown, path: string): string {
  if (typeof value !== "string") wrongShape(path, "string", value);
  return value;
}

export function readNullableString(
  value: unknown,
  path: string,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") wrongShape(path, "string or null", value);
  return value;
}

export function readNullableRecord(
  value: unknown,
  path: string,
): Record<string, unknown> | null {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    wrongShape(path, "object or null", value);
  return Object.fromEntries(Object.entries(value));
}

export function readOptionalRecord(
  value: unknown,
  path: string,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    wrongShape(path, "object or undefined", value);
  return Object.fromEntries(Object.entries(value));
}

function readList(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) wrongShape(path, "array", value);
  const items: unknown[] = value;
  return items;
}

function readArray<T>(
  value: unknown,
  path: string,
  readItem: (item: unknown, itemPath: string) => T,
): T[] {
  return readList(value, path).map((item, index) =>
    readItem(item, `${path}[${index}]`),
  );
}

export function readObject<T extends Readonly<Record<string, unknown>>>(
  value: unknown,
  path: string,
  readFields: (record: Record<string, unknown>, recordPath: string) => T,
): Record<string, unknown> & T {
  const record = readRecord(value, path);
  return { ...record, ...readFields(record, path) };
}

export function readRecordArray(
  value: unknown,
  path: string,
  readEntry: (entry: Record<string, unknown>, entryPath: string) => string,
): string[] {
  return readArray(value, path, (item, itemPath) =>
    readEntry(readRecord(item, itemPath), itemPath),
  );
}

export function readStringArray(value: unknown, path: string): string[] {
  return readArray(value, path, readString);
}
