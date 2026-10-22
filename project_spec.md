# Christ in Sports (CIS) Management App — Project Spec

> This document is the primary context file for AI coding assistants (Claude Code, Codex) working on this repository. Keep it up to date as decisions change. Part 1 covers *what* we're building and *why*. Part 2 covers *how* — the technical design.

---

## Part 1: Product Requirements

### 1.1 Summary

Christ in Sports (CIS) is a church-based program serving kids ages 10–18 at St. Antonious Coptic Orthodox Church in Hayward, CA. The program is organized into two divisions:

- **Juniors** — Grades 4–6, plus 7th graders who choose it
- **Ambassadors** — Grades 8–12, plus 7th graders who choose it

Grades 4–6 must register as Juniors and grades 8–12 as Ambassadors. Grade 7 is the only grade that may choose either division.

CIS combines competitive sports with spiritual development. Kids memorize Bible verses and psalms and are expected to demonstrate Christ-centered sportsmanship toward teammates and opponents. The program is run by ~30 volunteer servants across five functional groups: **Admin/Directors, Program Team, Coaches, Prayer Team**, plus the **Parents** and **Kids** who participate.

### 1.2 Problem Statement

CIS is currently coordinated through manual and fragmented methods (spreadsheets, paper, word of mouth). This causes:

- No single source of truth for schedules, rosters, or scores
- Manual, error-prone attendance and standings tracking
- No structured way to track spiritual progress (verse memorization) alongside sports performance
- Registration and payment collection handled outside any unified system
- Team formation done manually without balancing skill/attributes across teams

### 1.3 Goal

Build a **Progressive Web App (PWA)** that centralizes all operational aspects of CIS — registration, scheduling, attendance, scoring (sports + spiritual), and equipment — into one role-based system that's simple enough for volunteer servants to use without training, and installable like a native app on any phone.

### 1.4 Users & Roles

The app supports **6 roles**. A person may hold more than one role simultaneously (e.g., a Coach who is also on the Prayer Team). New servant accounts start with no role; an Admin grants roles after signup. The `kid` role is the exception: it is never assigned by an Admin, and a kid's account gets it automatically when they self-register (not built yet).

| Role | Who They Are |
|---|---|
| **Admin / Director** | Program leadership — full visibility and control |
| **Program Team** | Servants managing logistics, scheduling, equipment |
| **Coaches** | Lead a specific team (Juniors or Ambassadors division) |
| **Prayer Team** | Manage spiritual content and scoring |
| **Parents** | Register and manage their kid(s), pay for the program |
| **Kids (Ambassadors only)** | Self-register, view their own standings/verses |

### 1.5 Role Permission Matrix

✓ = has access · ✗ = no access

| Feature | Admin | Program | Coaches | Prayer | Parents | Kids |
|---|---|---|---|---|---|---|
| View season calendar | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Update season calendar | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| View sports standings | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Update sports standings | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| View spiritual standings | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Update spiritual standings | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| View full roster | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Update full roster | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Manage attendance sessions, teams & coach assignments | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Assign registered kids to season teams | ✓ | ✓ (team only) | ✗ | ✗ | ✗ | ✗ |
| Archive and restore attendance | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Delete attendance days after confirmation | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| View full-division attendance award standings | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| View kid attendance | ✓ | ✓ | ✓ (own teams) | ✗ | ✗ | ✗ |
| View own team roster | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Update kid attendance | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Update coach attendance | ✓ | ✗ | ✓ (self) | ✗ | ✗ | ✗ |
| Update verse/psalm points | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| View verses & psalms | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Register kids | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ (self) |
| View kid home address & emergency contact | ✓ | ✓ | ✓ (own team) | ✗ | ✓ (own kids) | ✗ |
| Process payments | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ |
| AI team generation | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| View equipment list | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| Update equipment list | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| Submit own servant registration | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| View all servant registrations | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

A servant registration (the season commitment form, which replaced the Google Form) is submitted by any signed-in servant, including one with no role yet. A servant reads only their own; only Admin reads all, because it holds DOB, home address and emergency contacts. Sub-teams on it are a preference and never grant a role.

**Permissions must be enforced server-side via Supabase Row Level Security — never client-side only.**

### 1.6 Feature Scope

