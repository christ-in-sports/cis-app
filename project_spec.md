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

The app supports **6 roles**. A person may hold more than one role simultaneously (e.g., a Coach who is also on the Prayer Team).

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
| `Team` | id, name, sport, division, coach_user_id, season_id | has many `Registration`, belongs to `Season` |
| `Season` | id, name, start_date, end_date, is_active | has many `Event`, `Team` |
| `Event` | id, season_id, title, date, time, location, type | belongs to `Season` |
| `Attendance_Kid` | id, kid_id, event_id, status, note, logged_by_user_id | belongs to `Kid`, `Event` |
| `Attendance_Coach` | id, coach_user_id, event_id, status, note | belongs to `User`, `Event` |
| `Verse` | id, reference, text, point_value, week_theme, is_active | has many `SpiritualRecord` |
| `SpiritualRecord` | id, kid_id, verse_id, points_awarded, logged_by_user_id, date | belongs to `Kid`, `Verse` |
| `GameScore` | id, team_id, event_id, sport, points_scored | belongs to `Team`, `Event` |
| `Payment` | id, kid_id, parent_user_id, total_amount, plan, amount_paid, status | belongs to `Kid`, `User` |
| `Equipment` | id, item_name, quantity, requested_by_user_id, status | belongs to `User` |

`?` marks an optional (nullable) field. Field notes for `Kid` and `Registration`:

- **Contact fields:** `Kid.email` and `Kid.phone` are the kid's own and optional. `guardian_name`, `guardian_phone` and `guardian_email` are required. `emergency_contact_name` and `emergency_contact_phone` are required.
- **`parent_user_id`** is nullable so a kid can exist (e.g., from CSV import) before the parent has an account. It is linked when a `User` signs up with a matching `guardian_email`. The inline guardian fields stay as the contact snapshot either way.
- **`allergies`** holds allergies and medical notes. It is retained from the earlier schema.
- **`grade`** is an integer from 4 to 12. **`division`** must be `juniors` when grade < 7, `ambassadors` when grade > 7, and either when grade = 7. Enforce this with a database `CHECK` constraint on `Registration`; the Zod schema mirrors it for form errors.
- **`tshirt_size`** is one of `YS`, `YM`, `YL`, `XS`, `S`, `M`, `L`, `XL`, `XXL`.
- **`gender`** is an enum: `male` or `female`.
- **`consent_given_at`** replaces a yes/no flag. `null` means no consent, and a registration is not complete until it is set. It is set server-side, together with `consent_by_user_id`. CSV-imported registrations may leave it null for now; the parent registration form always sets it.
- **No photo is stored.** Registration captured one until 2026-09-23, when it was dropped for simplicity and the Drive dependency it carried was removed with it (`docs/decisions.md`, `docs/arch_decisions.md`). The Google Form may still ask for a photo; the importer reports that column as unrecognised and ignores it.
- **`home_address` and the emergency contact** are visible only to Admin, the coach of the kid's team, and the kid's linked parent (see the §1.5 matrix). Postgres RLS is row-level, so this needs a design decision before the migration (see §2.8).
- **`Registration` is unique on (`kid_id`, `season_id`).** `Attendance_Kid`, `SpiritualRecord` and `Payment` still reference `kid_id` for now.

### 2.5 Engineering Requirements

- **RLS policies are mandatory** on every table containing user data — write them alongside the table, not after.
- **Zod schemas** should be the single source of truth for a shape's validation and, where practical, its TypeScript type (`z.infer`).
- **Server Actions preferred** over client-side fetch + API route for mutations, unless a stable REST endpoint is genuinely needed (e.g., Stripe webhooks).
- **No secrets in client code** — Stripe secret key, Claude API key, Supabase service role key stay server-side only.
- **CSV import (MVP)**: build as a server-side parser + validator that maps each row to a `Kid` plus a `Registration` for the active season (matching returning kids to existing `Kid` records on first name + last name + DOB, case-insensitive and whitespace-trimmed, instead of creating duplicates), reports row-level errors, and requires Admin review before committing to the database.
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
- Can one parent account manage multiple kids?
- What exact payment amounts / installment structures should Stripe be configured with?
- Are coach-entered kid attributes/ratings visible to parents?
- Is a registration waitlist needed if a division/team fills up?
- ~~How do we enforce that only Admin, the kid's coach and the linked parent can see `home_address` and the emergency contact?~~ **Resolved 2026-09-22:** Program Team may see them too (`docs/decisions.md`), so the set of readers for the contact fields is the same as for the roster row. A plain row-level policy on `kids` is therefore sufficient, and the proposed 1:1 `KidContact` table is not needed.
- Should `Payment` reference `registration_id` instead of `kid_id`, so payments are scoped to a season?

---

*This spec should evolve alongside the project. Update it whenever a technical decision changes — it is the contract between the product intent and the code being written.*

*Product/scope decisions that deviate from `prd.docx` are logged in [`docs/decisions.md`](./docs/decisions.md); technical/architecture decisions, with their reasoning and alternatives, are logged in [`docs/arch_decisions.md`](./docs/arch_decisions.md).*
