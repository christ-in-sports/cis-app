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

### 2026-09-23 — Drop kid photos entirely
- **Status:** Accepted
- **Context:** Photos were scoped in from the start: a private bucket, `Kid.photo_path` holding an object path rather than a URL, short-lived signed URLs on read, and the CSV importer copying each photo across from the Google Drive link the Google Form produces. None of it shipped. The Drive half was blocked the whole time on service-account access (`project_spec.md` §2.8, open since 2026-09-21), and what did exist was a nullable column, two `import_rows` columns, a bucket, a read-policy helper and two storage policies -- all inert.
- **Decision:** Remove the feature. No photo is stored anywhere: the column, the staging columns, the bucket, its policies and `can_read_kid_photo()` all go, and the CSV importer stops mapping the form's photo question at all (it is reported as an unrecognised column like any other it does not use). The form may keep asking for a photo; nothing reads it. Photos may return in a future version, in which case this entry is the starting point rather than a rediscovery.
- **Consequences / tradeoffs:** The program loses the ability to put a face to a name -- the thing photos were for, and the reason to revisit this. In exchange: no minors' images stored, so the most sensitive data class in the system simply is not held; no dependency on Google Drive API access, which was the last unresolved blocker on ENG-5; and no half-built pipeline or bucket governed by policies nothing writes to, which is exactly the kind of thing that reads as load-bearing to the next person. Nothing is lost on the way out -- `photo_path` was never populated and the bucket has no objects.
- **Reference:** `project_spec.md` §2.2, §2.4, §2.5, §2.8; supersedes [2026-09-21 — Store kid photos in a private Storage bucket](#2026-09-21--store-kid-photos-in-a-private-storage-bucket); Linear [ENG-4](https://linear.app/cis-app/issue/ENG-4/kid-registration-parent-self-service-form), [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

### 2026-09-22 — Replace the flat `registrations` table rather than migrate it
- **Status:** Accepted
- **Context:** The 2026-09-21 decision to split `Kid` from a per-season `Registration` still had to be applied to a live schema whose single flat `registrations` table held one row per kid, with no season concept, plus columns the new model has no place for (`qr_token`, and `attendance` / `attendance_archive` jsonb mirrors).
- **Decision:** Drop the flat table and create `kids` + `registrations` fresh. Its 144 rows were confirmed as dummy data and are discarded; the roster is repopulated via CSV import (see `decisions.md`). `qr_token` and both jsonb columns are dropped with it.
- **Consequences / tradeoffs:** The schema now matches `project_spec.md` §2.4 with no migration shim, and `grade` becomes a real integer (it was text), which also fixes the comparison against `attendance_groups.grade_min`/`grade_max`. In exchange, QR check-in loses its token column, and the jsonb attendance mirror is gone — `attendance_records` is now the only record of attendance, which it already was in practice.
- **Reference:** `project_spec.md` §2.4, §2.5; Linear [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

### 2026-09-22 — The kid identity index is deliberately not unique
- **Status:** Accepted
- **Context:** The CSV importer matches returning kids on first name + last name + DOB, case-insensitively and whitespace-trimmed. The old flat table enforced that combination with a UNIQUE index (`registrations_identity_key`).
- **Decision:** `kids_identity_idx` indexes the same expression but is **not** unique. More than one match is reported as a row-level import error for an Admin to resolve.
- **Consequences / tradeoffs:** Twins, who legitimately share all three values, can both be registered — under a unique index the second would abort an entire import commit. The cost is that the importer must handle the ambiguous case explicitly instead of relying on the database to guarantee a single match.
- **Reference:** `project_spec.md` §2.5; Linear [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

### 2026-09-22 — Attendance functions the app calls were rewritten, not deferred
- **Status:** Accepted
- **Context:** Six database functions read the flat `registrations` table. The initial intent was to leave them all broken and fix each under its own ticket, but four are invoked from the UI, so that would have taken the whole attendance module down — and `main` auto-deploys to production.
- **Decision:** Rewrite the three the app calls (`attendance_summary`, `populate_attendance_day`, `start_new_season`) in the same migration. Drop the `attendance_records_sync` trigger, since it wrote to a column that no longer exists and would have made every attendance write fail hard. Leave `check_in_by_token` broken: nothing calls it, and where the QR token should now live is a genuine open question.
- **Consequences / tradeoffs:** Attendance keeps working, and `attendance_summary` / `populate_attendance_day` are now correctly scoped to a season, which the flat table could not express. `start_new_season` gets simpler — it no longer archives a jsonb blob, because per-season registrations preserve history by construction. QR check-in stays broken until its own ticket.
- **Reference:** `project_spec.md` §2.4; Linear [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

### 2026-09-22 — Roles modeled as a `user_roles` join table, not a `role[]` array on `User`
- **Status:** Accepted
- **Context:** `project_spec.md`'s original Core Data Model sketch put `role[]` directly on `User`. The live schema instead only had two booleans (`profiles.is_staff`, `profiles.is_coach`), which cannot express "Admin only, not Program Team" -- a requirement of ENG-5's CSV import (only Admin may run it). A real role model was needed as a foundation before that importer's RLS could be written correctly.
- **Decision:** Added `user_roles` (`user_id`, `role app_role`, `granted_at`, `granted_by`) as a join table, an `app_role` enum (`admin`, `program`, `coach`, `prayer`, `parent`, `kid`), and a `has_role(role)` SQL helper (`SECURITY DEFINER`, mirroring the existing `is_staff()`/`is_coach()` style) -- rather than a `role[]` array column on `profiles`. `is_staff()` is redefined as `has_role('admin')` only and `is_coach()` as `is_staff() OR has_role('coach')`, which is behaviorally identical to every existing RLS policy that calls them, since this migration does not backfill anyone into `'program'` yet -- widening `is_staff()` to include Program Team is left as a deliberate follow-up once that role has real members, not a side effect of this change.
- **Consequences / tradeoffs:** A join table gets its own RLS (who can grant/revoke roles), an audit trail (`granted_at`/`granted_by`), and a real enum + FK, none of which a `text[]`/`role[]` column offers cleanly. It costs one extra join per role check, mitigated by `has_role()` being the single call site. It needed backfilling: from `profiles.is_staff`/`is_coach` (data-driven, not hardcoded ids), plus an explicit admin grant for the project's Director (`joseph.nabil07@gmail.com`), whose `is_staff` flag was false and would otherwise have been locked out of the Admin-only screens this role model gates. RLS is tested against a real local Postgres (`supabase/tests/roles.test.ts`, run via `npm run test:db`, backed by a new CI job that runs `supabase start` -- Docker ships preinstalled on GitHub-hosted runners) rather than mocked, per `AGENTS.md` §7's non-negotiable coverage for role-based access control.
- **Reference:** `project_spec.md` §1.4, §1.5, §2.4 (`User`/`UserRole`); Linear [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

### 2026-09-21 — Store kid photos in a private Storage bucket
- **Status:** **Superseded** by [2026-09-23 — Drop kid photos entirely](#2026-09-23--drop-kid-photos-entirely)
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