#### MVP (build first)
- Role-based app shell with auth for all 6 roles
- Season calendar and daily schedule (view + manage)
- Attendance tracking — kids and coaches, with notes
- Sports and spiritual league standings and scoring
- Equipment inventory and request tracking
- Kid roster via **CSV import** (interim — no self-service registration yet)

#### v1.0 (build after MVP is stable)
- Push notifications and RSVP reminders (Web Push)
- Full in-app kid registration + parent/guardian profile management
- Payment processing with installment plan options (Stripe)
- AI-assisted team generation (Claude API)

#### Future / Not Scoped Yet
- In-app messaging / group chats
- Offline mode
- Inter-team social/competition features

### 1.7 Key User Stories (representative sample)

- **As an Admin**, I want to generate balanced teams using AI so that team composition is fair across skill levels.
- **As a Coach**, I want to log attendance for my team only, with notes, so directors have accurate records and I can flag standout behavior for awards.
- **As a Prayer Team member**, I want to log verse recitations per kid so their spiritual score updates automatically.
- **As a Parent**, I want to register my kid and pay in installments so the process is simple and flexible.
- **As a Kid (Ambassador)**, I want to see standings and this week's verse so I know what to prepare.

Full user stories with acceptance criteria live in the PRD (see `/docs/PRD.md` if present) — this spec captures the essentials needed for implementation.

### 1.8 Non-Functional Requirements

- **Installable PWA** — add-to-home-screen on iOS Safari (16.4+) and Android Chrome
- **~300 total users** (30 servants + ~270 parents/kids) — this is a small-scale system; do not over-engineer for scale
- **No offline mode required** for MVP/v1.0 — assume connectivity
- **Minor data handling** — kids' data (DOB, allergies, etc.) must be treated as sensitive; parental consent required for registration
- **Accessibility** — WCAG 2.1 AA minimum
- **Design system** — see `DESIGN_SYSTEM.md`. Analog sports-clipboard direction (not SaaS dashboard); three colors each with exactly one job — orange for primary actions, ember for sport/results, sage for spiritual content. Read it before building or modifying any UI.

---

## Part 2: Technical Design

### 2.1 UI & Design System

Full spec: `DESIGN_SYSTEM.md` (companion to this file). Key rules that affect how components get built:

- **Color has meaning, not decoration.** `--cis-orange` = primary actions, `--cis-ember` = sport/scores, `--cis-sage` = spiritual content. This mapping must hold on every screen.
- **Tables for tabular data** — standings is a real `<table>`, not a card grid.
- **No status dots** — state is carried by a label, chip, or tick box (also a WCAG requirement).
- **Pill radius (`999px`) is reserved for buttons only** — sheets/chips/tick boxes use their own fixed radii (see `DESIGN_SYSTEM.md` §6).
- **Repeated 8+ utility Tailwind strings become a component or `cva` variant**, not copy-paste.
- Fonts: Caprasimo (display — scores, headings only) + Figtree (UI/body), via Google Fonts.
- `/design/tokens.css` and `/design/tokens.json` are literal — import directly into `globals.css`/`tailwind.config`, don't reinterpret. `/design/reference/*.dc.html` files are prototypes only — rebuild faithfully in React/Tailwind/shadcn, never port the raw markup.

### 2.2 Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 15** (App Router) | Full-stack: server components + API routes |
| Language | **TypeScript** | Strict mode on |
| Styling | **Tailwind CSS** | Utility-first |
| UI Components | **shadcn/ui** | Accessible, Tailwind-native, copy-in components |
| Forms & Validation | **React Hook Form + Zod** | Share Zod schemas between client and server where possible |
| Server State | **TanStack Query** | Caching, refetching, optimistic updates |
| Local/UI State | **React `useState`** + URL search params | No global state library by default — see 2.2.1 |
| Backend + DB + Auth | **Supabase (PostgreSQL)** | Auth, Row Level Security (RBAC), Realtime, Storage, Edge Functions |
| PWA Layer | **Serwist** | Service worker, manifest, installability |
| Push Notifications | **Web Push API + Supabase Edge Functions** | Triggered server-side on relevant events |
| Payments | **Stripe** | v1.0 — full payment + installment plans |
| AI | **Anthropic Claude API** | v1.0 — team generation |
| File Storage | **Supabase Storage** | Documents. *(Kid photos were dropped on 2026-09-23 — see `docs/decisions.md`.)* |
| Error Tracking | **Sentry** | |
| Email | **Resend** | Transactional email, server-side only. Needs `RESEND_API_KEY` and `EMAIL_FROM`; without the key nothing is sent. |
| Hosting | **Vercel** | Preview deploy per PR, auto-deploy `main` to prod |
| CI/CD | **GitHub Actions + Vercel** | Lint, type-check, test, build gate before merge |

