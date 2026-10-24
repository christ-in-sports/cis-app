# AGENTS.md

> This file is read by AI coding assistants (Claude Code, Codex) at the start of every session. It is the shared source of truth for this repository — both developers and both of your assistants operate off this one file. Keep it current; stale instructions are worse than none.
>
> `CLAUDE.md` at the repo root imports this file via `@AGENTS.md` for Claude Code compatibility — it has no content of its own. **Edit this file, not `CLAUDE.md`.**

> This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

## 1. Project Goal

**Christ in Sports (CIS) Management App** — a Progressive Web App for St. Antonious Coptic Orthodox Church (Hayward, CA) that centralizes registration, scheduling, attendance, sports/spiritual scoring, and equipment tracking for a ~300-person youth sports program (ages 10–18, Juniors & Ambassadors divisions).

It replaces spreadsheets, paper, and word-of-mouth coordination with one role-based system that ~30 volunteer servants can use without training.

**Full product context:** see [`project_spec.md`](./project_spec.md) — read it before working on any feature you're unfamiliar with. This file (`AGENTS.md`) covers *how to work in this repo*; `project_spec.md` covers *what we're building and why*.

**Target launch:** January 2027 (next season start). Team: 2 developers, AI-assisted.

---

## 2. Architecture Overview

```
Next.js 15 (App Router) on Vercel
  ├─ App Router UI — Server Components + Client Components
  ├─ Server Actions / API Routes — the ONLY layer that calls Stripe or Claude API
  └─ Service Worker (Serwist) — PWA installability

        │
        ▼
Supabase (PostgreSQL)
  ├─ Auth — email/OTP or magic link, JWT carries role claims
  ├─ Row Level Security — the real permission boundary (see §4)
  ├─ Realtime — live standings/attendance updates
  ├─ Storage — kid photos (private bucket, signed URLs; ENG-21), documents
  └─ Edge Functions — push notification triggers, scheduled jobs

        │
        ▼
Stripe (payments, v1.0)    Claude API (AI team generation, v1.0)
```

**Stack summary:**

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript strict |
| Styling | Tailwind CSS + shadcn/ui |
| Forms | React Hook Form + Zod |
| Server state | TanStack Query |
| Local state | `useState` + URL search params — **no Zustand/Redux by default** (see §4) |
| Backend | Supabase (Postgres, Auth, RLS, Realtime, Storage, Edge Functions) |
| PWA | Serwist |
| Payments | Stripe (v1.0) |
| AI | Anthropic Claude API (v1.0, team generation) |
| Email | Resend (server-side only) |
| Hosting | Vercel |
| Error tracking | Sentry |

**Core entities:** `User`, `Kid`, `Registration`, `Team`, `Season`, `Event`, `Attendance_Kid`, `Attendance_Coach`, `Verse`, `SpiritualRecord`, `GameScore`, `Payment`, `Equipment`. Full field list and relationships: `project_spec.md` §2.3.

**Six roles:** Admin/Director, Program Team, Coaches, Prayer Team, Parents, Kids (Ambassadors only). A user can hold multiple roles. Full permission matrix: `project_spec.md` §1.5.

---

## 3. Design / UI Guide

Full spec lives in [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) — **read it before building or modifying any UI.** Summary for quick reference:

**Direction:** Analog sports-clipboard, not SaaS dashboard. Dark hardboard shell, cream paper sheets, heavy rules instead of card borders, a display face used sparingly for scores/headings, large tap targets for sideline/on-court use.

**Color system — three colors, each with exactly one job:**
- `--cis-orange` (`#EE6B2D`) — primary actions, active nav, present state
- `--cis-ember` (`#C4341C`) — sport/results (scores, "Game"/"Final" chips)
- `--cis-sage` (`#6F8457`) — spiritual content (verse/psalm points)

This mapping must hold on every screen — a user should be able to tell "this is a score" vs. "this is a verse point" from color alone. Never use `#EE6B2D` for small text (use `#C2531B` instead); text on orange fill is ink `#201E1D`, never white.

**Typography:** Caprasimo (display — scores, headings, team names only, never body copy) + Figtree (UI/body). Full scale in `DESIGN_SYSTEM.md` §5.

