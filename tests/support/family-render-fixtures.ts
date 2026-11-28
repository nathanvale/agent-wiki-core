export const multiFamilyTable = {
  baseTag: "example-wiki",
  discoveryTags: ["travel", "home"],
  tagLimit: 2,
  summaryMaxLength: 200,
  unfiledFolder: "wiki/inbox/",
  familyFreeFolders: ["wiki/inbox/", "wiki/archive/"],
  reservedFamilies: { "wiki/areas/": "area" },
  renames: [],
  families: [
    {
      family: "project",
      folder: "wiki/projects/",
      familyFields: [
        { name: "status", value: "seed" },
        { name: "updated", value: '"{{date}}"' },
      ],
      headings: [
        {
          name: "Purpose",
          hint: "Why this project matters.",
          optional: false,
        },
        {
          name: "Notes",
          optional: true,
        },
      ],
    },
    {
      family: "topic",
      folder: "wiki/topics/",
      familyFields: [{ name: "scope", value: "general" }],
      headings: [
        {
          name: "Summary",
          hint: "Key points for this topic.",
          optional: false,
        },
      ],
    },
  ],
};

export const expectedProjectTemplate = `---
family: project
title: "{{title}}"
summary: ""
created: "{{date}}"
tags: [example-wiki]
status: seed
updated: "{{date}}"
---

# {{title}}

## Purpose

<!-- Why this project matters. -->

## Notes
`;

export const expectedTopicTemplate = `---
family: topic
title: "{{title}}"
summary: ""
created: "{{date}}"
tags: [example-wiki]
scope: general
---

# {{title}}

## Summary

<!-- Key points for this topic. -->
`;

export const nullBaseTagTable = {
  families: [
    {
      family: "note",
      folder: "wiki/notes/",
      headings: [{ name: "Overview", optional: false }],
    },
  ],
};

export const expectedNullBaseTagTemplate = `---
family: note
title: "{{title}}"
summary: ""
created: "{{date}}"
tags: []
---

# {{title}}

## Overview
`;

export const variantFamilyTable = {
  baseTag: "example-wiki",
  families: [
    {
      family: "study",
      folder: "wiki/studies/",
      familyFields: [{ name: "status", value: "seed" }],
      headings: [
        {
          name: "Summary",
          hint: "Short overview.",
          optional: false,
        },
        {
          name: "Context",
          optional: true,
          afterVariants: false,
        },
        {
          name: "Notes",
          hint: "Closing notes.",
          optional: false,
          afterVariants: true,
        },
        {
          name: "Sources",
          optional: true,
          afterVariants: true,
        },
      ],
      variants: [
        {
          name: "field",
          headings: [
            { name: "Site", hint: "Where observations happened." },
            { name: "Observations" },
          ],
        },
        {
          name: "desk",
          headings: [{ name: "References", hint: "Primary sources read." }],
        },
      ],
    },
  ],
};

export const expectedFieldVariantTemplate = `---
family: study
title: "{{title}}"
summary: ""
created: "{{date}}"
tags: [example-wiki]
variant: field
status: seed
---

# {{title}}

## Summary

<!-- Short overview. -->

## Context

## Site

<!-- Where observations happened. -->

## Observations

## Notes

<!-- Closing notes. -->

## Sources
`;

export const expectedDeskVariantTemplate = `---
family: study
title: "{{title}}"
summary: ""
created: "{{date}}"
tags: [example-wiki]
variant: desk
status: seed
---

# {{title}}

## Summary

<!-- Short overview. -->

## Context

## References

<!-- Primary sources read. -->

## Notes

<!-- Closing notes. -->

## Sources
`;
