# CIS Architecture Decisions

> An ADR-style (Architecture Decision Record) log of technical and architecture decisions.
> This is a living doc. `project_spec.md` Part 2 is updated whenever a technical decision
> changes, but it records only the *current state* — it has no room for the reasoning or the
> alternatives that were considered. This file preserves that reasoning. Keep it current.
>
> **This file is for technical/architecture decisions only.** Product and scope decisions that
> deviate from `prd.docx` go in [`decisions.md`](./decisions.md). The current tech stack lives
> in [`project_spec.md`](../project_spec.md) §2.1 — that is current state, not a decision-log
> entry.

## When to add an entry

Add an entry whenever a technical decision is made or changed that a future contributor would
otherwise have to guess the reasoning for — a new library or pattern, a schema or RLS approach,
an integration design, or a reversal of an earlier choice. Update `project_spec.md` in the same
PR, and link to it from the entry's Reference.

Entries are never deleted. If a decision is reversed, mark the old entry **Superseded** and link
to the entry that replaces it.

## Entry format

Newest entries go first (reverse-chronological). Each entry is a `### YYYY-MM-DD — Title`
heading followed by:

- **Status:** `Proposed`, `Accepted`, or `Superseded` (if Superseded, link to the entry that
  supersedes it)
- **Context:** the problem or question that prompted this
- **Decision:** what was decided
- **Consequences / tradeoffs:** what this makes easier or harder, and what was given up
- **Reference:** the `project_spec.md` section it updates, if any, and/or the Linear issue

---

## Decisions
