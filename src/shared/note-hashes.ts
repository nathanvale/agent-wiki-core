import { createHash } from "node:crypto";

export type MoveSnapshot = {
  readonly from: string;
  readonly to: string;
  readonly bytes: Buffer;
};

export function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function stagePathForMove(from: string, to: string): string {
  const id = sha256Text(`${from}\0${to}`).slice(0, 12);
  return `${from}.note-name-stage-${id}`;
}
