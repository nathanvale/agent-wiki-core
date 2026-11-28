# Notes and families

## Family table ownership

Each consumer wiki owns its family table in `family-table.json` at its wiki root. The wiki core imposes no fixed record families.

Run `family list --wiki <root>` to learn a consumer wiki's defined families, reserved families, base tag, discovery tags, tag limit, and accepted renames from its table.

## Base fields

Every family template carries five base fields in order:

- `family` — record family name declared in `family-table.json`
- `title` — record title
- `summary` — non-empty short summary within `summaryMaxLength`
- `created` — ISO date (`YYYY-MM-DD`) when the note's content was first true
- `tags` — YAML list of tags

On every filed note, `family`, `summary`, `created`, and `tags` are required; `title`, `aliases`, `record_id`, and `replaced_by` are understood when present. `variant` is also a base field, required where the note's family declares `variants` (rendered after `tags` in each variant's family template). Any family fields declared for that family in `family-table.json` follow the rendered base fields in table order.

## Tag limit

A note's tag limit comes from `tagLimit` in `family-table.json` (default `2`). It counts every tag on the note, the base tag included. A `null` `tagLimit` turns the limit off.

## Required headings

Each family's heading rule lives in `family-table.json`. Every heading the table does not mark `optional: true` is one of that family's required headings. Every required heading must appear in the record as `## <name>` and hold content beyond its hint comment.

## Variants

Any record family in `family-table.json` may declare `variants`, giving that family one family template per variant (`templates/<family>-<variant>.md`) instead of a single `templates/<family>.md`. Each consumer wiki owns its variants and may add, edit, rename, or replace them directly in `family-table.json`.

- **Variant entry**: `{ "name": "<name>", "headings": [{ "name": "<heading>", "hint": "<optional hint>" }] }`. Each variant name matches `^[a-z][a-z0-9-]*$` and is unique within its family.
- **Variant heading rule**: Every heading inside a variant is optional by definition (omit the `optional` key). A variant adds optional headings and keeps all of its family's required headings.
- **Heading placement (`afterVariants`)**: On a family heading, set `"afterVariants": true` to render that heading after the variant's headings; family headings without `afterVariants` render before them. Use `afterVariants` only on a family that declares `variants`.
- **Variant check**: On a family that declares `variants`, every record must carry the `variant` header field (after `tags` in rendered family templates). The variant check reports `variant-missing` when `variant` is absent and `variant-not-installed` when `variant` is not declared for that family in `family-table.json`. On a family without `variants`, `variant` is neither required nor refused.

### Variant worked example

Given a generic `event` family with two variants in `family-table.json`:

```json
{
  "baseTag": "example-wiki",
  "discoveryTags": ["operations", "community"],
  "tagLimit": 2,
  "families": [
    {
      "family": "event",
      "folder": "wiki/events/",
      "familyFields": [{ "name": "status", "value": "seed" }],
      "headings": [
        {
          "name": "Goal",
          "hint": "What this event sets out to achieve.",
          "optional": false
        },
        {
          "name": "Follow-up",
          "hint": "Actions after the event.",
          "optional": true,
          "afterVariants": true
        }
      ],
      "variants": [
        {
          "name": "workshop",
          "headings": [
            {
              "name": "Materials",
              "hint": "Slides, tools, or handouts to prepare."
            }
          ]
        },
        {
          "name": "meetup",
          "headings": [
            {
              "name": "Agenda",
              "hint": "Topics and speakers."
            }
          ]
        }
      ]
    }
  ]
}
```

A valid filed record at `wiki/events/Spring Workshop.md` (following `templates/event-workshop.md`, with `Goal` before the variant heading `Materials` and `Follow-up` after it):

```markdown
---
family: event
title: "Spring Workshop"
summary: "Hands-on session covering tool maintenance for new members."
created: "2026-04-19"
tags: [example-wiki, community]
variant: workshop
status: active
---

# Spring Workshop

## Goal

Walk new members through sharpening and storing shared tools.

## Materials

Workbench checklist and spare blades.

## Follow-up

Publish the checklist in the shared folder.
```

## Worked example

Given a generic `project` family in `family-table.json`:

```json
{
  "baseTag": "example-wiki",
  "discoveryTags": ["operations", "research"],
  "tagLimit": 2,
  "families": [
    {
      "family": "project",
      "folder": "wiki/projects/",
      "familyFields": [{ "name": "status", "value": "seed" }],
      "headings": [
        {
          "name": "Purpose",
          "hint": "Why this project matters.",
          "optional": false
        },
        {
          "name": "Notes",
          "hint": "Working notes.",
          "optional": true
        }
      ]
    }
  ]
}
```

A valid filed record at `wiki/projects/Garden Shed.md`:

```markdown
---
family: project
title: "Garden Shed"
summary: "Build a weatherproof storage shed at the back of the yard."
created: "2026-04-12"
tags: [example-wiki, operations]
status: active
---

# Garden Shed

## Purpose

Keep tools dry and off the garage floor.

## Notes

Timber delivery booked for Friday.
```
