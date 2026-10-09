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

### 2026-10-08 — Sports screen design assumptions, pending director confirmation
- **PRD reference:** sports competition screens (standings, schedule, bracket, score entry, block management)
- **What changed:** The Sports screens in `design/reference/CIS Sports *.dc.html` were designed on these assumptions. Each is a guess, not a confirmed decision, so confirm or correct them before building: (1) league points are 3 for a win and 1 for a draw in every sport; (2) rank is points, then difference (GD/PD/SD/RD), and the knockout is seeded from the table; (3) once games exist, sport, division, format **and league structure** are locked (the brief listed only the first three); (4) clearing a game day sends its unplayed games back to unscheduled and leaves games that already have a result alone; (5) the 7-team placement games ("Placement 1", then 5th place) are a guess and must match the fixture generator; (6) the existing Admin Standings psalm-point column stays separate from sports standings, which carry no spiritual data.
- **Why:** The design brief did not specify these. Still open for the director: whether Program Team (not just Admin) may edit a result after a block is completed, how a viewer with several kids sees "Your team", and whether a division can run two blocks of the same sport.
- **Linear:** not yet filed

### 2026-10-08 — A team has exactly one division, and lasts the whole season
- **PRD reference:** §3.5 / §6 Core Data Model (`Team`); sports standings and scoring
- **What changed:** Every team belongs to one division, Juniors or Ambassadors, and to a season. The team screen no longer offers "Both sessions". A team is not made per sport: the same teams play soccer, volleyball, basketball and dodgeball in turn, and Juniors and Ambassadors are ranked separately. Teams are still created and edited by Admin only, since the permission matrix gives Program Team no roster update. Every role can see team names, because every role views standings.
- **Why:** Standings are per division, so a team that spans both cannot be ranked. Director's answer (2026-10-07): teams stay the same all season. Sports differ between divisions and across seasons, so the sport belongs to a "sport block" (one sport for one division, 3–4 weeks), not to the team.
- **Linear:** [ENG-12](https://linear.app/cis-app/issue/ENG-12), parent [ENG-10](https://linear.app/cis-app/issue/ENG-10)

### 2026-10-05 — Payments recorded by hand until Stripe; form shows how to pay, never whether you have
- **PRD reference:** §3.5 US-PA-01 (Kid Registration); §1.6 / §6 payment processing (Stripe, installment plans)
- **What changed:** (1) Before Stripe exists, the parent form shows the registration fee and the three ways to pay: cash to Maria Ehab or Joseph Tadrous, Venmo to @CIS-stantonios, or PayPal to paypal.me/ChristinSports. The fee is a placeholder ("To be announced") until pricing is confirmed. (2) Nothing on the form or in the kid picker says whether a kid has paid. (3) An Admin records each payment on the roster with its amount and method, one kid at a time or for several ticked kids at once, and can remove one entered by mistake. Partial payments are allowed, so a kid can have several. A "haven't paid" chip narrows the roster to kids with no payment at all. (4) The kid's linked parent may read their own kid's payments through the API, even though the form shows none. Coaches, Program Team and Prayer Team cannot see payments at all. (5) CSV-imported kids start with no payments. The export's payment column is ignored, because it lists how to pay, not whether anyone did.
- **Why:** Families already pay by cash, Venmo and PayPal, and the Admin needs one place to see who has. The PRD's payment story assumes Stripe, which is a v1.0 feature. Keeping payment status off the form avoids a parent seeing "unpaid" because an envelope hasn't been entered yet. (4) follows the permission matrix, which gives "Process payments" to Admin and Parents only. (5) uses the same reasoning as imported consent (2026-09-22): a self-reported or descriptive answer is not proof.
- **Linear:** [ENG-9](https://linear.app/cis-app/issue/ENG-9/registration-payment-methods-on-the-parent-form-admin-payment-tracking)

### 2026-09-28 — Parent self-service registration: multiple kids, locked fields, edit-until-placed
- **PRD reference:** §3.5 US-PA-01 (Kid Registration); §13.1 Q2 (can one parent manage multiple kids?)
- **What changed:** (1) One parent account can register several kids. (2) A returning kid is re-registered by picking them from the parent's own kids; the parent may edit the kid's details, but **not** first name, last name, date of birth or gender -- those change only through an Admin. (3) Submitting again in the same season edits that season's registration and re-stamps consent, but only until an Admin places the kid on a team. (4) Kids imported by CSV are attached to a parent automatically when the parent's confirmed email matches the kid's guardian email. (5) Parents can see the current season.
- **Why:** (1) matches how families actually register. (2) Name and DOB are how returning kids are matched across seasons, so a free edit could turn one child's record into another's. (3) Grade and division drive team placement, so they stop being parent-editable once placement happens. (4) Without it, every one of the ~149 imported kids would be duplicated the first time a parent registers them. The email must be confirmed or anyone could claim another family's children by signing up with their address.
- **Linear:** [ENG-4](https://linear.app/cis-app/issue/ENG-4/kid-registration-parent-self-service-form)

### 2026-09-23 — Kid photos dropped from registration
- **PRD reference:** §3.5 US-PA-01 (registration captures a photo), §6 Core Data Model (`Kid`)
- **What changed:** Registration no longer captures or stores a photo of the kid, by either path. The parent form does not ask for one, and the CSV importer ignores the Google Form's photo question rather than copying the file across.
- **Why:** Decided on 2026-09-23 for simplicity. The Drive access needed to read photos from the Google Form was never resolved (`project_spec.md` §2.8) and was the last blocker on ENG-5; the feature was not worth carrying a half-built pipeline and a bucket of minors' images for. May return in a future version.
- **Linear:** [ENG-4](https://linear.app/cis-app/issue/ENG-4/kid-registration-parent-self-service-form), [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

### 2026-09-22 — Imported consent is surfaced for review, never recorded as consent
- **PRD reference:** §7.3 Non-Functional Requirements (privacy: parental consent required); refines the 2026-09-21 entry below
- **What changed:** The registration form does ask about consent, so the 2026-09-21 entry's reason ("consent isn't captured in the CSV yet") no longer holds — but `consent_given_at` still stays null on import. The answer is instead read into a per-row `consentClaim` flag (`claimed` / `not-claimed` / `inconsistent` / `unknown`) shown on the Admin's review screen, so the Admin can chase the parents who still owe a form. Considered and rejected: recording the form's submission timestamp as `consent_given_at` whenever the parent answered "Yes".
- **Why:** Two reasons from the real 2026-27 export (149 rows). First, the timestamp would be wrong: the "Yes" option reads "I attended camp last September/October and submitted a completed consent form", so it refers to a paper form handed in months before the registration timestamps of 17 Jan – 8 Feb 2026. Second, the answer is not reliable enough to act on: 34 of 149 rows answer the two consent questions inconsistently — claiming a form was already submitted while also selecting that they will submit one later. Recording those as consented would put the system on record as holding consent for minors that the parent themselves did not claim. Under-claiming is the safer failure here; the flag keeps the signal without the assertion.
- **Linear:** [ENG-5](https://linear.app/cis-app/issue/ENG-5/kid-registration-admin-csv-import)

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
- **What changed:** Name is split into first and last. Added gender (Male or Female), T-shirt size (YS, YM, YL, XS, S, M, L, XL, XXL), home address, emergency contact name and phone, and guardian name, phone and email (guardian email required). The kid's own email and phone are optional, as are top sports. Consent is recorded as a timestamp instead of a yes/no. Allergies are kept. Grade, division, T-shirt size, top sports and consent are stored per season, not on the kid.
- **Why:** Team-defined field list from the 2026-09-21 Kid schema review; most of these fields are not covered by the PRD.
- **Update (2026-09-23):** Photo removed from this list -- see the 2026-09-23 entry below.
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