#### 2.2.1 State Management Approach

Most state in this app is **server state** — rosters, standings, attendance, calendar events — and belongs in TanStack Query, not component state. Genuine client-only state (modal open/closed, form inputs before submit) should use plain `useState`. Shareable/filterable UI state (e.g. selected division or team filter) should live in the **URL search params**, not a global store — it's bookmarkable and shareable for free.

**No global client state library (e.g. Zustand/Redux) by default.** Add one only if a concrete case emerges where several unrelated components must share client-only state that doesn't fit `useState` or URL params — don't add it preemptively.

**Testing:**

| Layer | Tool |
|---|---|
| Unit & component | Jest + Testing Library |
| End-to-end | Playwright |
| Edge Functions | Vitest |

### 2.3 System Architecture

```
┌─────────────────────────────────────────────┐
│              Next.js App (Vercel)             │
│  ┌───────────────┐   ┌─────────────────────┐ │
│  │ App Router UI  │   │  API Routes /        │ │
│  │ (Server + RSC) │   │  Server Actions       │ │
│  └───────┬────────┘   └──────────┬───────────┘ │
│          │                       │             │
│  Service Worker (Serwist) — PWA installability │
└──────────┼───────────────────────┼─────────────┘
           │                       │
           ▼                       ▼
   ┌───────────────────────────────────────┐
   │              Supabase                  │
   │  Auth │ Postgres + RLS │ Realtime      │
   │  Storage │ Edge Functions              │
   └────────┬──────────────┬────────────────┘
            │              │
            ▼              ▼
      ┌──────────┐   ┌──────────────┐
      │  Stripe   │   │ Claude API    │
      │ (payments)│   │ (team gen)    │
      └──────────┘   └──────────────┘
```

- **Auth** happens through Supabase Auth (email/OTP or magic link). JWT includes role claims used by RLS policies.
- **Roles** live only in `user_roles` and are checked with `has_role('<role>')` (SQL) or `checkRole()` / `getMyRoles()` (server code). There are no `is_staff()` / `is_coach()` helpers or profile flags (removed 2026-10-19, ENG-16). New accounts, created with the shared servant signup code, start with no role until an Admin grants one.
- **All permission enforcement lives in Postgres RLS policies**, not just the UI. The UI hides/shows based on role for UX only — it is not the security boundary.
- **Server Actions / API routes** in Next.js are the only layer allowed to call Stripe and Claude APIs — never call these directly from the client.
- **Edge Functions** handle background/triggered work: sending push notifications, processing scheduled reminders.

### 2.4 Core Data Model

Divisions (`juniors` / `ambassadors`) are an attribute on `Registration` and `Team`, not separate tables. Kids return across seasons, so anything that changes season to season (grade, division, T-shirt size, team, consent) lives on `Registration`, not `Kid`.