**Anti-patterns — do not reintroduce these:**
- No decorative accent bars — color only encodes real state
- Sentence-case headings — no all-caps eyebrow labels
- Standings is a real `<table>`, not a card grid
- No status dots — state is a label, chip, or tick box
- `border-radius: 999px` (full pill) is reserved for buttons only
- Any repeated 8+ utility Tailwind string becomes a component or `cva` variant

**Source of truth hierarchy:**
- `/design/tokens.css`, `/design/tokens.json` — literal, import directly, don't reinterpret
- `/design/reference/*.dc.html` — reference only, rebuild faithfully in React/Tailwind/shadcn, never port raw markup
- `DESIGN_SYSTEM.md` — the bridge doc; update it whenever a design decision changes

**Component inventory** (build once, compose everywhere — see `DESIGN_SYSTEM.md` §7 for the full table): `AttendanceRow`, `GameSheetHeader`, `RunOfDayList`, `StandingsTable`, `DivisionTabs`, `UnverifiedFilterChip`, `VerseProgressBadge`, `BottomNav`, `PrimaryButton`/`SecondaryButton`.

If a new screen seems to need breaking an anti-pattern above, flag it in the PR description rather than deciding unilaterally.

---

## 4. Constraints & Policies

These are hard rules, not preferences. If a task conflicts with one of these, stop and ask rather than improvise.

- **RLS is the real permission boundary.** Every table holding user data needs a Row Level Security policy written in the *same* change that creates the table or column — never as a follow-up. UI-level role checks are for UX only.
- **Check the specific role, never a helper.** Policies, SQL functions and server code call `has_role('<role>')` / `checkRole()` / `getMyRoles()` and name every role they allow. Do not add helpers like `is_staff()` or `is_coach()`, or role flags on `profiles`. Roles are granted only by an Admin; signup creates an account with no role.
- **Permissions must match the Role Permission Matrix exactly** (`project_spec.md` §1.5). If a permission isn't listed there, ask — don't assume or invent one.
- **Never call Stripe or the Claude API from client components.** Server Actions or API routes only. No secrets (Stripe secret key, Claude API key, Supabase service role key) in client-side code, ever.
- **Server Actions are preferred** over client-side fetch + API route for mutations, unless a stable REST endpoint is genuinely needed (e.g., a Stripe webhook receiver).
- **Zod schemas are the single source of truth** for a data shape's validation and, where practical, its TypeScript type (`z.infer<...>`).
- **No global client state library by default** (no Zustand/Redux). Use `useState` for local state, TanStack Query for server state, and URL search params for shareable/filterable UI state. Only introduce a global store if a concrete case emerges where unrelated components must share client-only state — don't add one preemptively.
- **Migrations only.** Schema changes go through Supabase CLI migrations committed to the repo. Never make schema changes directly in the Supabase dashboard beyond throwaway local prototyping.
- **Minor data is sensitive.** Kid records (DOB, allergies, etc.) are treated as sensitive data. Don't log them, don't expose them in client bundles beyond what the current user's role permits, and don't relax RLS on `Kid`-related tables to "make something work quicker."
- **No offline mode assumed for MVP/v1.0.** Don't add offline-first patterns (e.g., local-first sync) unless explicitly asked — it's scoped for a future version.
- **Design system rules are not optional polish.** The color-to-meaning mapping (orange/ember/sage), radii scale, and anti-pattern list in `DESIGN_SYSTEM.md` are deliberate decisions, not omissions. Don't invent a new color role, use a status dot, or wrap standings in cards because it seemed convenient — flag it instead.

---

## 5. Repository Etiquette

**Branching (trunk-based, not GitFlow):**
- `main` is protected and always deployable — no direct pushes
- Branch naming: `feature/<ticket-id>-short-description` or `fix/<ticket-id>-short-description`
- Branches live 1–3 days max
- Every change merges via Pull Request — **including AI-assisted changes, no exceptions**
- At least one human review required before merge
- Squash-merge to keep history clean
- CI (lint, type-check, test, build) must pass before merge is allowed

**Environments:**

| Trigger | Environment |
|---|---|
| Open PR | Vercel Preview URL |
| Merge to `main` | Production (auto-deploy) |
| Local | `.env.local` + Supabase local dev |

