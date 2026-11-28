---
"agent-wiki-core": major
---

Mount `family render --wiki <root>` and `family drift --wiki <root>` through `wikiCoreFor`, and remove `noInputCommand`, `readFamilyTemplates`, and `FamilyTemplateFile` from the public surface.

Action: Remove consumer imports of `noInputCommand`, `readFamilyTemplates`, and `FamilyTemplateFile`, and use the mounted `family render --wiki <root>` and `family drift --wiki <root>` commands instead.
