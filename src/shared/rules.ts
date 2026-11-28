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