**Decision logs (keep them current as you go, not later):**
- If a Linear issue's acceptance criteria knowingly diverges from `prd.docx`, log it in [`docs/decisions.md`](./docs/decisions.md) when the issue is created or edited.
- If a technical/architecture decision is made or changed, add an entry to [`docs/arch_decisions.md`](./docs/arch_decisions.md) and update `project_spec.md` Part 2 in the same PR.
- Product/scope goes in `decisions.md`; technical goes in `arch_decisions.md` — don't mix them. If a change is genuinely both, log it in each and cross-link.

**Working with AI assistants specifically:**
- Work in **small, scoped tasks** — one ticket, one feature, or one bug fix per session. Break "build the attendance module" into schema → server action → UI → tests rather than doing it all in one shot.
- Treat AI-generated PRs like a junior developer's PR — review line by line, don't rubber-stamp.
- Sensitive logic (payments, RLS policies, auth) gets extra manual review regardless of who or what wrote it.
- Commit messages describe intent ("Add RLS policy for Kid table scoped to parent_user_id"), not "AI generated changes."
- PR descriptions state what ticket it closes, what was tested, and **flag any assumption made if a requirement was ambiguous**.
- Keep this file in sync — if you establish a new convention mid-task, update `AGENTS.md` in the same PR, not "later."

---

## 6. Frequently Used Commands

```bash
# Install dependencies
npm install

# Local dev server
npm run dev

# Supabase local dev
supabase start              # spin up local Supabase stack
supabase db reset           # apply all migrations fresh
supabase migration new <name>   # create a new migration file
supabase gen types typescript --local > types/supabase.ts   # regen DB types

# Lint & type-check
npm run lint
npm run type-check

# Build (matches CI/Vercel build)
npm run build
```

> Confirm these against `package.json` scripts — update this list if a script name differs from the above.

---

## 7. Testing Instructions

| Layer | Tool | Command |
|---|---|---|
| Unit & component | Jest + Testing Library | `npm run test` |
| End-to-end | Playwright | `npm run test:e2e` |
| Edge Functions | Vitest (Deno runtime) | `npm run test:edge` |

