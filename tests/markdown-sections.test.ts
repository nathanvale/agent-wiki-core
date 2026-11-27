import { expect, test } from "bun:test";
import { sectionBodies, sectionsOf } from "../src/shared/markdown-sections.ts";

test("sectionBodies preserves mixed-case headings, normalises CRLF line endings, strips code, and merges exact duplicates", () => {
  const markdown = [
    "---",
    'title: "Mixed Case Note"',
    "---",
    "",
    "# Mixed Case Note",
    "",
    "## Mixed Case  ",
    "",
    "First line.",
    "```markdown",
    "## Ignored Heading",
    "```",
    "Inline `## Also Ignored` text.",
    "",
    "## mixed case",
    "",
    "Lowercase heading stays separate.",
    "",
    "## Mixed Case",
    "",
    "Second part.",
  ].join("\r\n");

  const result = sectionBodies(markdown);

  expect([...result.keys()]).toEqual(["Mixed Case", "mixed case"]);
  expect(result.get("Mixed Case")).toBe(
    "\n\nFirst line.\n\nInline  text.\n\n\n\nSecond part.",
  );
  expect(result.get("mixed case")).toBe(
    "\n\nLowercase heading stays separate.\n\n",
  );
});

test("sectionsOf lowercases mixed-case headings, merges case-insensitively, and does not normalise CRLF line endings", () => {
  const lfMarkdown = [
    "---",
    'title: "Mixed Case Note"',
    "---",
    "",
    "# Mixed Case Note",
    "",
    "## Mixed Case\t",
    "",
    "First line.",
    "~~~markdown",
    "## Ignored Heading",
    "~~~",
    "",
    "## mixed case",
    "",
    "Merged part.",
    "",
    "## Details",
    "",
    "Body text.",
  ].join("\n");

  const lfResult = sectionsOf({ text: lfMarkdown });

  expect([...lfResult.keys()]).toEqual(["mixed case", "details"]);
  expect(lfResult.get("mixed case")).toBe(
    "\n\nFirst line.\n\n\n\n\nMerged part.\n\n",
  );
  expect(lfResult.get("details")).toBe("\n\nBody text.");

  const crlfMarkdown = ["## Mixed Case", "", "Line one.", "Line two."].join(
    "\r\n",
  );

  const crlfResult = sectionsOf({ text: crlfMarkdown });

  expect([...crlfResult.keys()]).toEqual(["mixed case"]);
  expect(crlfResult.get("mixed case")).toBe("\r\n\r\nLine one.\r\nLine two.");
});
