import type { ParsedPath } from "agent-cli-kernel";

type PathParser = (value: string) => ParsedPath;
let parser: PathParser | undefined;

export function usePathParser(next: PathParser): void {
  parser = next;
}

export function programPath(value: string): ParsedPath {
  if (parser === undefined)
    throw new Error("The contract's path parser is not set.");
  return parser(value);
}
