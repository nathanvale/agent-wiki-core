# Wiki core glossary

This file is the source of truth for the words the wiki core owns: a wiki and
what it holds, families, the note contract, contacts, what a check reports,
and how a wiki consumes the core. No other glossary defines them.
`GLOSSARY-MAP.md` names the glossaries that own every other word, and how
these words become names in code.

Each term below is the word to use, with what it means and the words to avoid.

## Language

An `_Avoid_` line lists words not to use for its term. A note in parentheses
says when: it covers the words before it, back to the previous note or
semicolon. A word with no note after it is refused in every file, folder and
symbol name.

### The core and the wikis that use it

**Wiki core**:
This repository's package: the commands, rules and skills that every wiki
shares. Say core once the context is clear.
_Avoid_: engine, framework, library; kernel (the kernel is the CLI core this
package is built on)

**Consumer wiki**:
A repository that holds one wiki and takes its shared commands from the wiki
core. Say consumer once the context is clear.
_Avoid_: client, downstream, host; generated repository (the template's word
for any repository it made)

**Core pin**:
The one full commit of the wiki core that a consumer wiki names. Everything a
consumer gets from the core comes from that commit.
_Avoid_: version, release, tag; Pin (unqualified: the kernel owns Pin)

**Core pin move**:
Changing a consumer wiki's core pin to another commit, with whatever the
consumer guard then asks for.
_Avoid_: upgrade, update, bump; Pin move (unqualified: the template owns Pin
move)

**Shared command**:
A command the wiki core ships for consumer wikis to mount.
_Avoid_: core command, generic command, plugin

**Mount**:
To add a shared command to a consumer wiki's own command-line tool, under
that tool's name.
_Avoid_: install (a pointer skill is installed), register, wire

**Capability**:
A named part of the wiki core that a consumer wiki switches on. A consumer
that leaves it off gets none of its fields, rules or commands.
_Avoid_: feature, module, plugin; add-on (the kernel owns Add-on)

**Wiki skill**:
The guide skill the wiki core ships for agents working in a consumer wiki. It
tells them to act through the command-line tool and to check before filing.
_Avoid_: guide (unqualified), manual, wiki guide skill

**Shipped pointer**:
The pointer skill for the wiki skill, as the wiki core ships it at the core
pin.
_Avoid_: stub, shim

**Installed pointer**:
A consumer wiki's own copy of the shipped pointer, in its skill folder.
_Avoid_: local skill, copy (unqualified)

**Maintainer skill**:
The skill for agents changing the wiki core itself. It lives in this
repository's own skill folder and is never shipped to a consumer wiki.
_Avoid_: contributor guide, dev skill, core skill

**Consumer guard**:
The check a consumer wiki runs on its own install of the wiki core. It reads
files only and changes nothing.
_Avoid_: doctor (the template owns Doctor), validator, verifier, install check

**Install finding**:
A finding of the consumer guard: one way a consumer wiki's install differs
from what its core pin gives, with its repair.
_Avoid_: guard problem, install error, mismatch (unqualified)

**Nested kernel**:
A second copy of the kernel installed under the wiki core, because the core
and the consumer wiki name different kernel commits. It is an install
finding.
_Avoid_: duplicate kernel, kernel conflict

### A wiki and what it holds

**Wiki**:
One domain's Markdown knowledge: its notes and its family templates.
_Avoid_: vault, second brain, knowledge base

**Wiki root**:
The folder that holds one wiki. A shared command's `--wiki` option takes a
wiki root.
_Avoid_: vault, repo, workspace

**Wiki folder**:
The `wiki/` folder inside a wiki root. It holds the family folders and the
family-free folders.
_Avoid_: vault; wiki (for the folder: a wiki is the whole)

**Note**:
One Markdown file inside the wiki folder. A family template, a design doc and
an instruction file such as `AGENTS.md` are not notes.
_Avoid_: page, document, entry

**Header fields**:
The named values at the top of a note, between its opening and closing `---`
lines, as written.
_Avoid_: metadata, properties, frontmatter (one word)

**Record**:
A note that owns one thing, such as one person or one project, and belongs to
a record family.
_Avoid_: entity, entry, item

**Record ID**:
The stable identity of a record. It does not change when the record's title,
path or spelling does.
_Avoid_: slug, key

**Alias**:
Another name a reader might use to look for a record.

**Status**:
Where a record is in its life: seed while it is being planned, active while
it is happening, archived once it is done or dropped.
_Avoid_: stage, state (for a record)

**Fingerprint**:
The SHA-256 of a note's or a source's content.
_Avoid_: checksum, digest; hash (unqualified)

### Families

**Record family**:
The grouping of records by what they own, such as people, projects or
products. A family decides the record's folder, its family template and its
headings. Say family once the context is clear.
_Avoid_: type, category, taxonomy; kind (for a family: a finding has a kind)

**Family table**:
A consumer wiki's one table that defines every record family, the reserved
families, the family-free folders, the base tag, the discovery tags and the
accepted renames. The wiki core reads it; each consumer writes its own.
_Avoid_: schema (the note contract is the schema), registry

**Family folder**:
The one folder inside the wiki folder that holds a family's records.

**Defined family**:
A record family that the family table gives a family template and a heading
rule.

**Installed family**:
A defined family whose family template is in the wiki.

**Reserved family**:
A record family that the family table names with a family folder and no
family template yet.

**Family-free folder**:
A folder inside the wiki folder that holds notes of any family or none.