**What must be tested (non-negotiable):**
- Payment flows
- Role-based access control (a wrong role must not see/edit data it shouldn't)
- Attendance submission logic
- Score calculation and standings ranking
- Registration form validation

**Happy-path coverage only:**
- Calendar event creation, verse/psalm logging, equipment requests

**Skip unit tests, rely on E2E:**
- UI layout and navigation, push notification display

Every PR that touches the items in the "non-negotiable" list must include or update a test — CI will still pass without one, but a reviewer should block the merge.

---

## 8. Attendance conventions

- Attendance UI uses `BoardShell`, `Sheet`, CIS form controls and `AttendanceRow`; mutations go through `src/app/(app)/attendance/actions.ts` with Zod input validation.
- Admin and Program create dated attendance days, rename/delete current teams, manage coach links, and archive/restore attendance. Attendance has no season picker or season-rollover action. Program assigns only `registrations.team_id` through `assign_attendance_team()`; it does not gain general roster write access. Only users holding Coach can be assigned as coaches.
- Admin marks all kids; Coaches read/mark only their assigned teams. Program reads results but cannot mark unless also an assigned Coach. A team link alone never grants a role.
- Admin and Program can delete a single attendance day, including locked/archived days, only after a confirmation naming the date and permanent loss of its marks/notes. Delete the day through the authenticated Server Action; its existing foreign-key cascade removes only that day's records. Keep kids, registrations, teams and other days.
- `/attendance/awards` is Admin/Program only, linked from Summary. Include every active kid on the selected populated registration roster, even with zero records. Rank within each division by days attended (present + late), share ties, and leave kids with no marked days unranked. Team/search filters and sorting never recalculate division ranks. Expose marked/unmarked counts and percent so staff can choose awards without an automatic winner rule. Archived awards use the same roster; the archived Summary retains previous rosters.
- New days snapshot the populated registration roster. `attendance_roster_season()` uses the current registration season when populated and falls back to the latest populated season when the current one is empty. Roster refresh adds missing registrations without replacing marks. Current/archive lists span all registration seasons.
- Archive atomically freezes day/team membership in `attendance_team_snapshots`, locks/archives current days, retires active teams (`active=false`, `archived_at`), and clears live registration team assignments. Kids, marks and old coach links stay available. Null-day snapshot rows preserve retired team membership independently of attendance days. A restored day keeps `roster_frozen` and its original teams; it cannot add registrations or reactivate teams. Archived team names in aggregate summaries come from the most recent included day.
- Archived attendance reads/marks use `can_access_attendance_record(day_id, registration_id)`, which resolves the frozen team or live registration team and requires Admin or an assigned Coach. Program only reads. The narrow `attendance_day_roster()` returns attendance display fields for permitted rows without widening kid/contact RLS. Snapshot tables have RLS and no authenticated writes. Keep role-revocation and old/new-coach isolation tests current.
- `/attendance/teams?view=archive` is a read-only team archive. Current team deletion requires confirmation, clears kid/coach assignments, and soft-deletes the team via `delete_attendance_team()` so existing sports references remain valid. It does not delete kids or attendance. Active-only name uniqueness allows fresh teams to reuse archived/deleted names. Renames validate through `renameTeamInput` and affect current teams only.
- Hosted Supabase grants function execution directly to API roles by default. Revoke from both `PUBLIC` and `anon` for attendance RPCs, and from `PUBLIC`, `anon` and `authenticated` for internal trigger functions. Keep explicit authenticated grants for application RPCs.
- When applying committed migrations through MCP, align repository filenames with the versions actually recorded by MCP; preserve hosted migration-history records.
- Locks, immutable attendance identity, season validation and audit stamps are enforced in Postgres. Keep database permission/submission tests in `supabase/tests/attendance-roles.test.ts` current.
- QR cards use `attendanceQrValue(kid_id)` and `/attendance/[id]/codes` (optional `?kid=`). `scanAttendance()` resolves only through the authenticated day roster and existing RLS; never add anonymous kid lookup or trust client record IDs. Scanning is Admin/assigned Coach only on open, non-archived days; preserve present/late marks and notes. Camera decoding stays local, starts on a tap, and stops on hide/navigation.
- Attendance views refresh server data every 10 seconds while visible and on window focus; no Realtime publication is required. Team/division/archive filters use URL search params. Attendance lists its pages as `SectionTabs` at the top of the board (Days, QR codes, Teams for managers, Summary, Archive) under the app's role-based `AppNav` bottom bar. The QR tab opens the selected day’s cards or `/attendance/codes`, which resolves the latest accessible current roster.

---

## 9. App shell and navigation

- Every signed-in screen lives in the `src/app/(app)/` route group, whose layout renders `BoardShell` and the one bottom bar, `AppNav`, once. Don't render `BoardShell` or a bottom bar in a page or section layout. Auth pages and `/servant-registration` (the only screen for a roleless servant) stay outside it.
- `AppNav` items come from the viewer's roles (`appNavItems`); a section's own pages go in that section's layout as `SectionTabs`, never as a second bottom bar. A tab must lead only to a screen the role may use (`project_spec.md` §1.5); the pages still check access and RLS is the boundary.
- A new screen that is not a daily job is linked from More (`/more`) and listed in `AppNav`'s `also` so More stays lit on it.

## 10. Docs & Further Reading

| Doc | What's in it |
|---|---|
| [`project_spec.md`](./project_spec.md) | Full product requirements + technical design — the "what and why" |
| [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) | Full design system — color tokens, typography, spacing/radii, anti-patterns, component inventory. Read before any UI work. |
| [`docs/decisions.md`](./docs/decisions.md) | Product/scope decisions that deviate from `prd.docx` — read it to see what's now different from the PRD; add to it when a Linear issue diverges |
| [`docs/arch_decisions.md`](./docs/arch_decisions.md) | ADR-style log of technical/architecture decisions — the reasoning and alternatives behind what `project_spec.md` Part 2 records as current state |
| `CLAUDE.local.md` *(gitignored, optional)* | Your personal scratch notes — not shared, not a source of truth |
| `/supabase/migrations/` | Full schema history — read this before writing a new migration |
| `/design/tokens.css`, `/design/tokens.json` | Literal design tokens — import directly, don't reinterpret |
| `/design/reference/*.dc.html` | Design prototypes from Claude Design — reference only, not production code |
| PRD (full version, reference only) | Kept outside the repo — ask a teammate if you need the extended version with detailed sprint plan and open director questions |

---

*Last updated: keep this line current — if you edit this file, update the date below.*
**Last updated:** 2026-10-23
