import type { CauseTable } from "agent-cli-kernel";

const domainRefusal = {
  outcome: "refused",
  transactionState: "unchanged",
  failureClass: "domain",
  exitCode: 3,
  retryable: false,
  guidance: "next",
} as const;

export const notesCauses = {
  DOMAIN_NOTES_LINTER_MISSING: domainRefusal,
  DOMAIN_NOTES_LINTER_VERSION_MISMATCH: domainRefusal,
  DOMAIN_NOTES_LINTER_FAILED: domainRefusal,
  DOMAIN_NOTES_CHECK_BUDGET_EXCEEDED: domainRefusal,
  DOMAIN_NOTES_BROKEN_LINKS: domainRefusal,
  DOMAIN_NOTES_HEADING_STRUCTURE: domainRefusal,
  DOMAIN_NOTES_LIST_AND_TABLE_FORMAT: domainRefusal,
  DOMAIN_NOTES_CODE_AND_INLINE_SYNTAX: domainRefusal,
  DOMAIN_NOTES_WHITESPACE_AND_ENCODING: domainRefusal,
  DOMAIN_NOTES_UNMAPPED_RULE: domainRefusal,
} as const satisfies CauseTable;