**Family template**:
The Markdown file a new record of one family starts from.
_Avoid_: template (unqualified: Template is the repository that makes
repositories)

**Heading rule**:
The record of which headings a family's records carry, in what order, and
which may be left out when empty.
_Avoid_: heading template, outline

**Base tag**:
The tag every record carries.

**Discovery tag**:
A tag that says where a reader might look. One discovery tag can cross
families.
_Avoid_: label, category

**Accepted rename**:
A change of a family name, a family folder or a heading that a wiki's owner
accepted and that an existing wiki has to follow.
_Avoid_: migration

**Wiki rule**:
A rule about records that one consumer wiki adds to the wiki core's own. The
core runs it beside its own rules and reports its findings the same way.
_Avoid_: custom rule, plugin rule, override

### The note contract

**Note contract**:
The one statement of which header fields a filed note carries: the base
fields, plus the family fields of its record family. Family templates, check
rules and the wiki skill's field text all come from it.
_Avoid_: schema (unqualified), spec, front matter rules

**Base field**:
A header field that every filed note carries, whatever its family. The
created date is one.
_Avoid_: required field (a family field can be required too), core field

**Family field**:
A header field that the notes of one record family carry on top of the base
fields. A consumer wiki's family table names them.
_Avoid_: extra, custom field

**Created date**:
The base field `created`: the day the note's content was first true, as an
ISO date.
_Avoid_: creation time, date added, timestamp

**Filed**:
Said of a note that sits in a family folder or a family-free folder other
than a waiting area, and so must meet the note contract.
_Avoid_: published, live, committed

**Import**:
Bringing one outside document into a wiki as a note through the command-line
tool, which gives it the header fields the note contract asks for.
_Avoid_: ingest, migrate; copy (for an import: a file copied by hand skips the
contract)

**Note name**:
The file name every filed note carries, made from its title. No note name
carries a date.
_Avoid_: slug, filename (one word, for the rule)

**Name change**:
Moving a filed note to the path its family and title give, together with
every relative link the move needs rewritten.
_Avoid_: rename (unqualified: an accepted rename is a family's)

**Kept original**:
A verified copy of a file that a name change will alter, held until the
change completes.
_Avoid_: backup, snapshot

**Collision**:
A planned change or name change that would move a file onto a path that
already exists, or give two filed notes the same note name.

### Contacts

**Contacts capability**:
The capability that lets a wiki's records point at people and organizations
kept in an outside contact store.
_Avoid_: contacts add-on, contact sync, address book

**Contact base**:
The header fields that every record of someone a wiki's owner can contact
shares: its aliases and its contact sources.

**Contact source**:
A pointer, in a record's header fields, to where a contact's details are
kept. It reads `<prefix>:<identifier>`. A record stores the pointer, never a
copy of a phone number or an email address.
_Avoid_: contact ID, handle, contact link

**Contact rule**:
The rule that no phone number and no email address appears in a note's body.
_Avoid_: privacy rule, PII check

**Contact adapter**:
The part of the contacts capability that resolves contact sources for one
contact store. Each adapter has one adapter prefix.
_Avoid_: provider, connector, integration, backend

**Adapter prefix**:
The word before the colon in a contact source. It names the contact adapter
that resolves it.
_Avoid_: scheme, namespace, source type

**Resolution**:
What a contact adapter says about one contact source: found, missing or
unavailable. Unavailable carries a cause.
_Avoid_: lookup result, answer (an answer is what a record search comes to)

**Contact check**:
The read-only check of each contact source in a wiki through its contact
adapter. It attaches and changes nothing.
_Avoid_: contact sync, contact import

### What a check reports

**Finding**:
One thing a check reports about one path, with a kind and a detail.
_Avoid_: issue, problem, violation, error

**Note check**:
The check that runs the pinned Markdown linter over a wiki root's notes and
family templates and fails on any Markdown finding. It names each file to the
linter, so an ignore file cannot hide one.
_Avoid_: lint, markdown lint

**Checked file**:
One Markdown file that the note check gave the linter by name.

**Markdown finding**:
A finding of the note check: one linter rule that one note or family template
breaks at one line. Each one carries a repair.
_Avoid_: lint error

**Skipped outside link**:
A relative link in a checked file whose target lies outside the wiki root.
The note check lists it and does not report it as a Markdown finding.
_Avoid_: external link (any web link is external)

**Absolute link**:
A link or image in a filed record whose target does not move with the wiki: a
`file:` URL, or a path that starts at a drive, a home folder or the file
system root.
_Avoid_: broken link (the target can exist on this machine), external link

**Record check**:
Every rule about one record on its own: its folder, family, tags, headings,
title, summary, links and body.

**Drift**:
A finding that an installed family template or heading rule differs from the
family table.

**Planned change**:
One change that an accepted rename would make to a wiki. Planning it changes
nothing.
_Avoid_: migration step

**Duplicate group**:
Two or more records that share a record ID or a contact source, or a title or
alias within one family.

**Match**:
One record that a search found, with what it matched on.

**Answer**:
What a search for a record comes to: none, one or several.
_Avoid_: verdict, result (a command returns a command result)

**Section history**:
For each section of one record, when it was added, when it last changed, how
many times it changed and any earlier names, read from the record's history.

**Untouched**:
Said of a section that has not changed since it was added.

**Tool status**:
What the status command reports: that the command-line tool runs. It is not a
record's status.
