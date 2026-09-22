# CIS Product & Scope Decisions

> A running log of product and scope decisions that deviate from `prd.docx`. This is a living
> doc: it exists so the next PRD revision (v2.2+) can batch-apply these changes instead of the
> team reconstructing "what changed and why" from Linear history. Keep it current.
>
> **This file is for product/scope decisions only.** Technical and architecture decisions go in
> [`arch_decisions.md`](./arch_decisions.md). Current product requirements live in
> [`project_spec.md`](../project_spec.md) Part 1.

## When to add an entry

Any time a Linear issue's acceptance criteria knowingly diverges from what is written in
`prd.docx`, log it here **at the time the issue is created or edited** — not later.

## Entry format

Newest entries go first (reverse-chronological). Keep each entry to a few lines — the Linear
issue holds the detail; this file is the index of "what's now different from the PRD."

- **Date** and **one-line title** as the entry heading (`### YYYY-MM-DD — Title`)
- **PRD reference:** the section / user story it deviates from
- **What changed:** the new behavior or scope, versus what the PRD says
- **Why:** the reason for the deviation
- **Linear:** link(s) to the issue(s) where it lives

---

## Decisions

### 2026-09-22 — Program Team may view home address and emergency contact
- **PRD reference:** §5.2 Role-Feature Permission Matrix; supersedes the 2026-09-21 entry below
- **What changed:** Program Team can now view a kid's home address and emergency contact, alongside Admin, the coach of the kid's team, and the linked parent. The 2026-09-21 entry said the opposite — that Program Team, Prayer Team and Kids could not. Prayer Team and Kids still cannot.
- **Why:** Program Team already has full roster access, and splitting contact fields away from the roster could not be expressed in Postgres RLS, which is row-level rather than column-level. Allowing it removes the need for the separate `KidContact` table that `project_spec.md` §2.8 proposed.
- **Linear:** [ENG-4](https://linear.app/cis-app/issue/ENG-4/kid-registration-parent-self-service-form), [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

### 2026-09-22 — The interim roster data is discarded rather than migrated
- **PRD reference:** §4.1/§4.3 (CSV import as the MVP path for populating the roster)
- **What changed:** The 144 rows in the old flat `registrations` table are dropped rather than migrated into the new `Kid` + `Registration` schema. The roster will be repopulated through the CSV importer.
- **Why:** Confirmed on 2026-09-22 that those rows were dummy test data. They also had no T-shirt size, which the new `Registration` requires, so migrating them would have meant either inventing values or relaxing the schema.
- **Linear:** [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

### 2026-09-21 — CSV-imported registrations may have no consent recorded
- **PRD reference:** §7.3 Non-Functional Requirements (privacy: parental consent required), §3.5 US-PA-01 (liability waiver before submitting)
- **What changed:** For the interim CSV import, `consent_given_at` may be null on imported registrations for now. The parent self-service form still requires consent before it can be submitted.
- **Why:** Team decision on 2026-09-21 for the interim import path; consent isn't captured in the CSV yet.
- **Linear:** [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

### 2026-09-21 — Home address and emergency contact visible to Admin, own-team Coach, and linked Parent only
- **PRD reference:** §5.2 Role-Feature Permission Matrix (no row exists for this data)
- **What changed:** New matrix row. Admin, the coach of the kid's team, and the kid's linked parent can view a kid's home address and emergency contact. Program Team, Prayer Team and Kids cannot. Program Team can still view the full roster without these fields.
- **Why:** Minors' contact data is sensitive; access is limited to the people responsible for that kid.
- **Linear:** [ENG-4](https://linear.app/cis-app/issue/ENG-4/kid-registration-parent-self-service-form), [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

### 2026-09-21 — New kid registration field set
- **PRD reference:** §3.5 US-PA-01 (form captures full name, DOB, grade, division, contact info, allergies, sports preferences/skills), §6 Core Data Model (`Kid`)
- **What changed:** Name is split into first and last. Added photo, gender (Male or Female), T-shirt size (YS, YM, YL, XS, S, M, L, XL, XXL), home address, emergency contact name and phone, and guardian name, phone and email (guardian email required). The kid's own email and phone are optional, as are top sports. Consent is recorded as a timestamp instead of a yes/no. Allergies are kept. Grade, division, T-shirt size, top sports and consent are stored per season, not on the kid.
- **Why:** Team-defined field list from the 2026-09-21 Kid schema review; most of these fields are not covered by the PRD.
- **Linear:** [ENG-4](https://linear.app/cis-app/issue/ENG-4/kid-registration-parent-self-service-form), [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

### 2026-09-21 — 7th graders may choose Juniors or Ambassadors
- **PRD reference:** §1 Overview (divisions), §3.6 Kids (Ambassadors only), §6 Core Data Model (`division`)
- **What changed:** The PRD has Juniors as Grades 4–6 and Ambassadors as Grades 7–12. Now grade < 7 must be Juniors, grade > 7 must be Ambassadors, and grade 7 chooses either.
- **Why:** Team decision in the 2026-09-21 Kid schema review; rationale not captured at the time — fill in.
- **Linear:** [ENG-4](https://linear.app/cis-app/issue/ENG-4/kid-registration-parent-self-service-form), [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

### 2026-09-18 — Parent registration has no approval step or notifications
- **PRD reference:** §3.5 US-PA-01 (submission triggers a confirmation to the parent and a review alert to Admin; parent receives confirmation upon Admin approval)
- **What changed:** Submission writes directly to the registration table and is complete on submit. There is no confirmation notification to the parent, no review alert to Admin, and no Admin-approval-gated confirmation step.
- **Why:** Per the Director/Admin decision recorded in ENG-4: an approval workflow is not needed for this phase. Logged retroactively on 2026-09-21.
- **Linear:** [ENG-4](https://linear.app/cis-app/issue/ENG-4/kid-registration-parent-self-service-form)
