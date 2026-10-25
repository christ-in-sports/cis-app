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

### 2026-10-25 — Parents join through one link in the parent group chat
- **PRD reference:** §5.2 Role-Feature Permission Matrix and the parent registration stories (`project_spec.md` §1.4, §1.5); the rule that only an Admin grants roles (AGENTS.md §4)
- **What changed:** One link, posted in the parent group chat as the Google Form used to be, is how parents get in. They type their name and email, enter a 6-digit code emailed to them, and land on kid registration already holding the Parent role. No password and no Admin approval. They stay signed in on that phone afterwards and only need a new code on a new device or after signing out. Parent is the one role an Admin does not grant; every servant role still is. A parent sees only the kids they registered themselves: kids are no longer attached to a parent automatically by matching the guardian email. The CSV import stays as a backup for families who cannot use the website, and an Admin attaches those kids to a parent account by hand if the parent later joins. One linked parent per kid for now; a second guardian is a later ticket.
- **Why:** About 270 parents, mostly on phones, many not technical. They are used to one link in the group chat, and Admin approval one by one does not scale. Anyone holding the link becomes a Parent, but that only lets them register kids under their own account. Dropping automatic email linking means the shared link can never hand one family another family's kids.
- **Linear:** [ENG-27](https://linear.app/cis-app/issue/ENG-27/parent-onboarding-how-parents-get-into-the-app-and-receive-the-parent) (decision); build: [ENG-28](https://linear.app/cis-app/issue/ENG-28/sign-in-with-a-6-digit-email-code-resend-smtp-login-code-option) email-code sign-in, [ENG-29](https://linear.app/cis-app/issue/ENG-29/retire-link-my-kids-no-automatic-parent-linking-by-email) retire email linking, [ENG-31](https://linear.app/cis-app/issue/ENG-31/parent-join-link-join-grants-parent-after-email-code) the `/join` link, [ENG-30](https://linear.app/cis-app/issue/ENG-30/admin-attaches-a-csv-imported-kid-to-a-parent-account) Admin attaches imported kids

### 2026-10-24 — Parents and kids are not servants: no servant registration for them
- **PRD reference:** §5.2 Role-Feature Permission Matrix (`project_spec.md` §1.5, "Submit own servant registration"); `project_spec.md` §1.4
- **What changed:** The matrix let Parent submit a servant registration. It no longer does: only Admin, Program Team, Coach and Prayer Team can, plus someone with no role yet (a new servant waiting for an Admin). A Parent-only or Kid-only account does not see "My registration" in More, is sent home from the page, and is refused by the database. A Coach who is also a Parent keeps access. The kid list is called "CISers" on screen, and a servant's own form is called "My registration".
- **Why:** Parents are not servants and have nothing to say about serving this season. Showing them the form also asked them for a date of birth, home address and emergency contacts for no reason. How a parent gets an account and the Parent role is a separate open question.
- **Linear:** [ENG-26](https://linear.app/cis-app/issue/ENG-26/app-shell-polish-servant-link-visibility-wording-secondary-button), [ENG-27](https://linear.app/cis-app/issue/ENG-27/parent-onboarding-how-parents-get-into-the-app-and-receive-the-parent)

### 2026-10-22 — Every kid has a photo, so servants can identify them
- **PRD reference:** §3.5 US-PA-01 (registration captures a photo), §6 Core Data Model (`Kid`), §5.2 Role-Feature Permission Matrix; reverses the 2026-09-23 entry below
- **What changed:** Photos are back, at the Director's request. Every kid saved through the app must have one: the parent form requires a photo for a new kid and for a returning kid who has none yet, and any Admin manual add must require one too. CSV-imported kids (the fallback path) are the only exception and are shown to the Admin as "Missing photo" until a parent or Admin adds one. Only the kid's linked parent and Admin can upload. A photo can be replaced but never removed, and the old one is deleted, so each kid has one current photo. Photos are visible to exactly the servants who can see the kid's roster row (Admin, Program Team, the coach of the kid's current team) plus the linked parent. Prayer Team, Kids and archived attendance show none. Consent has no effect on whether a photo can be uploaded. The Google Form's photo question stays ignored by the CSV import.
- **Why:** Coaches and other servants need to put a face to a name, and with ~300 kids they can't do that from a list of names. Since 2026-09-23, registration has moved to the parent form, with the CSV import only as a fallback, so photos can come straight from parents and the Google Drive blocker no longer applies.
- **Linear:** [ENG-21](https://linear.app/cis-app/issue/ENG-21) (ENG-22 schema, ENG-23 Server Actions, ENG-24 UI)

### 2026-10-21 — Servants register for the season in the app (replaces the Google Form)
- **PRD reference:** not in the PRD. The PRD has no servant-side registration; the "CIS Servants Commitment" Google Form did this.
- **What changed:** Each season a servant submits one registration: whether they are serving, which sessions (Juniors, Ambassadors, or both) and, per session, which sub-teams they prefer (Admin, Coaches, Fellowship, Prayer, Program, or Other), plus contact and emergency details, DOB and home address. It is editable at any time, with no approval step and no open or close window.
- **Admin-only visibility:** only the servant and an Admin can read a registration. Program Team, Coaches, Prayer Team and Parents cannot, because it holds DOB, home address and emergency contacts.
- **The Admin servants list (ENG-20):** `/servants`, Admin-only, shows the current season's registrations in a table (name, serving, sessions and teams, phone, last updated). A row opens to every field, including DOB, address and emergency contact, and the list exports to CSV. Spreadsheet-formula characters at the start of typed values are neutralised in the export.
- **Sub-teams are preference only:** they are something an Admin reads when assigning roles. Choosing "Coaches" never grants the Coach role, and "Fellowship Team" is a form choice, not an app role.
- **Why:** Servants were already being counted on a form outside the app. Moving it in lets an Admin see every servant's answers next to the role screen. Past Google Form responses are not imported.
- **Update (the form, ENG-19):** A signed-in user with no role is sent to the form from the home page and the Sports, Attendance and Registration areas, and users with roles reach it from a home-page tile. It prefills from the servant's last registration (dates missing are not carried over). The first submission of a season emails a confirmation without DOB or address; if the email fails the registration is still saved. The Admin list is the next sub-issue.
- **Linear:** ENG-17, ENG-18 (schema, RPC and RLS), ENG-19 (the form).

### 2026-10-19 — One signup code; roles are granted by an Admin after signup
- **PRD reference:** user accounts and roles (signup, the six roles)
- **What changed:** Anyone who is not a parent or a kid signs up with one shared servant code and starts with **no role**. "Servant" is not a role. An Admin then grants the specific roles (Admin, Program Team, Coach, Prayer Team) on an Admin-only screen. The separate staff and coach signup codes are retired, so the code someone was given no longer decides what they can do.
- **Why:** Granting access by whichever code a person received was easy to get wrong and left no record of who approved what. Servants also register for the season in the app (ENG-17) and their preferred sub-team is only a preference an Admin reads when assigning roles.
- **Update (role screen):** Only an Admin assigns roles, on `/admin/roles`. An Admin cannot remove their own Admin role; another Admin can. Changes save immediately.
- **Update (servants only, 2026-10-20):** The roles screen is for servants. It offers Admin, Program Team, Coach, Prayer Team and Parent (a servant may also be a parent), never Kid, and accounts holding the `kid` role are not listed. A kid's account is to get the `kid` role **automatically when they register**, not from an Admin. Kid self-registration is in the spec (`project_spec.md` §1.4, §1.5) but not built yet, so nothing grants `kid` today; whoever builds it must grant the role in the same database function that creates the registration. Parents likewise get the `parent` role through their own signup, which is separate work.
- **Linear:** [ENG-16](https://linear.app/cis-app/issue/ENG-16), [ENG-17](https://linear.app/cis-app/issue/ENG-17)

### 2026-10-08 — Sports screens: how the build differs from the mockups, and no score verification
- **PRD reference:** sports competition screens (standings, schedule, bracket, final places); the Admin Standings design's "unverified" flag
- **What changed:** (1) **Rank is points, then head-to-head among the tied teams, then difference.** The Sports mockups say points, then difference; the Director has not decided, so the library's order is kept and the screen's footnote says so. Both orders are supported in `rankStandings`. (2) **Seed numbers are not shown** in the bracket; seeds are not stored. (3) **No changeover**: a slot is exactly one game long, so the mockups' 45-minute spacing for 30-minute games does not apply. (4) **There is no score verification step**: a saved score is final, so the Admin Standings "unverified" chip and filter are dropped. (5) **"Next up" is the next slot to start in schedule order, not by the clock**, so it is right whenever the page is read. (6) **"Your team"** marks every team the viewer coaches or has a kid on.
- **Why:** (1)–(3) are the answers given when the screens were built, where the designs assumed something the system does not do. (4) follows the 2026-10-07 decision on ENG-10: only Admin and Program Team record scores, and what they save counts. (5) and (6) were not specified; both are the simplest reading that stays correct.
- **Update (score entry, ENG-15 part 2):** (7) **A correction is blocked only when it would swap a team in a game already played**; fixing a score without changing the winner is always allowed, even after the next game. (8) **A tied knockout game's tiebreak winner is asked for on the sheet** (shootout, overtime, extra round, by sport). (9) **Errors use the danger colour, not ember**, and the saved screen does not name who recorded the result yet (only their id is stored).
- **Update (block management, ENG-15 part 3):** (10) **Scheduling shows the arithmetic before you commit** ("3 slots × 2 courts = 6 games. 28 games have no time yet"), not the exact count that will be placed, which depends on every block's games on that day and is reported right after ("6 games placed, 22 left to schedule"). (11) **Manage actions that need no input run in place** (generate fixtures or the bracket, generate the knockout, complete the block) and report in a result strip; scheduling, clearing and resetting open their own screens. (12) **Completing a block needs every game played**; a league-then-knockout block is completed from its knockout, and a league-only block from its league. (13) **Reset needs a tick** and lists what is deleted: games, results, final places, game-day times.
- **Linear:** [ENG-15](https://linear.app/cis-app/issue/ENG-15/competition-ui-sport-setup-schedule-score-entry-standings-and-bracket)

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
- **Update (2026-10-22):** Reversed. Photos are required again; see the 2026-10-22 entry above.
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


### 2026-10-20 — Program manages attendance setup and team assignments
- **Decision:** Per the attendance refinement request, Admin and Program may create sessions and teams, assign registered kids to teams, and assign multiple coaches. Program sees attendance but does not mark kids unless also an assigned Coach. Admin retains full roster edits and role grants.
- **Reason:** Volunteer coordinators need to prepare attendance and follow coach updates without receiving broader kid-edit or account permissions. This expands the previous matrix only for attendance setup and team assignment; it does not expand general roster writes.
- **Reference:** `project_spec.md` §1.5, §2.4.1; technical implementation in `docs/arch_decisions.md` (2026-10-20).


### 2026-10-20 — Attendance uses dated days and an independent archive
- **Decision:** Replace attendance season rollover with a date-only creation form and an Archive current attendance button for Admin and Program. Keep archived days accessible on the website and allow restoring a day. Reuse Registration’s fixed bottom navigation.
- **Reason:** Starting an empty season hid the registered roster and appeared to wipe data. Attendance should keep kids and teams available while archiving only attendance days and marks. The final request to disregard seasons supersedes the earlier season-picker proposal; registration/sports season relationships remain internal.
- **Reference:** `project_spec.md` §2.4.1; technical implementation in `docs/arch_decisions.md` (2026-10-20).

### 2026-10-21 — Confirm day deletion and compare attendance by division
- **Decision:** Per the follow-up request, Admin and Program may permanently delete an attendance day after confirmation. Add an Attendance awards page with Juniors/Ambassadors, team filtering/sorting, and the full active registered roster, including kids with no attendance.
- **Reason:** Coordinators need to remove mistaken days and compare attendance when selecting division awards. Default rank is days present, including late, with shared ties; percentages and unfinished attendance remain visible for staff to decide the award. No automatic winner policy is introduced.
- **Reference:** `project_spec.md` §1.5, §2.4.1; technical decision in `docs/arch_decisions.md` (2026-10-21).

### 2026-10-21 — Attendance archive also retires current teams
- **Decision:** Per the follow-up request, Archive starts fresh team setup as well as archiving attendance. Preserve old teams, kids and coaches for historical views; unassign kids from current teams so coordinators can create new teams. Allow renaming and confirmed deletion of current teams. Archived teams are read-only.
- **Reason:** Archiving represents starting a new season of attendance and team assignments. This supersedes the earlier rule that archiving left current team assignments unchanged. Keep the workflow to one archive button without a season setup form. Restoring a day restores editing of its original roster, not the retired team setup.
- **Reference:** `project_spec.md` §2.4.1; technical decision in `docs/arch_decisions.md` (2026-10-21).


### 2026-10-21 — QR cards for attendance check-in
- **Decision:** Per the feature request, give every kid on an attendance roster a reusable QR card. Offer individual and bulk printer-friendly cards from that day’s roster. An authorized volunteer selects the attendance day and scans cards to automatically mark kids present. Keep manual attendance as a fallback.
- **Behavior:** Scans keep existing present/late marks; absent, excused and unmarked records become present. Locked/archived days cannot be scanned. Cards contain a random identifier only; printed cards display the kid’s name and division. Coaches remain limited to assigned teams, and Program’s read/setup role does not gain attendance-marking permission.
