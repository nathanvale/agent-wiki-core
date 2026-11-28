import { expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, sep } from "node:path";
import { git, gitFixture } from "./support/git-fixture.ts";
import { testFolder } from "./support/test-folder.ts";

const repoRoot = join(import.meta.dir, "..");

const shippedContentPaths: readonly string[] = [
  "skills",
  "README.md",
  "AGENTS.md",
  "GLOSSARY.md",
  "GLOSSARY-MAP.md",
  "docs",
  "examples",
];

const reservedEmailDomains: readonly string[] = [
  "example.com",
  "example.org",
  "example.net",
];

const reservedEmailSuffixes: readonly string[] = [
  ".example",
  ".invalid",
  ".test",
  ".localhost",
];

const emailPattern =
  /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/g;
const tildeHomePathPattern = /(?<![\w./\\~])~\/[^\s"'`<>)\]*]*/g;
const homePathPatterns: readonly RegExp[] = [
  /\/Users\/[A-Za-z0-9._-]+/g,
  /\/home\/[A-Za-z0-9._-]+/g,
  /C:\\Users\\[^\s"'`<>)]*/gi,
  tildeHomePathPattern,
];

type AllowEntry = {
  readonly file: string;
  readonly match: string;
  readonly reason: string;
};

type ShippedContentFinding = {
  readonly file: string;
  readonly line: number;
  readonly kind: "email" | "home-path" | "author-name";
  readonly match: string;
};

type ScanResult = {
  readonly files: readonly string[];
  readonly findings: readonly ShippedContentFinding[];
};

const allowedShippedContentMatches: readonly AllowEntry[] = [];

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isReservedEmailDomain(domain: string): boolean {
  const lower = domain.toLowerCase();
  return (
    reservedEmailDomains.some(
      (reserved) => lower === reserved || lower.endsWith(`.${reserved}`),
    ) || reservedEmailSuffixes.some((suffix) => lower.endsWith(suffix))
  );
}

function authorWordsFromNames(names: readonly string[]): string[] {
  const words = new Set<string>();
  for (const rawName of names) {
    const name = rawName.trim();
    if (name === "" || name === "GitHub" || name.endsWith("[bot]")) continue;
    for (const match of name.matchAll(/\p{L}{3,}/gu)) {
      words.add(match[0]);
    }
  }
  return [...words].sort(compareCodeUnits);
}

function commitAuthorWords(root: string): string[] {
  return authorWordsFromNames(git(root, "log", "--format=%an").split("\n"));
}

function collectFolderFiles(
  root: string,
  relativeFolder: string,
  files: string[],
): void {
  const entries = readdirSync(join(root, relativeFolder), {
    withFileTypes: true,
  }).sort((left, right) => compareCodeUnits(left.name, right.name));
  for (const entry of entries) {
    const child = `${relativeFolder}/${entry.name}`;
    if (entry.isDirectory()) {
      collectFolderFiles(root, child, files);
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
}

function collectShippedFiles(root: string): string[] {
  const files: string[] = [];
  for (const relativeEntry of shippedContentPaths) {
    const fullPath = join(root, relativeEntry);
    if (!existsSync(fullPath)) continue;
    const stats = lstatSync(fullPath);
    if (stats.isDirectory()) {
      collectFolderFiles(root, relativeEntry, files);
    } else if (stats.isFile()) {
      files.push(relativeEntry.split(sep).join("/"));
    }
  }
  return files;
}

function emailFindings(
  file: string,
  lineNumber: number,
  line: string,
): ShippedContentFinding[] {
  const findings: ShippedContentFinding[] = [];
  for (const match of line.matchAll(emailPattern)) {
    const domain = match[1] ?? "";
    if (!isReservedEmailDomain(domain)) {
      findings.push({
        file,
        line: lineNumber,
        kind: "email",
        match: match[0],
      });
    }
  }
  return findings;
}

function homePathFindings(
  file: string,
  lineNumber: number,
  line: string,
): ShippedContentFinding[] {
  const findings: ShippedContentFinding[] = [];
  for (const pattern of homePathPatterns) {
    for (const match of line.matchAll(pattern)) {
      findings.push({
        file,
        line: lineNumber,
        kind: "home-path",
        match: match[0],
      });
    }
  }
  return findings;
}

function authorNameFindings(
  file: string,
  lineNumber: number,
  line: string,
  patterns: readonly RegExp[],
): ShippedContentFinding[] {
  const findings: ShippedContentFinding[] = [];
  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) {
      findings.push({
        file,
        line: lineNumber,
        kind: "author-name",
        match: match[0],
      });
    }
  }
  return findings;
}

function isAllowed(
  finding: ShippedContentFinding,
  allowList: readonly AllowEntry[],
): boolean {
  return allowList.some(
    (entry) => entry.file === finding.file && entry.match === finding.match,
  );
}

function scanShippedContent(
  root: string,
  authorWords: readonly string[],
  allowList: readonly AllowEntry[] = allowedShippedContentMatches,
): ScanResult {
  const files = collectShippedFiles(root);
  const authorPatterns = authorWords.map(
    (word) =>
      new RegExp(
        `(?<![\\p{L}\\p{N}_])${escapeRegExp(word)}(?![\\p{L}\\p{N}_])`,
        "gu",
      ),
  );
  const findings: ShippedContentFinding[] = [];
  for (const file of files) {
    const lines = readFileSync(join(root, file), "utf8").split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const lineNumber = index + 1;
      const lineFindings = [
        ...emailFindings(file, lineNumber, line),
        ...homePathFindings(file, lineNumber, line),
        ...authorNameFindings(file, lineNumber, line, authorPatterns),
      ];
      for (const finding of lineFindings) {
        if (!isAllowed(finding, allowList)) {
          findings.push(finding);
        }
      }
    }
  }
  return { files, findings };
}

function formatFinding(finding: ShippedContentFinding): string {
  return `${finding.file}:${finding.line} [${finding.kind}] ${finding.match}`;
}

function withShippedFixture(
  files: Readonly<Record<string, string>>,
  run: (root: string) => void,
): void {
  const root = testFolder("shipped-content-");
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const target = join(root, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("shipped content in this repository contains no personal email, home path or commit author name", () => {
  const authorWords = commitAuthorWords(repoRoot);
  expect(authorWords.length).toBeGreaterThan(0);

  const result = scanShippedContent(repoRoot, authorWords);
  expect(result.files).toContain("GLOSSARY.md");
  expect(result.files).toContain("GLOSSARY-MAP.md");
  expect(result.files).toContain("README.md");
  expect(result.files).toContain("AGENTS.md");
  expect(result.files.some((file) => file.startsWith("skills/"))).toBe(true);
  expect(result.files.some((file) => file.startsWith("docs/"))).toBe(true);
  expect(result.findings.map(formatFinding)).toEqual([]);
});

test("refuses a planted non-reserved email, home paths and a commit author's first name with file and line", () => {
  const authorWords = commitAuthorWords(repoRoot);
  const firstAuthorWord = authorWords[0];
  expect(firstAuthorWord).toBeDefined();

  const macHomePath = ["", "Users", "someone", "notes"].join("/");
  const linuxHomePath = ["", "home", "someone", "notes"].join("/");
  const tildeHomePath = "~/notes";
  const windowsHomePath = "C:\\Users\\someone\\";

  withShippedFixture(
    {
      "GLOSSARY.md": [
        "# Glossary",
        "Contact person@personal-domain.org for details.",
        `mac path: ${macHomePath}`,
        `linux path: ${linuxHomePath}`,
        `tilde path: ${tildeHomePath}`,
        `windows path: ${windowsHomePath}`,
        `Author mention: ${firstAuthorWord ?? ""}`,
      ].join("\n"),
    },
    (root) => {
      const result = scanShippedContent(root, authorWords);
      expect(result.findings).toEqual([
        {
          file: "GLOSSARY.md",
          line: 2,
          kind: "email",
          match: "person@personal-domain.org",
        },
        {
          file: "GLOSSARY.md",
          line: 3,
          kind: "home-path",
          match: ["", "Users", "someone"].join("/"),
        },
        {
          file: "GLOSSARY.md",
          line: 4,
          kind: "home-path",
          match: ["", "home", "someone"].join("/"),
        },
        {
          file: "GLOSSARY.md",
          line: 5,
          kind: "home-path",
          match: "~/notes",
        },
        {
          file: "GLOSSARY.md",
          line: 6,
          kind: "home-path",
          match: "C:\\Users\\someone\\",
        },
        {
          file: "GLOSSARY.md",
          line: 7,
          kind: "author-name",
          match: firstAuthorWord ?? "",
        },
      ]);
    },
  );
});

test("allows reserved email domains and the word GitHub", () => {
  withShippedFixture(
    {
      "GLOSSARY.md": [
        "Hosted on GitHub.",
        "Emails: a@example.com b@example.org c@example.net",
        "More: d@sub.example e@host.invalid f@host.test g@host.localhost",
      ].join("\n"),
    },
    (root) => {
      const authorWords = authorWordsFromNames([
        "GitHub",
        "dependabot[bot]",
        "Renovate[bot]",
        "Ada Lovelace",
      ]);
      expect(authorWords).toEqual(["Ada", "Lovelace"]);
      const result = scanShippedContent(root, authorWords);
      expect(result.findings).toEqual([]);
    },
  );
});

test("matches author name words case-sensitively and ignores short words and bots from git log", () => {
  const root = gitFixture("shipped-authors-");
  try {
    writeFileSync(join(root, "GLOSSARY.md"), "Ada ada Al GitHub\n");
    git(root, "add", "--", "GLOSSARY.md");
    git(
      root,
      "commit",
      "--quiet",
      "--author=Al Ada <ada@example.invalid>",
      "-m",
      "one",
    );
    writeFileSync(join(root, "README.md"), "GitHub dependabot\n");
    git(root, "add", "--", "README.md");
    git(
      root,
      "commit",
      "--quiet",
      "--author=dependabot[bot] <bot@example.invalid>",
      "-m",
      "two",
    );
    writeFileSync(join(root, "AGENTS.md"), "GitHub\n");
    git(root, "add", "--", "AGENTS.md");
    git(
      root,
      "commit",
      "--quiet",
      "--author=GitHub <noreply@example.invalid>",
      "-m",
      "three",
    );

    const words = commitAuthorWords(root);
    expect(words).toEqual(["Ada"]);

    const result = scanShippedContent(root, words);
    expect(result.findings).toEqual([
      {
        file: "GLOSSARY.md",
        line: 1,
        kind: "author-name",
        match: "Ada",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scans examples/ when present and respects allow-list entries", () => {
  expect(shippedContentPaths).toContain("examples");

  withShippedFixture(
    {
      "examples/sample.md": "Credit: Ada\nOther: person@personal-domain.org\n",
    },
    (root) => {
      const result = scanShippedContent(
        root,
        ["Ada"],
        [
          {
            file: "examples/sample.md",
            match: "Ada",
            reason: "reviewed credit line",
          },
        ],
      );
      expect(result.files).toEqual(["examples/sample.md"]);
      expect(result.findings).toEqual([
        {
          file: "examples/sample.md",
          line: 2,
          kind: "email",
          match: "person@personal-domain.org",
        },
      ]);
    },
  );
});

test("refuses tilde home paths after punctuation delimiters and accepts non-home tildes", () => {
  const cases: readonly {
    readonly line: string;
    readonly expectedMatch: string | undefined;
  }[] = [
    { line: "<~/notes>", expectedMatch: "~/notes" },
    { line: "[~/notes]", expectedMatch: "~/notes" },
    { line: "dir:~/notes", expectedMatch: "~/notes" },
    { line: "**~/notes**", expectedMatch: "~/notes" },
    { line: "PATH=/usr/bin:~/bin", expectedMatch: "~/bin" },
    { line: "foo/~/bar", expectedMatch: undefined },
    { line: "https://example.com/~/foo", expectedMatch: undefined },
  ];

  const expectedFindings: ShippedContentFinding[] = [];
  for (const [index, entry] of cases.entries()) {
    if (entry.expectedMatch !== undefined) {
      expectedFindings.push({
        file: "GLOSSARY.md",
        line: index + 1,
        kind: "home-path",
        match: entry.expectedMatch,
      });
    }
  }

  withShippedFixture(
    {
      "GLOSSARY.md": cases.map((entry) => entry.line).join("\n"),
    },
    (root) => {
      const result = scanShippedContent(root, []);
      expect(result.findings).toEqual(expectedFindings);
    },
  );
});