| Entity | Key Fields | Relationships |
|---|---|---|
| `User` | id, name, email, phone, created_at | has many `Kid` (as parent), belongs to `Team` (as coach), has many roles via `UserRole` |
| `UserRole` | user_id, role, granted_at, granted_by | belongs to `User` |
| `Kid` | id, first_name, last_name, email?, phone?, gender, dob, allergies, home_address, emergency_contact_name, emergency_contact_phone, guardian_name, guardian_phone, guardian_email, skill_tags[], parent_user_id? | has many `Registration`, belongs to `User` (parent) |
| `Registration` | id, kid_id, season_id, grade, division, tshirt_size, top_sports[]?, consent_given_at?, consent_by_user_id?, team_id?, created_at | belongs to `Kid`, `Season`, `Team` |
| `ServantRegistration` | id, user_id, season_id, full_name, evaluation_status, is_serving, sessions[], juniors_subteams[], ambassadors_subteams[], juniors_other?, ambassadors_other?, notes?, dates_missing?, email, phone, emergency_contact_name, emergency_contact_phone, gender, dob, home_address | belongs to `User`, `Season`; unique on (`user_id`, `season_id`) |
| `Team` | id, name, division, color?, season_id | has many `Registration`, `Game`; has coaches via `team_coaches`; belongs to `Season`. Lasts the whole season, so it has no sport. |
| `Season` | id, name, start_date, end_date, is_current | has many `Event`, `Team` |
| `Event` | id, season_id, title, date, time, location, type | belongs to `Season` |
| `Attendance_Kid` (`attendance_records`) | id, registration_id, day_id, status, note, marked_by, marked_at, method | belongs to `Registration`, `AttendanceDay` |
| `AttendanceDay` | id, season_id, group_id, date, label?, locked, archived_at?, roster_frozen | belongs to `Season`, `AttendanceGroup`; has many attendance records |
| `AttendanceTeamSnapshot` | id, day_id?, registration_id, team_id? | freezes a day's team assignment; null day_id preserves retired team membership independently of days |
| `Attendance_Coach` | id, coach_user_id, event_id, status, note | belongs to `User`, `Event` |
| `Verse` | id, reference, text, point_value, week_theme, is_active | has many `SpiritualRecord` |
| `SpiritualRecord` | id, kid_id, verse_id, points_awarded, logged_by_user_id, date | belongs to `Kid`, `Verse` |
| `SportBlock` | id, season_id, division, sport, format (`league` / `knockout` / `league_knockout`), league_structure? (`round_robin` / `groups`), status (`setup` / `league` / `knockout` / `completed`), starts_on?, ends_on?, settings | one sport for one division over 3–4 weeks; belongs to `Season`; has many `Game`, `SportBlockPlace` |
| `Game` | id, sport_block_id, home_team_id?, away_team_id?, stage (`league` / `knockout` / `placement`), round, label, group_label?, event_id?, scheduled_date?, scheduled_time?, court?, status, winner_to_game_id?/slot, loser_to_game_id?/slot, winner_place?, loser_place? | belongs to `SportBlock`, optionally `Event`; has one `GameResult`. Knockout games say where the winner and loser go. |
| `GameResult` | game_id, home_total, away_total, details, winner_team_id?, tiebreak_winner_team_id?, recorded_by, recorded_at | belongs to `Game`. Replaces `GameScore`. `winner_team_id` is null only for a drawn league game. |
| `SportBlockPlace` | sport_block_id, team_id, place | each team's final place in a completed block; input to the season's overall standings |
| `Payment` | id, registration_id, amount_cents, method (`cash` / `venmo` / `paypal`), received_at, recorded_by | belongs to `Registration`; many per registration (partial payments) |
| `Equipment` | id, item_name, quantity, requested_by_user_id, status | belongs to `User` |

`?` marks an optional (nullable) field. Field notes for `Kid` and `Registration`:

