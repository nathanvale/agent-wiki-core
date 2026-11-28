---
status: accepted
---

# Checks combine as a conjunction

Recorded from [spec #18](https://github.com/nathanvale/agent-wiki-core/issues/18).

A record check is made of independent checks whose findings combine as a
conjunction (`findings = base fields ∪ heading rule ∪ wiki rules`, like JSON
Schema `allOf`), rather than a template that extends and overrides its family.
Each finding names the check that reported it (`base-fields`, `heading-rule`
or `wiki-rule`), and no check can remove another check's requirement.

## Considered options

- **Object-oriented extension.** Let a later template or layer replace an
  earlier heading list or override base requirements. Rejected after a
  throwaway prototype (`layers-allof-vs-extension.txt`) checked six broken
  notes both ways: extension missed at least one finding on five of the six
  broken notes (for example, an edited template dropping a required heading
  silenced `required-section-empty`), whereas combining independent checks
  caught every defect and produced identical findings in reverse order.

## Consequences

- `checkNote` runs the base-field check, the heading-rule check and any
  per-note wiki rules independently and returns all of their findings
  together.
- Every finding from a record check carries a `check` label so a caller or
  agent knows which check reported it.
- Future checks (such as note-name or variant checks) add their own findings
  to the union without weakening any existing check.
