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

### 2026-10-08 — Sports writes: thin Server Actions over a service layer, courts shared across blocks, trigger functions off the API
- **Status:** Accepted
- **Context:** The competition database functions (ENG-12) do the atomic work, but several decisions sit between a click and a call: which teams a division has, seeding a knockout from a finished league, the per-sport rules for a result, and where a game goes on a game day. The prototype made all of these in browser code, in several separate writes.
- **Decision:** (1) `src/app/sports/actions.ts` is thin, like the registration actions: it authenticates, checks Admin or Program Team (`checkAnyRole`, a list-taking generalisation of `checkRole`), validates with the Zod schemas in `src/lib/validation/competition.ts`, then calls an operation in `src/lib/competition/service.ts`, which takes a Supabase client. Everything that must be atomic is one database function call from there, never several writes. (2) The Admin / Program Team check in the action is UX only; RLS and the `has_role()` checks inside the functions remain the boundary, and the end-to-end tests drive the actions through PostgREST as real signed-in users to prove it. (3) There is no game-day table: a game carries its own date, time and court, and the scheduler is given the cells already held on that date by **every** block, because courts are shared between Juniors and Ambassadors and between sports. A game whose time does not fall on the day's slot grid cannot be mapped onto it and is ignored. (4) Clearing a game day takes only unplayed games off it; a played game keeps its date, time and court, since that is where and when it was played. (5) The three trigger functions the security advisor flagged as callable through the API (`guard_sport_block_shape`, `set_team_season`, `set_day_season`) have EXECUTE revoked; triggers do not need it.
- **Consequences / tradeoffs:** The same operations run in the app and in the tests, so what is tested is what ships. Sharing courts means scheduling one block can fail to place games that a lone block would have fitted, which is the point. Two blocks with different game lengths on the same date can still overlap in time without sharing a grid cell, because only slot-aligned games are considered; scheduling such blocks on separate days avoids it. League standings use head-to-head before goal difference by default (`head_to_head_first`); the library supports the prototype's order too, but nothing in the app lets an admin choose yet, pending the Director's answer.
- **Reference:** Linear [ENG-14](https://linear.app/cis-app/issue/ENG-14), parent [ENG-10](https://linear.app/cis-app/issue/ENG-10)

### 2026-10-08 — Sports competition: sport blocks, an explicit progression graph, computed standings, writes only through functions
- **Status:** Accepted
- **Context:** The prototype it replaces (see 2026-10-07) stored standings, guessed a knockout game's next game from its round and bracket name, and wrote from the browser in several separate calls. That sent the 5th-place winner into the Final, never filled the 5th–8th bracket for some formats, and let results, standings and matches fall out of step.
- **Decision:** (1) A `sport_blocks` row is one sport for one division in one season, with a format (`league`, `knockout`, `league_knockout`) and, for leagues, a structure (`round_robin` or `groups`). Teams are the season's `ministry_teams`, with no sport of their own. (2) Each `games` row names where its winner and loser go (`winner_to_game_id` + slot, or `winner_place`), so the bracket is a graph the database can validate and no code has to infer it. (3) Standings are **not stored**; they are computed from `game_results` in TypeScript (`src/lib/competition/standings.ts`). Only each team's final place in a finished block is stored, in `sport_block_places`. (4) `games`, `game_results` and `sport_block_places` have no write policy; every write goes through a `SECURITY DEFINER` function (`create_sport_block_games`, `record_game_result`, `clear_game_result`, `complete_sport_block`, `set_game_schedule`, `reset_sport_block`) that locks the block, validates, advances teams and stamps `recorded_by` and `recorded_at` from `auth.uid()` and `now()`. `sport_blocks` is written directly by Admin and Program Team, but its `status` column is not writable by anyone; only the functions move it. (5) `games.event_id` is a nullable uuid with no foreign key until the calendar's `Event` table exists.
- **Consequences / tradeoffs:** A result, the teams it advances and its stamps change together or not at all, and standings cannot disagree with scores. Re-ranking costs a read of a block's games and results, which is a few dozen rows for 6–8 teams. The ranking rules are in TypeScript, so `complete_sport_block` for a league trusts the caller's ranked list and only checks it is a permutation of the block's teams. Editing a result is blocked once a later game it fed has been played with a different team; a score correction that keeps the same winner is always allowed. Format, sport, division and season are frozen once games exist and change only through `reset_sport_block`.
- **Reference:** `project_spec.md` §2.4; Linear [ENG-12](https://linear.app/cis-app/issue/ENG-12), parent [ENG-10](https://linear.app/cis-app/issue/ENG-10)

### 2026-10-08 — `ministry_teams.session` renamed `division`; team writes stay Admin-only, reads open to every role
- **Status:** Accepted
- **Context:** `registrations` already spells Juniors/Ambassadors `division` (`project_spec.md` §2.4), but `ministry_teams` still said `session` and allowed null ("both"). A standings table needs every role to read team names, while the permission matrix (§1.5) gives Program Team no roster or team update.
- **Decision:** Rename the column to `division`, make it `NOT NULL` with a named CHECK, add `season_id` (defaulted to the current season by a trigger, the same pattern as `set_day_season()`) and an optional `color`, and make `(season_id, division, name)` unique. Reads are open to any user with any app role (`has_any_role()`); writes stay Admin-only. Any role may also read the current season. `attendance_groups.session` is left as it is. A database trigger tying a registration's team to the registration's division was considered and not added, because the bulk "assign to team" action on the teams screen does not filter by division today.
- **Consequences / tradeoffs:** One naming for one concept on teams. A division mismatch between a kid and their team is not blocked by the database, so it must be handled where kids are assigned to teams. The team screen now requires a division when creating a team.
- **Reference:** `project_spec.md` §2.4; Linear [ENG-12](https://linear.app/cis-app/issue/ENG-12)

### 2026-10-07 — Prototype tournament schema removed, not migrated
- **Status:** Accepted
- **Context:** A "Tournament" module was built before the PRD and spec existed. It ran on its own permission model (`tournament_members`, share codes) and its own `teams`, separate from `ministry_teams`, with no season or division. Its RLS let any signed-in user insert themselves into a tournament as `owner`, and let any member promote themselves to `admin`. All of its data is test data.
- **Decision:** Drop all eleven tournament tables and `get_my_tournament_ids()` in one migration (`20261007230000_drop_tournament_prototype.sql`), delete the routes and components that used them, and remove the `firebase` dependency (only the dropped push tables needed it). The replacement is a season-scoped competition feature (sport blocks, games, results) that uses `has_role()` like the rest of the app.
- **Consequences / tradeoffs:** The security holes close immediately and no second permission model remains. The prototype's useful logic (fixtures, tiebreaks, scheduler) is ported from git history (`b4a77a6`) rather than kept in place. There is no sports competition feature until the replacement ships (ENG-12 to ENG-15); nothing real is lost. Push notifications are redesigned in v1.0.
- **Reference:** Linear [ENG-11](https://linear.app/cis-app/issue/ENG-11), parent [ENG-10](https://linear.app/cis-app/issue/ENG-10)

### 2026-10-05 — Payments are their own table, keyed on registration, written only through functions
- **Status:** Accepted
- **Context:** ENG-9 has an Admin record payments by hand (amount and method, partial payments allowed) before Stripe exists. The spec's `Payment` entity was keyed on `kid_id`, with an open question about moving it to `registration_id`. The simplest option would be `paid_at` / `paid_by` columns on `registrations`, mirroring consent.
- **Decision:** A `payments` table with one row per payment received: `registration_id`, `amount_cents` (integer, CHECKed between 1 cent and $1,000), `method` (CHECKed to `cash` / `venmo` / `paypal`), `received_at` and `recorded_by`. Writes go only through `record_payments(ids[], amount_cents, method)` and `delete_payment(id)`, both `SECURITY DEFINER` and admin-only. The table has **no** write policy. RLS lets Admin and the kid's linked parent read it, and nobody else. Program Team and coaches are deliberately excluded, unlike the rest of the kid's record. The fee and the method details are code constants (`src/lib/registration/payment.ts`), like the waiver link.
- **Consequences / tradeoffs:** Partial payments need more than one row per registration, so columns on `registrations` were ruled out. Keying on the registration scopes a payment to its season, which answers the spec's open question. Integer cents keep sums exact. With no write policy and the time and user derived from `now()` and `auth.uid()`, a payment record can't be back-dated or attributed to someone else, even by an Admin calling PostgREST directly. This is the same reasoning as consent (2026-09-23). Removing a mistake is a hard delete rather than a void flag: for now these are the Admin's own notes of money received, and a void flag can come with Stripe if it's needed. `import_commit()` and `register_kid()` upsert rather than replace the registration, so payments survive a re-import or a parent re-saving the form, and tests cover both. When Stripe arrives it should add its columns here rather than start a parallel table.
- **Reference:** `project_spec.md` §2.4, §2.8; [`decisions.md`](./decisions.md) 2026-10-05; Linear [ENG-9](https://linear.app/cis-app/issue/ENG-9/registration-payment-methods-on-the-parent-form-admin-payment-tracking)

### 2026-09-28 — Parent registration writes go through SECURITY DEFINER functions
- **Status:** Accepted
- **Context:** ENG-4 lets a Parent create a kid and a registration. Until now only an Admin could write either table. The obvious route is to add Parent INSERT/UPDATE policies on `kids` and `registrations`.
- **Decision:** No new write policies. Writes go through `register_kid()`, and imported kids are attached by `link_my_kids()`, both `SECURITY DEFINER` with an explicit `has_role('parent')` check, the same pattern as `import_commit()` and `set_registrations_consent()`. `link_my_kids()` runs when the registration page loads, not at signup. A `seasons` SELECT policy lets a parent read the current season.
- **Consequences / tradeoffs:** A registration is two rows, so one function call means one transaction and no half-registered kid. Consent time and user are derived in the database and cannot be forged by whoever calls PostgREST. An UPDATE policy on `kids` cannot restrict which columns change, so it would let a parent rewrite `parent_user_id`, `skill_tags` and the locked identity fields; the function updates an explicit column list instead. The cost is that the rules live in PL/pgSQL rather than declarative policies, and each error case needs a code the Server Action maps to a message. Linking on page load means it does not depend on the signup flow, at the price of one extra RPC per load; it relies on email confirmation being enabled in production, because with it off Supabase treats every address as confirmed.
- **Reference:** `project_spec.md` §2.4; Linear [ENG-4](https://linear.app/cis-app/issue/ENG-4/kid-registration-parent-self-service-form)

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