- **Contact fields:** `Kid.email` and `Kid.phone` are the kid's own and optional. `guardian_name`, `guardian_phone` and `guardian_email` are required. `emergency_contact_name` and `emergency_contact_phone` are required.
- **`parent_user_id`** is nullable so a kid can exist (e.g., from CSV import) before the parent has an account. It is linked by `link_my_kids()`, which the parent registration page calls on load: it attaches unlinked kids whose `guardian_email` matches the parent's **confirmed** auth email (case- and whitespace-insensitive), and never takes a kid from another parent. Linking on page load rather than at signup keeps it independent of how signup is built. It depends on email confirmation being enabled in production. The inline guardian fields stay as the contact snapshot either way. One parent may have many kids.
- **`allergies`** holds allergies and medical notes. It is retained from the earlier schema.
- **`grade`** is an integer from 4 to 12. **`division`** must be `juniors` when grade < 7, `ambassadors` when grade > 7, and either when grade = 7. Enforce this with a database `CHECK` constraint on `Registration`; the Zod schema mirrors it for form errors.
- **`tshirt_size`** is one of `YS`, `YM`, `YL`, `XS`, `S`, `M`, `L`, `XL`, `XXL`.
- **`gender`** is an enum: `male` or `female`.
- **`consent_given_at`** replaces a yes/no flag. `null` means no consent, and a registration is not complete until it is set. It is set server-side, together with `consent_by_user_id`. CSV-imported registrations may leave it null for now; the parent registration form always sets it.
- **No photo is stored.** Registration captured one until 2026-09-23, when it was dropped for simplicity and the Drive dependency it carried was removed with it (`docs/decisions.md`, `docs/arch_decisions.md`). The Google Form may still ask for a photo; the importer reports that column as unrecognised and ignores it.
- **`home_address` and the emergency contact** are visible to Admin, Program Team, the coach of the kid's team, and the kid's linked parent (see the §1.5 matrix). Those are the same readers as the roster row, so the row-level `can_read_kid()` policy is sufficient (resolved 2026-09-22, see §2.8).
- **Parents write through `register_kid()`, not table policies.** It creates the kid or updates a returning one, then upserts this season's `Registration`, in one transaction. Consent (`consent_given_at`, `consent_by_user_id`) is stamped inside it with `now()` and `auth.uid()`. For a returning kid the parent may edit everything except `first_name`, `last_name`, `dob` and `gender` (the returning-kid matching key, plus gender), and never `skill_tags`. Submitting again in the same season edits the registration and re-stamps consent, until an Admin assigns a `team_id`. A new registration has `source = 'parent'`. Any signed-in user can read only the current `Season`.
- **Servants write through `submit_servant_registration()`, not table policies.** `user_id`, `season_id` (the current season) and `email` are set by the function; the table grants API roles `SELECT` only, with a policy for the owner and Admin. Submitting again edits the row, and it returns whether the row was new; the first submission of a season sends a confirmation email (no DOB or address in it). A signed-in user with no role is redirected to `/servant-registration` from the home page and the Sports, Attendance and Registration areas. Not serving clears the session and sub-team answers. Any signed-in user can read the current `Season` (the form needs its name).
- **`Registration` is unique on (`kid_id`, `season_id`).** `Attendance_Kid` references the registration through `registration_id`; `SpiritualRecord` still references `kid_id`.
- **Payments are recorded by an Admin, by hand, until Stripe (v1.0).** Writes go only through `record_payments(registration_ids[], amount_cents, method)` and `delete_payment(id)`, both admin-only, with `received_at` and `recorded_by` stamped by the database. The table has no write policy. Admin and the kid's linked parent can read payments; Program Team and coaches cannot. The fee and the payment methods shown to parents are constants in `src/lib/registration/payment.ts`. The fee is `null` (to be announced) until pricing is confirmed. The parent form never shows payment status, and the CSV import never creates payments.

### 2.4.1 Team attendance implementation

