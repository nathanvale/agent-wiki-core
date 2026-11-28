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

On every filed note, `family`, `summary`, `created`, and `tags` are required; `title`, `aliases`, `record_id`, and `replaced_by` are understood when present. Any family fields declared for that family in `family-table.json` follow the five base fields in table order.

## Tag limit

A note's tag limit comes from `tagLimit` in `family-table.json` (default `2`). It counts every tag on the note, the base tag included. A `null` `tagLimit` turns the limit off.

## Required headings

Each family's heading rule lives in `family-table.json`. Every heading the table does not mark `optional: true` is one of that family's required headings. Every required heading must appear in the record as `## <name>` and hold content beyond its hint comment.

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
