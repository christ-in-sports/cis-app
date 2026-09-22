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

### 2026-09-21 — Store kid photos in a private Storage bucket
- **Status:** Accepted
- **Context:** The registration form collects a photo of each kid, who are minors. `AGENTS.md` §4 treats kid data as sensitive. The interim CSV import gets photos as Google Drive links (parents upload them through a Google Form), whose sharing we don't control.
- **Decision:** Upload to a private Supabase Storage bucket. `Kid.photo_path` stores the object path, not a URL. The server generates short-lived signed URLs on read, and storage policies mirror who can read the `Kid` row. During CSV import, the server downloads each photo from its Drive link and stores it in the bucket, so imported kids follow the same path as form-submitted ones.
- **Consequences / tradeoffs:** Photos can't be scraped or shared by link, and imported photos end up under our RLS instead of Drive's sharing. In return, every read needs a server step to sign the URL, signed URLs make browser caching harder, and the importer needs Drive API access (Form uploads are usually not public). A failed download becomes a row-level import error the Admin must resolve.
- **Reference:** `project_spec.md` §2.4 (field notes), §2.5, §2.8; Linear [ENG-4](https://linear.app/cis-app/issue/ENG-4/kid-registration-parent-self-service-form), [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

### 2026-09-21 — Enforce grade and division rules with database CHECK constraints
- **Status:** Accepted
- **Context:** Division depends on grade (below 7 is Juniors, above 7 is Ambassadors, 7 chooses). Registrations arrive through the parent form, kid self-registration and CSV import, so validating only in the form would let bad rows in through the other paths.
- **Decision:** `CHECK` constraints on `Registration`: grade between 4 and 12, and division consistent with grade. The Zod schema mirrors the rule for friendly form errors.
- **Consequences / tradeoffs:** Invalid data is rejected whichever path writes it. Changing the rule later needs a migration, and constraint violations have to be mapped to readable errors, especially in CSV row reports.
- **Reference:** `project_spec.md` §2.4, §2.5; Linear [ENG-4](https://linear.app/cis-app/issue/ENG-4/kid-registration-parent-self-service-form), [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

### 2026-09-21 — Split `Kid` from a per-season `Registration`
- **Status:** Accepted
- **Context:** Kids return across seasons. Grade, division, T-shirt size, top sports, consent and team all change each season, and `Team` belongs to a `Season`. Storing them on `Kid` would go stale every year and leave `team_id` pointing at last season's team.
- **Decision:** `Kid` holds stable identity, contact and medical data. `Registration` (unique on `kid_id` + `season_id`) holds the per-season fields and `team_id`, and `Team` has many `Registration`. `Attendance_Kid`, `SpiritualRecord` and `Payment` keep referencing `kid_id` for now.
- **Consequences / tradeoffs:** Season history is preserved and standings and rosters are cleanly per season. Roster queries need a join through `Registration`, and CSV import must match returning kids to existing records (on first name + last name + DOB) to avoid duplicates. Whether `Payment` should move to `registration_id` is unresolved (tracked as an open question in `project_spec.md` §2.8).
- **Reference:** `project_spec.md` §2.4; Linear [ENG-4](https://linear.app/cis-app/issue/ENG-4/kid-registration-parent-self-service-form), [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)