- `/attendance` lists current attendance days across registration seasons. Admin and Program choose a date to create a day; there is no session-title, division or season setup step. The roster is populated atomically from active `registrations` joined to `kids`, with coaches marking only their assigned teams.
- Registration/sports seasons remain internal relationships. `attendance_roster_season()` prefers a populated current registration season and falls back to the latest populated season when someone creates an empty current season. This keeps existing kids and team assignments available without changing the global current season. No registrations are copied or deleted.
- `/attendance/teams` manages teams and any number of Coach-role users through `team_coaches`. Admin and Program may rename current teams or delete one after confirmation. Deletion clears kid/coach assignments and sets `deleted_at` / `active=false`, preserving kids, attendance and existing sports references. Active-only name uniqueness allows fresh teams to reuse an archived/deleted name. The coach picker returns IDs and display names through `attendance_coach_options()`; Program gains no access to other profiles or emails. `assign_attendance_team()` changes only team membership and validates the selected roster and division. `?view=archive` shows retired teams, archive dates, original kids and coaches as read-only data.
- `/attendance/[id]` filters by team and searches names. Admin marks any kid; assigned Coaches mark their own teams; Program reads results. Statuses are unmarked, present, absent, late and excused, with an optional note up to 1,000 characters. Changes save immediately and bulk present affects only visible, still-unmarked kids. PostgreSQL enforces identity, season consistency and audit stamps.
- **Archive current attendance** starts fresh attendance/team setup in one transaction: preserve day/team rosters in `attendance_team_snapshots`, lock/archive current days, retire active teams, and clear current registration team assignments. It keeps kids, marks and original coach links. Retired team membership is also stored independently of days, so it remains visible when there were no days or a day is later deleted. Archive links to archived teams; existing day URLs remain readable. A restored day keeps its frozen roster and can be edited by Admin/original assigned Coaches, without reactivating teams or adding registrations. Current registration/sports season selection is unchanged.
- Record RLS resolves frozen/live team membership through `can_access_attendance_record()`. `attendance_day_roster()` returns only permitted attendance display fields for Admin, Program or the original assigned Coach, allowing historical attendance reads without expanding access to a kid's current registration/contact record. Role revocation immediately removes coach access. Summary aggregates enforce the same record scope; the displayed team comes from the most recent included day. The snapshot table has RLS, read-only API grants, and no anonymous access.
- `/attendance/summary` has Current/Archived attendance and team filters, a real table, and CSV export. It reads saved marks across registration seasons. Present includes late; percent divides by marked records, including excused. Attendance no longer exposes a season-rollover action.
- Admin and Program may delete a day from its detail page after a confirmation names the date and permanent loss of all its marks/notes. This works for current, locked and archived days. The existing day-to-record foreign-key cascade removes only that day's records; kids, registrations, teams, coach assignments and other days stay intact. The Server Action validates the ID, checks explicit roles, and uses the existing manager RLS policy.
- `/attendance/awards`, linked from Summary, is Admin/Program only. It lists everyone on the active populated registration roster, including kids without attendance records, with Juniors/Ambassadors and team filters, name search, Current/Archived attendance, sorting by days present/percent/team/name, and CSV export. Division ranks use days present including late, share ties, and skip kids with no marked days; filtering/sorting does not change ranks. Marked/unmarked counts and percentages support staff's final award decision. Archived awards use the same roster; the archived Summary preserves earlier rosters. This composes existing RLS-filtered roster queries and summary aggregates without a new table or RPC.
- All attendance screens use the same fixed bottom `SectionNav` as Registration: Home, Attendance, QR codes, Teams (managers), Summary and Archive. QR codes opens the selected day’s cards; outside a day, `/attendance/codes` redirects to the latest accessible populated current roster or shows an empty state. Visible pages refresh RLS-filtered server data every 10 seconds and on focus. Aggregate RPCs avoid downloading a whole history of record rows or hitting the REST row cap.
- Attendance RPCs require authentication and explicit internal role checks; internal trigger functions cannot be called directly by API users. Schema changes are committed migrations. Hosted MCP migration versions and repository filenames are kept aligned. The unrelated servant-registration migration remains pending.
- Attendance archive migrations `20261021033706_simplify_attendance_archive.sql`, `20261021043453_archive_attendance_teams.sql` and `20261021043716_optimize_attendance_snapshot_policy.sql` are applied to hosted `CIS_App` after local verification. Snapshot policy identity/role checks use per-statement initplans rather than per-row lookups.
- QR check-in: each kid’s stable random UUID is encoded as `cis:attendance:v1:<kid_id>` with no name/contact fields. Authenticated attendance day rosters supply individual and bulk printable cards at `/attendance/[id]/codes` (`?kid=` for one card). Admin/assigned Coaches may start a rear-facing camera scanner on open, non-archived days. The Server Action resolves the code through the authenticated day roster and updates through existing RLS/lock enforcement. Existing present/late marks and notes are preserved. Codes are identifiers, not credentials; possessing a code never grants attendance access. Camera decoding stays in the browser; video/audio is not uploaded or retained.
- Coverage includes date validation, submission/save feedback, execution grants, role/team visibility, archive/restore preservation, empty-current-season roster fallback, deletion scope/permissions and confirmation cancellation, division ranking/ties/zero attendance, and a mobile browser workflow using the shared bottom navigation.

### 2.5 Engineering Requirements

- **RLS policies are mandatory** on every table containing user data — write them alongside the table, not after.
- **Zod schemas** should be the single source of truth for a shape's validation and, where practical, its TypeScript type (`z.infer`).
- **Server Actions preferred** over client-side fetch + API route for mutations, unless a stable REST endpoint is genuinely needed (e.g., Stripe webhooks).
- **No secrets in client code** — Stripe secret key, Claude API key, Supabase service role key stay server-side only.
- **CSV import (MVP)**: build as a server-side parser + validator that maps each row to a `Kid` plus a `Registration` for the active season (matching returning kids to existing `Kid` records on first name + last name + DOB, case-insensitive and whitespace-trimmed, instead of creating duplicates), reports row-level errors, and requires Admin review before committing to the database.
- **Account emails are private.** `profiles` (id, email, display name) is readable only by its owner and Admin, never by signed-out visitors, and a user may edit only their own display name (2026-10-20). A screen that needs another person's name gets a narrow view, not a wider policy.
- **Migrations**: use Supabase CLI migrations, committed to the repo — never make schema changes directly in the Supabase dashboard for anything beyond prototyping.

### 2.6 Git Workflow

Trunk-based development, not GitFlow — appropriate for a 2-developer team with AI coding assistants.

- `main` is protected and always deployable
- Branch naming: `feature/<ticket-id>-short-description`, `fix/<ticket-id>-short-description`
- Branches live 1–3 days max
- Every change merges via PR — **including AI-assisted changes**, no exceptions
- At least one human review required before merge
- Squash-merge to keep history clean
- CI (lint, type-check, test, build) must pass before merge is allowed

| Trigger | Environment |
|---|---|
| Open PR | Vercel Preview URL |
| Merge to `main` | Production (auto-deploy) |
| Local | `.env.local` + Supabase local dev |

### 2.7 Guidelines for AI Coding Assistants (Claude Code / Codex)

- **This file is your primary context.** Re-read it if a task seems to conflict with something here — this file wins unless the human operator says otherwise.
- Work in **small, scoped tasks** — one ticket, one feature, or one bug fix per session. Avoid open-ended requests like "build the attendance module" in one shot; break it into schema → API/server action → UI → tests.
- **Never commit directly to `main`.** Always work on a feature/fix branch and open a PR.
- **Never invent RLS policies loosely** — permissions must match the Role Permission Matrix in Part 1 exactly. If a permission isn't listed, ask rather than assume.
- **Never call Stripe or Claude APIs from client components** — server-side only.
- When adding a table or column, **write the RLS policy in the same change**, not as a follow-up.
- Prefer editing/extending existing patterns in the codebase over introducing a new library or pattern for something already solved.
- **Follow `DESIGN_SYSTEM.md` exactly for any UI work** — don't invent a new color role, reach for a status dot, or wrap standings in cards. If a screen seems to need breaking an anti-pattern, flag it rather than deciding unilaterally.
- Flag any assumption you make explicitly in the PR description if a requirement is ambiguous.

### 2.8 Open Questions (resolve before building the related feature)

- How are spiritual recitation points structured — preset per verse, or set dynamically each time?
- ~~Can one parent account manage multiple kids?~~ **Resolved 2026-09-28:** yes. Many `Kid` rows may share one `parent_user_id`; the parent form lets them pick a returning kid or add another.
- What exact payment amounts / installment structures should Stripe be configured with?
- Are coach-entered kid attributes/ratings visible to parents?
- Is a registration waitlist needed if a division/team fills up?
- ~~How do we enforce that only Admin, the kid's coach and the linked parent can see `home_address` and the emergency contact?~~ **Resolved 2026-09-22:** Program Team may see them too (`docs/decisions.md`), so the set of readers for the contact fields is the same as for the roster row. A plain row-level policy on `kids` is therefore sufficient, and the proposed 1:1 `KidContact` table is not needed.
- ~~Should `Payment` reference `registration_id` instead of `kid_id`, so payments are scoped to a season?~~ **Resolved 2026-10-05:** yes. `payments.registration_id` (`docs/arch_decisions.md`).
- How does the Director calculate and weight the season's final standings across sports? Until this is answered, only each team's place in each sport block is stored (`SportBlockPlace`).
- How do team and individual awards count toward the overall standings?
- In a league table, does head-to-head or goal (point, set, round) difference break a tie in points first? The app uses head-to-head first; the prototype used difference first. `rankStandings` supports both (`src/lib/competition/standings.ts`).
- Should parents be able to see standings without an account (a public share link)? A possible future nice-to-have; standings currently require sign-in.

---

*This spec should evolve alongside the project. Update it whenever a technical decision changes — it is the contract between the product intent and the code being written.*

*Product/scope decisions that deviate from `prd.docx` are logged in [`docs/decisions.md`](./docs/decisions.md); technical/architecture decisions, with their reasoning and alternatives, are logged in [`docs/arch_decisions.md`](./docs/arch_decisions.md).*
