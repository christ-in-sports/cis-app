# CIS Design System

> Companion to `project_spec.md` — read both before building or modifying any UI. This file
> documents decisions made in Claude Design and how they map onto this codebase. It should
> stay current: update it whenever a design decision changes, the same way `project_spec.md`
> asks you to.

---

## 1. Source of truth

| Source | Status | How to use it |
|---|---|---|
| `/design/tokens.css`, `/design/tokens.json` | **Literal.** | Import directly into `globals.css` / `tailwind.config`. Don't reinterpret values. |
| `/design/reference/*.html` (`.dc.html` files from Claude Design) | **Reference only.** | Design prototypes, not production code. Rebuild faithfully in React/Tailwind/shadcn using our own components — do not port the raw markup. |
| The CIS design system project in Claude Design | **Component reference.** | Holds the built inventory below as small React components, one `.d.ts` props contract and one `.prompt.md` usage note each, plus foundation specimen cards. Read it for exact paddings and states; rebuild in our stack rather than copying. |
| This file | **Living doc.** | The bridge between them: what the tokens mean, which component owns which screen region, and the rules to keep when extending the design. |

Whenever the design is iterated further in Claude Design, run `/design-sync` before the next
UI-focused Claude Code session, re-export `tokens.css`/`tokens.json` if they changed, and update
this file's anti-pattern list or component inventory if a new decision was made.

---

## 2. Design direction

**Analog sports-clipboard, not SaaS dashboard.** A warm off-white page, paper sheets,
heavy rules instead of card borders, a display face used sparingly for scores and section
headings, and large, uncomplicated tap targets meant to be used standing on a court —
this app is checked mid-game on a phone, not browsed at a desk.

Three colors, each with one job (palette "Home and away v2", ENG-32): **slate** for
everything you press or select, **logo orange** for the game (scores, results, the leader row),
**sage** for spiritual content. Everything else is neutral. Nothing you can press is orange.
This mapping is deliberate and should hold across every screen: a user should be able to tell
"this is a button" vs. "this is a score" vs. "this is a verse/psalm point" from color alone,
consistently, everywhere in the app. Orange still leads the brand through the logo; it is just
no longer spent on buttons.

---

## 3. Anti-patterns to avoid

These are deliberate rules the design follows, not omissions — keep them when building new
screens, and flag it if a new screen seems to need breaking one.

- **No decorative accent bars.** A colored rule or fill appears only where it encodes real
  state (orange = game/score, sage = spiritual, slate = present/active) — never as pure
  decoration on a card edge or top.
- **Sentence-case headings.** No all-caps eyebrow labels or label-above-a-label patterns.
- **Tables for tabular data.** Standings is a real `<table>` with sortable header buttons and
  row rules — not a grid of cards. Don't reach for a card layout just because a card
  component is closest to hand.
- **No status dots.** State is carried by a label, a chip, or a filled tick box — never a
  color-only dot (this is also a WCAG requirement, not just a style choice).
- **Consistent radii, not pills everywhere.** 12px chips/stamps, 14px tick boxes, 18px tab
  tops, 26px sheets, 40px shell. `border-radius: 999px` (full pill) is reserved for buttons only.
- **No gradients, textures, patterns or frosted glass.** Flat warm color. The one patterned
  surface in the system is the ruled-paper line grid behind `RunOfDayList`. The one gradient is
  `--cis-logo-gradient` (2026-11-01), sampled from the fish mark, and it is allowed **only** on
  the orange heavy rules inside `.cis-sport-scope` — never under text, on a fill or on a control.
- **No transparency or blur on chrome.** Translucent bars fail in direct sun. The only
  non-opaque value in the system is the `rgba(31,42,51,.07)` hover wash, and only on small
  controls that always sit on a sheet (chips, table rows, the photo picker). A button can sit
  straight on the page, where a wash lets the page show through and the button looks
  transparent, so buttons hover to an opaque colour: a secondary button goes to `--cis-paper`.
- **No emoji**, in labels, empty states or notifications.
- **Repeated utility strings get extracted.** Any Tailwind class string of 8+ utilities
  repeated across instances becomes a component or a `cva` variant, not copy-pasted.

---

## 4. Color tokens

| Token | Hex | Role |
|---|---|---|
| `--cis-action` / hover / press | `#24313D` / `#33414E` / `#1A242D` | **Action.** Primary buttons, selected tabs and chips, ticked boxes, present state, the current stage, links, focus |
| `--cis-action-shadow` / `--cis-ink-on-action` | `#0F161C` / `#FFFEFA` | The 4px stamp shadow under a primary button; text on a slate fill (13.2:1) |
| `--cis-sport` (`--cis-logo-orange`) | `#EE6B2D` | **Sport.** The logo orange as a *surface*, never under text: heavy rules across the Sports section (`--cis-heavy` in `.cis-sport-scope`), the "Next up" outline, the current stage's border. Never on anything pressable |
| `--cis-sport-text` / `--cis-sport-deep` | `#B5481A` / `#8F3912` | Orange as *text*: every score, the leader's rank, standings points, the Next game time, the Sports label (5.3:1 on paper-light); deep is text on the sport tint (6.6:1) |
| `--cis-sport-tint` | `#FDEBDD` | Leader row wash, "Final" chips, the current stage box, sport icon tiles |
| `--cis-danger` / hover / press | `#8E1F17` / `#A3231A` / `#761A13` | **Destructive actions only** — delete, remove. Never a status, never a chip |
| `--cis-danger-tint` / `--cis-ink-on-danger` | `#F7E4E0` / `#FFF6EE` | Hover wash behind an outlined danger action and behind an auth error; text on a danger fill |
| `--cis-sage` / hover / press | `#5F7A4B` / `#6B8756` / `#52693F` | **Faith.** Psalm-point button, verse-huddle rules, verse chips; light text on it (4.8:1) |
| `--cis-sage-tint` / `--cis-sage-text` / `--cis-sage-ink` | `#E6EEDD` / `#46603A` / `#3A4F30` | Verse tint; sage text on light grounds (7.0:1); headings inside a sage tint |
| `--cis-chrome` / `--cis-chrome-tab` | `#24313D` / `#E6E1D7` | The bottom dock (slate); an inactive tab, neutral chip or people/admin icon tile (warm pale, slate text) |
| `--cis-page` | `#F5F1E8` | App backdrop (warm ivory) |
| `--cis-paper-light` / `--cis-paper` | `#FFFDF8` / `#F7F3EA` | Every sheet; `--cis-paper` is for hover washes and things nested in a sheet |
| `--cis-ink` / `--cis-ink-muted` | `#1F2A33` / `#5F5850` | Body and secondary text (muted is 6.9:1 on a sheet, 6.2:1 on the page) |
| `--cis-ink-dark` | `#1A232B` | Heavy rules and ink fills |
| `--cis-ink-on-dark` / muted | `#E9EDF0` / `#B6BEC6` | Text on the slate dock |
| `--cis-rule` / `--cis-rule-soft` / `--cis-rule-dash` | `#E8E1D3` / `#E0D8C8` / `#D8CFBE` | 1px row rule, ruled-paper line, 2px dashed section break |
| `--cis-box-empty` | `#8A9097` | Border of an unticked attendance box (3.2:1) |

Retired on 2026-10-30 (ENG-32): `--cis-orange` as the primary, `--cis-ember`, `--cis-apricot`
and the `--cis-board` browns. Their jobs moved to slate (action), the logo orange (sport) and
the pale slate tab.

**Red and orange, and how to keep them apart.** Danger red and sport orange are both warm. They
are separated by hue (dark red against bright orange) and, more importantly, by **usage**:

- **`--cis-danger` only ever appears on an action** the user can press — a delete or remove
  control — or on an error message. It is never a chip, a status or a score.
- **Sport orange never appears on an action.** It marks the game: scores, "Final" stamps, the
  leader row. It never marks an error.

So a red thing you can press is destructive; an orange thing you cannot press is the game. If a
new screen needs orange or red for anything that is neither, stop and flag it.

**Contrast rules — non-negotiable:**
- Never use `#EE6B2D` for text — use `--cis-sport-text` (`#B5481A`) instead. The large score
  numerals are no exception: a score is always `--cis-sport-text`.
- `#5F5850` is the minimum-safe muted ink on the page and on sheets.
- Nothing sits on an orange fill: dark text on orange was retired (2026-10-30), and white on it is about 3:1. Orange is text, a tint behind orange text, or a rule.
- Text on a slate fill is `--cis-ink-on-action`.
- All body/small text must be ≥ 4.5:1 contrast; large display type ≥ 3:1 (WCAG 2.1 AA, per
  `project_spec.md` §1.8).

---

## 5. Typography

- **Display — Caprasimo 400.** Team names, scores, section headings, rank numerals only.
  Never for paragraphs, never below 17px.
- **UI/body — Figtree 400/600/700/800.** Buttons and table figures use weight 800; verse
  references and the second line of a table row use 600; most other UI is 700.
- **Scale:** 12 (meta) · 13 (chips) · 15 (body) · 17 (rows, names) · 18–22 (section headings,
  display) · 26–34 (scores, matchups).
- **Line-height:** 1.0–1.15 on display type, 1.45–1.5 on body copy.
- **Casing:** sentence case everywhere. Nothing in the system is all-caps.

---

## 6. Spacing & radii

| Element | Radius |
|---|---|
| Chips, stamps | 12px |
| Tick boxes | 14px |
| `DivisionTabs` top corners | 18px (`18px 18px 0 0`) |
| Sheets (cards) | 26px |
| Phone shell | 40px |
| Buttons | full pill (`999px`) — the *only* pill usage |

The 18px tab radius is **the one documented exception** to "do not introduce new steps". It
exists so the active tab reads as a file tab joined to the sheet below it, and the sheet under
`DivisionTabs` squares its own top corners to match. Do not use 18px anywhere else.

**Rule weights**, which stand in for card borders — sheets never take a border:

| Rule | Where |
|---|---|
| 1px `--cis-rule` | A row rule in a list or table body |
| 2px dashed `--cis-rule-dash` | A section break inside a sheet |
| 4px `--cis-ink-dark` | Under a table head (square, not rounded) |
| 5px `--cis-ink-dark` | A region divide inside a sheet (3px radius) |

**Layout:** sheets sit 14px from the shell edge and 14px from each other. The clip pill overlaps
the sheet below it by `-11px`.

Focus state on every interactive element (required, never rely on the browser default):
```css
:focus-visible { outline: 2px solid var(--cis-action); outline-offset: 3px; }
/* On the slate dock (`.cis-on-chrome`) the ring turns pale: var(--cis-ink-on-dark). */
```
Filled buttons: pressed state translates 3px down and shrinks a 4px offset shadow to 1px. The
clip pill uses a 3px offset shadow instead of 4px and does not press.
Tick boxes / rows: `:active` scales to `.94`. Hover changes background only. No animation
beyond that — no bounces, slides or entrance transitions.

---

## 7. Component inventory

Map screens to reusable domain components — build these once, compose everywhere, rather than
one-off markup per screen.

**Shells and primitives** — used by every screen:

| Component | Used for | Notes |
|---|---|---|
| `PhoneShell` | Global | The hardboard frame: 390px, 40px radius, board brown, plus the status bar. `ShellClip` adds the two holes and the orange team pill. |
| `Sheet` | Global | The cream paper card. `tone="light"` is the primary sheet, `tone="paper"` the secondary, with the same fill on the cream page. `joined` squares the top corners under `DivisionTabs`. Ships with `SheetHeading` (Caprasimo 18px, sentence case) and `SheetRule` (the 5px ink rule). |
| `Chip` | Global | The 12px label the three named chips share. Variants: `sport` and `result` (pale orange, orange text: "Final"), `next` (2px orange outline, orange text: "Next up"), `active` (slate fill, a non-game selection), `faith` (sage outline), `tint` (pale slate, neutral labels), `stamp` (rotated -5deg double rule). |
| `Icon` | Global | Wrapper over the Lucide glyph set so stroke-width 2.75 lives in one place. |
| `PrimaryButton` / `SecondaryButton` | Global | Pill radius, light text on slate; `tone="sage"` for spiritual actions; secondary is a 3px ink outline. The shadcn `Button` used by the auth screens maps `default` to slate and `outline` to the same 3px ink outline. |

**Forms** — `src/components/cis/form.tsx`. The design system had no form spec, so these are derived from the rules above rather than from a prototype (see §8) and should be checked against Claude Design when it is next available:

| Component | Used for | Notes |
|---|---|---|
| `Field` | Any labelled control | Sentence-case 15px/700 label, optional hint, error slot. Renders the control through a render prop so `id`, `aria-invalid` and `aria-describedby` stay wired. Required is unmarked; optional fields say "(optional)". |
| `TextInput` / `SelectInput` | Text, date, tel, email, select | 48px tall, 12px chip radius, 2px ink outline on paper-light. Invalid gets a 3px outline. Focus is the standard 2px slate outline at 3px offset. |
| `ChoiceGroup` | Short exclusive lists (gender, T-shirt size, division) | Real radio inputs styled as 12px chips; selected is ink-filled. The whole chip is the tap target. |
| `TickRow` | Checkboxes such as the waiver | Whole row is the tap target; the 44px tick box (14px radius) fills slate with a light ✓ when set, as in `AttendanceRow`. Unticked, its outline is ink rather than `--cis-box-empty`: that tan is about 1.9:1 on paper-light, under the 3:1 WCAG asks of a control's boundary, and a form checkbox is not a glanceable roster mark. |
| `EmailCodeForm` | Sign in by emailed code (`/login`, the parent join link) | `src/components/cis/email-code-form.tsx`. Two steps in one form: email, then the 6-digit code. Built for a first-time parent on a phone: the code box asks for the number pad and `one-time-code`, signs in on the sixth digit, and a wrong code clears the box with a `FieldError`. "Send a new code" counts down 60s (the shortest gap hosted Supabase allows) rather than failing on a tap, and "Use a different email" is one tap. The page supplies `sendCode` / `verifyCode`, so the form never talks to Supabase itself. |

**Validation errors are bold `--cis-danger` text with a warning icon (`FieldError`), `role="alert"`, and the invalid control takes a 3px danger outline.** This is the Sports screens' treatment (§10), applied to every form so an error looks the same wherever it appears, and it keeps ember meaning "this is a score". It briefly used ember on the registration form (2026-09-28) after bold ink proved too easy to miss; that was reversed when the registration screens moved onto the Sports board. Danger on 13px bold text is 8.7:1 on paper-light; the icon and the text carry the meaning, so colour is never the only signal. `--cis-danger` is otherwise for destructive actions (§4); errors are the one other place it appears.

**Domain components:**

| Component | Used for | Notes |
|---|---|---|
| `AttendanceRow` | Coach attendance list | Jersey number, name, verse-recited mark, 44px tick box. Whole row is the tap target. |
| `GameSheetHeader` | Coach home | "Game day" label, date, week/home stamp, matchup block with tip-off countdown. |
| `RunOfDayList` | Coach home | Ruled-paper schedule list; row color varies by type (game = orange, verse = sage). |
| `StandingsTable` | Admin standings | Real `<table>`, sortable headers, rank/team/record/points columns, leader-row wash. |
| `DivisionTabs` | Admin standings | Juniors/Ambassadors switch; active tab joined visually to the sheet below. |
| ~~`UnverifiedFilterChip`~~ | ~~Admin standings~~ | **Dropped 2026-10-08.** There is no score verification step (`docs/decisions.md`), so there is nothing to flag or filter. The Admin Standings reference still draws it; ignore that chip and the "unverified" labels in it. |
| `VerseProgressBadge` | Spiritual/verse screens | Sage-colored, carries psalm-point state — not a bare dot. |
| `KidAvatar` | Rosters, attendance rows, the parent form | A kid's photo, or their initials where there is none (ENG-21). **A square with the 12px chip radius, never a circle**: the full pill is for buttons only (§6). No border, and the initials tile is plain paper with ink text, because slate, orange or sage would read as present, a score or a verse. Sizes: `sm` 40px (a dense list), `md` 56px (an attendance row, big enough to recognise a face from a sideline), `lg` 112px (a form). The photo is decorative (`alt=""`) because the name is always beside it. It keeps the first signed link it sees for a photo, since the attendance screens re-read the roster every 10 seconds and a new link is a new download, and switches only when the photo changes or the link has expired. |
| `BottomNav` | Global (mobile shell) | 4 items, Lucide icons (stroke-width 2.75), 11px labels, 56×48px min tap target. Items are a prop — only the Coach and Admin sets are designed. |

**Photos** — `src/components/cis/kid-avatar.tsx` and `photo-field.tsx`. Derived from the rules above, not from a prototype (see §8).

| Component | Used for | Notes |
|---|---|---|
| `PhotoPicker` | Choosing a photo | **One 112px square that is the control**, left-aligned like the fields around it. Empty, it is a 2px ink outline (3px danger when the form is refused) holding a camera icon and "Add a photo", and tapping it opens the file chooser. With a photo, the photo fills the square and a plain secondary "Replace photo" button sits under it. The words stay because an icon alone is not enough. With a photo, the square is a target for a finger or mouse only (`aria-hidden`, out of the tab order), so the keyboard and screen readers get the one "Replace photo" button instead of two controls that say the same thing. It says what it is doing under the control ("Preparing photo…", since a HEIC from an iPhone can take a second or two to convert, then "Uploading photo…" and "Saving photo…") and is disabled meanwhile so it is not tapped twice. Errors read as a `FieldError`. It uploads the file and hands back the path; the caller decides when to attach it. A button does not support `aria-invalid`, so the refused state is `data-invalid` and the message is tied on with `aria-describedby`. |
| `PhotoField` | The parent form | A labelled group: the label, the hint, then the picker. It is a group, not a `Field`, because `Field`'s `<label for>` would become the control's name and a screen reader would say "Photo, button" instead of "Add a photo". Required is unmarked, as on every form field. The camera in the empty square, not initials, says "a photo goes here": initials are for identifying a kid in a list (`KidAvatar`). |

**Sports components** — designed in `design/reference/CIS Sports *.dc.html` (2026-10-08). All are built from existing tokens; none needs a new color or radius. Rebuild in React; don't port the markup.

| Component | Props | Notes |
|---|---|---|
| `BlockSwitcher` | `blocks[]`, `value` | `ChoiceGroup`-style chips (ink-filled when selected) that switch the sport block under a `DivisionTabs`. |
| `StandingsTable` (extended) | `sport`, `groups[]`, `rows`, `yourTeamId` | Last two columns are labelled per sport: GD/GF, PD/PF, SD/SW, RD/RW. One table or two groups. Rank never changes on re-sort. P and W–D–L are centered, not right-aligned, so they don't touch. "Your team" is a pale slate `tint` chip under the name (the leader's orange wash is taken). |
| `GameRow` + `GameState` | `game`, `state` (final / next up / upcoming / waiting), `canScore` | Real `<table>`: time, court, game. Each score is sport-orange text; Final = pale orange `result` chip, Next up = orange-outline `next` chip, Upcoming = outlined chip, Waiting = dashed chip. Waiting teams read "Winner of Semi-final 1". Writers get an "Enter score" / "Edit score" button. |
| `BracketGame`, `RoundJumpChips` | `label`, `home`, `away` (seed, name or source, score), `winner`, `tiebreak`, `feedsInto` | **Bracket on a phone = rounds stacked vertically**, with jump chips and a "Winner plays …" line instead of connector lines. Byes are a labelled row. A level game shows both scores plus "won on penalties". |
| `ScoreSheet` | `game`, `sport` | Full-screen sheet with a `StickyActionBar` (opaque paper, 5px ink rule on top). No dimming overlay, since transparency is banned. |
| `ScoreStepper`, `SetTable`, `RoundWinnerPicker`, `TiebreakPrompt` | `value`, `quick[]`; `sets[]`; `rounds[]`; `sport` | Per-sport entry. Tiebreak shows only for a level knockout game; league games may draw. |
| `StageTracker` | `format`, `stage` | Boxes joined by a rule: done = ink with a tick, now = pale orange with an orange border and its numeral, later = outlined; each also has a Done / Now / Later label. Never a dot. |
| `BlockAction`, `ResultStrip` | `label`, `disabledReason`; `text` | A disabled action always shows its reason ("3 league games still need a result"). Results read "6 placed, 3 left to schedule". |
| `ConfirmSheet`, `LockedField` | `title`, `deletes[]`, `keeps[]`, `requireTick`; `value`, `reason` | Destructive confirmations use `--cis-danger` and name exactly what goes. Locked fields say why. |
| `AppNav` | `roles` | The one bottom bar, the same on every screen in the app shell (`app/(app)/layout.tsx`): Today · Sports · More for everyone with a role, plus attendance for Admin, Program Team and Coaches ("Attendance" for managers, "My team" for a Coach alone). Faith joins before More when the spiritual module ships. Screens reached from More (roster, servants, roles, import, the parent form) keep More lit. |
| `SectionNav` | `label`, `items[]` | The bottom bar itself, rendered only by `AppNav`. A floating dock rather than a full-width slab (2026-10-29): 14px in from the edges and 10px above the safe area, slate (`--cis-chrome`) ground, shell radius (40px, which is a capsule at this height, so the one non-button full-round shape), 8px of equal padding around 52px-tall items. 11px labels, 56px-wide targets. Every item is pale on the slate dock; the current one sits on a paper-light chip with the sheet radius (concentric with the dock) and slate text (13.2:1). Nothing on the dock is orange (ENG-32). |
| `SectionTabs` | `label`, `items[]` | A section's own pages as a row of text tabs at the top of the board, above the page's `BoardHeader`: 44px tall, chip radius (12px), slate fill with light text when current, pale slate (`--cis-chrome-tab`) with slate text otherwise. Scrolls sideways on narrow screens; a section with one tab for the viewer shows none. Shares `SectionNavItem` and the current-page rule with `SectionNav`. |
| `SportsNav` | `canManage` | Sports' `SectionTabs`: Standings / Schedule / Bracket, plus Manage for Admin and Program Team. Carries `?division=` and `?block=` between them. |
| `AttendanceNav` | `canManage` | Attendance's `SectionTabs`: Days / QR codes / Teams (managers) / Summary / Archive. |
| `RegistrationNav` | `isParent`, `isAdmin` | Registration's `SectionTabs`: Register for a Parent; CISers · Servants · Import · Roles for an Admin. A Parent alone has one tab and sees none. |
| `MenuSheet` + `MenuRow` | `heading`; `href`, `title`, `note`, `icon`, `domain` | A sheet of ruled rows that each link on (heading, 5px rule, hairlines between rows), used by Today and More. A row with an `icon` leads with a 36px chip-radius tile coloured by `domain`: `sport` (sport tint, orange icon), `faith` (sage tint), `people` (default; warm pale, slate icon). The tile is a label; the whole row is the link. `LinkRow` stays for a single row under its own heavy rule. |
| `RegistrationColumn` | — | The column that holds sheets 14px in from the board and 14px apart, used by Registration, Today and More. The board and the bar come from the app shell layout (`app/(app)/layout.tsx`), **rendered once**, not by each page, so they stay on screen while a page loads and between sections. The page behind the sheets is cream (`--cis-page`), so text placed directly on it is ink, with `--cis-orange-deep` for links; controls still go in a sheet. |

**Built so far (ENG-15, part 1 of 3: the screens everyone sees).** In `src/components/cis/`: `Chip` (variants `sport`, `active`, `outline`, `dashed`, `tint`; `faith` and `stamp` stay unbuilt), `Icon`, `Sheet` with `joined`, `DivisionTabs`, `BlockSwitcher`, `StandingsTable`, the schedule table (`ScheduleTable`, with `GameStateChip` and `TeamLines`), the bracket (`BracketSectionView`, `BracketGame`, `RoundJumpChips`), `SportsNav`, and three small ones the designs imply: `BoardShell` (the hardboard behind a screen, with the header), `LinkRow` (a ruled row that links on) and `EmptyNotice` (the waiting state: heading, sentence, optional note and action). Final places is a page in `src/app/sports/places`. **Part 2 (score entry):** `ScoreStepper`, `QuickPoints`, `SetTable`, `RoundWinnerPicker`, `PickButton` and `ScoreNumber` in `score-controls.tsx`, and `ScoreLink` (the "Enter score" / "Edit score" link scorers see under a game). The sheet itself, the tiebreak prompt, the clear confirmation and the saved panel live with the screen in `src/app/sports/score/[gameId]`: they are specific to it, so they are not shared components, and `ScoreSheet` / `TiebreakPrompt` / `StickyActionBar` from the table above are built as that page rather than as separate parts. **Part 3 (block management, `/sports/manage`):** `StageTracker` (boxes joined by a rule, each with a Done / Now / Later word), `ResultStrip`, `ActionNote` (a lock and the reason an action is closed), `Fixtures` (the three counts) and `LockedField`, in `stage-tracker.tsx` and `manage-parts.tsx`; plus `BlockSwitcher` gained an optional icon. The block form, the schedule / clear / reset forms and the action list live with the screens, not as shared components, because only Manage uses them; `BlockAction` is the action list, and `ConfirmSheet` is built as the reset and clear screens. ENG-15 is now fully built.

**Where the code deliberately differs from the Sports mockups** (decided 2026-10-08, `docs/decisions.md`):
- **No seed numbers** beside team names in the bracket. Seeds are not stored. Byes, "Winner plays …" and waiting games are as drawn.
- **Rank is points, then head-to-head among the tied teams, then difference** (the mockup footnote said points, then difference). The footnote on the standings screen says what the code does.
- **Slots are exactly one game long.** The mockups space slots 45 minutes apart for 30-minute games ("plus changeover"); there is no changeover setting, so 30-minute games run at 9:00, 9:30, 10:00.
- **Sort headers are 34px tall**, as drawn, which is under the 44px tap minimum (see Open items).
- **"Your team"** flags every team the viewer coaches or has a kid on, so a family with two kids on two teams sees both flagged.
- **The Sports screens stand on the board, not on the cream page.** The sheet sets its own ink text (`Sheet`), because the board's text is pale.

Decided on these screens: **teams are identified by name only**. No team-color swatch is shown, because any team hex could collide with slate, orange or sage and read as status.

Disabled buttons (not specified before): `--cis-track` fill, `--cis-ink-muted` text, no shadow. Disabled outline buttons use a `--cis-box-empty` outline.

Each of these should be a real component in the codebase (not a one-off per-screen block) so
new screens compose from the same set instead of reinventing layout.

---

## 8. Screens delivered so far

- **Coach game-day home** (`CIS Coach Home Clipboard.dc.html` — chosen direction). Purpose: a
  coach on the sideline needs, in order, what/when the game is, who's here, what's next.
  Alternate darker "scoreboard" take (`CIS Coach Home.dc.html`) kept as reference only.
- **Admin standings** (`CIS Admin Standings.dc.html`). Purpose: an admin checks both divisions
  quickly and spots scores needing verification.

- **Sports screens** (`CIS Sports Standings`, `Schedule`, `Bracket`, `Score Entry`, `Score Rules`,
  `Manage Stages`, `Manage Forms`, `Final Places`, `Navigation` `.dc.html`). Standings, schedule,
  bracket and final places for everyone; score entry and block management for Admin and Program
  Team. Assumptions behind them are logged in `docs/decisions.md` (2026-10-08).
- **Registration** (`/register`, `/registrations`, `/admin/imports`). Moved onto the Sports board
  with `RegistrationFrame`, a `BoardHeader` and the Registration bottom nav (2026-10-14), so the
  app reads as one product. **Designed in code from this document's rules and the Sports
  screens, without a Claude Design prototype** — none existed. Treat as provisional.
  - *Parent form:* a picker sheet ("Who are you registering?"), then one sheet per section (about
    the kid, this season, parent/guardian + emergency contact, waiver). Nothing on it is
    colour-coded: a registration is neither a score nor a verse, so orange marks only the primary
    action and ticked state.
  - *Roster:* the search box, grade filter and "still owe" chips share one sheet at the top.
  - *Import:* an error that used to sit on the page now sits in a paper sheet.

State shape for reference (local UI state — real app fetches roster/schedule/standings/verified
flags from Supabase):
- Coach home: `present: boolean[12]` (roster order), derived present count.
- Standings: `division`, `sortKey`, `sortDir`, `flaggedOnly`.

Sorting: tapping a header sets/flips sort key; rank is always computed from record then point
differential, independent of sort — the rank number never changes on re-sort.

---

## 9. Assets

- **Logo:** one file only — an orange low-poly ichthys over a hand-lettered "Christ In Sports"
  script, on transparency (PNG, 1060×647). **There is no vector version, no reversed/white
  version and no icon-only lockup.** It holds on `--cis-page`, `--cis-paper` and
  `--cis-paper-light` only — never on an orange, slate or sage fill.
  Keep clear space equal to the height of the script line; do not set it below 120px wide.
  Never redraw, recolor or reconstruct the mark. Vector and reversed artwork are still needed
  from the program before shipping.
- **Icons:** [Lucide](https://lucide.dev), stroke-width 2.75 — 24px in the app, 16px in the
  status bar, 14px at weight 3 inside a chip. Line only: no filled or duotone glyphs, no icon
  backgrounds or circles. **This is a substitution** — CIS supplied no icon set. Replace it if
  one exists. Emoji are never used as icons; the only unicode glyphs used are the sort carets
  (▾ ▴), the attendance tick and dash (✓ —), and the en dash between scores.
- **Fonts:** Caprasimo and Figtree, Google Fonts. No licensed binaries were supplied.

---

## 10. Open items

- **Sports screens, decided in ENG-15 part 2:** (1) the score numerals are tokens, `--cis-display-score` 72px (the number being set), `-md` 64px (two numbers side by side, volleyball and dodgeball totals) and `-sm` 56px (the saved result), as Tailwind `text-cis-score`, `-md`, `-sm`; (2) errors beside scores use `--cis-danger` with a warning icon, never sport orange, so orange keeps meaning "this is the game". Still open: (3) standings sort headers are 34px tall, under the 44px tap minimum, as in the Admin Standings reference; (4) navigation: built as a proposal on 2026-10-23 (see the note at the end of this section) and awaiting a design reference — one role-based `AppNav` bottom bar (Today · Sports · Attendance/My team · More, Faith to come) and `SectionTabs` at the top of each section, replacing the per-section bottom bars; (5) the designs show "Recorded by Mina" and a time on the saved screen, but results store only the user id, so the saved screen says "Recorded result" until the name is read through a profile join.
- Vector logo artwork, plus a reversed/white version for dark grounds (currently raster only,
  light grounds only).
- The program's own icon set, if one exists, to replace Lucide.
- Remaining MVP screens not yet designed: role-based nav shells for Program Team, Prayer Team,
  Parent, and Kid roles (the parent *registration* screen exists, provisionally — see §8; the
  parent nav shell does not); equipment inventory; season calendar; verse/psalm logging flow (Prayer
  Team side); CSV import review screen. The components in §7 compose these, but the screens
  themselves must be designed — do not infer them, and do not assume `BottomNav`'s item set.
- Confirm this direction holds up at data-dense edges (full roster view, equipment list) before
  treating it as fully validated — see the step-by-step validation pass in the team's process
  notes.

---

*Product/scope decisions that deviate from `prd.docx` are logged in [`docs/decisions.md`](./docs/decisions.md); technical/architecture decisions are logged in [`docs/arch_decisions.md`](./docs/arch_decisions.md).*


### Attendance implementation (2026-10-20)

Attendance now composes the shared hardboard shell, cream sheets and CIS form controls. `AttendanceRow` owns named status selection, pending/saved feedback and an optional note. Present uses orange with ink text; other attendance states use neutral ink and explicit labels. Team/division controls and summary tables follow the existing form/table conventions. Tap targets are at least 44px, headings use sentence case, and icons/emoji are not used as substitutes for labels. No new design tokens are introduced.


Attendance refinement: the top text navigation is replaced by the existing fixed `SectionNav` used in Registration, with Home, Attendance, Teams (managers), Summary and Archive. Date-only day creation and a single archive action replace attendance season setup. Archived days use neutral text and their saved marks, with a Restore day action for managers. Existing tokens, icon weights, active-state colors and safe-area spacing are unchanged.

Attendance deletion uses the existing outlined `DangerButton` and a native confirmation naming the date and irreversible loss of marks/notes. Attendance awards is reached from Summary and keeps Summary active in the bottom bar. It uses existing labeled select/search controls and a real horizontally scrollable table; rank is neutral text, ties share a rank, and no color implies an automatic award winner. CSV follows the visible filters and sort.

Team rollover refinement (2026-10-21): Archive confirmation explicitly includes attendance and teams, explains that kids become unassigned, and keeps the old rosters accessible. Teams has a Current/Archived selector. Archived teams show their archive date, coaches and an expandable roster; current teams have an expandable Edit team form with Save team name and the existing outlined DangerButton for Delete team. Deletion confirmation explains assignment removal and attendance preservation. Restoring an archived attendance day preserves its original roster and does not restore current teams. No new navigation items or design tokens are introduced.


QR attendance (2026-10-21): open days show a Scan attendance sheet with explicit Start/Stop camera controls, camera preview, and announced save/error feedback. Each roster row links to an individual QR card; the roster also links to bulk cards. Card pages use black QR modules on white with a four-module quiet zone. Print removes navigation/actions and arranges cards in two columns with dashed cutting guides and no card splits. Existing form/button/sheet tokens are reused; no new colors or radii are introduced.

QR card page spacing: the print action occupies its own row. Secondary navigation sits below a neutral rule, stacks with separate tap targets on narrow screens, and wraps with explicit gaps on wider screens. Instruction text uses relaxed line spacing.

Attendance bottom navigation includes a labeled QR codes tab using the Lucide QrCode icon. It opens the selected day’s cards, or the latest accessible current roster when outside a day. QR card pages activate only the QR codes tab. The shared bar scrolls horizontally on very narrow screens to preserve its 56px minimum targets.

Kid photos (2026-10-23): every kid has one, so the parent form opens with a Photo field, and a kid without one reads "Photo needed" in the parent's picker with the action "Finish". The Admin roster shows the avatar beside each name, a "Photo on file / No photo yet" line with Replace photo in the details, and a "N still need a photo" toggle chip beside the consent and payment chips. It reuses the roster's existing `ChaseChip` and is kept in the address (`?photo=missing`) rather than in state. The `UnverifiedFilterChip` named in the ticket was dropped on 2026-10-08, so `ChaseChip` is the toggle chip. The photo picker is one square (a camera and "Add a photo" when empty; the photo with "Replace photo" under it once there is one). Attendance rows show a 56px avatar, and the team assignment list a 40px one; archived attendance days show initials only. No new tokens, radii or colours are introduced.

App shell and navigation (2026-10-23): every signed-in screen except the servant registration form shares one frame, `app/(app)/layout.tsx`, with one bottom bar (`AppNav`). Its items depend on the viewer's roles: Today, Sports and More for everyone; attendance for Admin, Program Team and Coaches, labelled "Attendance" for those who manage it and "My team" for a Coach alone; Faith will sit before More once the spiritual module ships. Sections no longer swap the bottom bar: their pages are `SectionTabs` at the top of the board (Sports: Standings / Schedule / Bracket / Teams / Manage; Attendance: Days / QR codes / Teams / Summary / Archive; Registration: Register, or CISers / Servants / Import / Roles). The first Attendance tab is "Days" so it does not repeat the bar's "Attendance". Today (`/`) replaces the old card-grid home with role-based shortcuts in `MenuSheet`s; More (`/more`) holds the servant's own registration, the parent's Register, the Admin's season tools, the archives and Sign out. The tab style is new — a 44px chip-radius tab, orange when current — and needs a design reference before it is treated as agreed; no new tokens or colours are introduced.

Polish (2026-10-24, ENG-26): the screen of registered kids (`/registrations`) is called "CISers", the program's own word for the kids, in the Registration tab, More and its headings; "Roster import" keeps its name until confirmed. The More row for a servant's own form reads "My registration", and so does that page's title, since it is the season form and there is no profile page. A Parent or Kid account sees neither the row nor the page. A secondary button now hovers to the opaque `--cis-paper` instead of a translucent wash, so it no longer looks transparent on the dark board (§3). No new tokens, radii or colours.

Teams navigation (2026-10-24): `/teams` lives in the shared app shell, with its existing current/archive selector and division control. Today and More expose Teams only to Admin/Program, as do the Teams links in Attendance and Sports section tabs. More stays active in the app bar on Teams. Existing sheets and form controls are reused; no new tokens or control variants.

Cream page (2026-10-29): after a critique of the brown shell (muddy against the orange fish logo, glare-prone outdoors, and a different mood from the cream login), `BoardShell` is now `--cis-page` with ink text, and the header kicker and meta use `--cis-orange-deep` and `--cis-ink-muted`. `--cis-orange-text` is 4.5:1 on a sheet but only 3.4:1 on `--cis-page`, so orange text placed directly on the page uses `--cis-orange-deep` (5.0:1); inside a sheet it stays `--cis-orange-text`. The brown stays only on the `AppNav` bar, inactive `SectionTabs` and `DivisionTabs`, and the clip. Sheets, rules, radii and every other token are unchanged. The logo may now sit on the page ground it was designed for.

Home and away v2 palette (2026-10-30, ENG-32): orange stops being the button colour. After comparing ten palette prototypes, actions and selection (primary buttons, selected tabs, ticked boxes, the present state, the current stage, links, focus) are slate `#24313D`; the logo orange is the sport colour (score badges with dark digits, "Final" stamps, the leader row); sage stays faith; ember, apricot and the brown board are retired. It fixes the old palette's real flaw: ember sat 11° of hue from orange, so a score and a button were hard to tell apart, and now nothing pressable is orange. The page is `#EEEDE8` with `#FFFEFA` sheets, the dock is slate with a paper-light current chip, and inactive tabs are pale slate. Auth screens (login, signup, forgot and reset password, join) share the display-face heading, slate buttons, 3px ink outline secondaries and danger-tint error boxes. Earlier dated notes above that mention orange buttons, ember or the brown board describe the old palette.

Colour by domain (2026-10-30, ENG-32): content-only colour left most screens slate and grey, because most screens hold no score or verse. Three changes spread orange and sage without making anything pressable orange: (1) every Today and More row carries a domain icon tile (orange for anything about the game, sage for faith, warm pale slate for people and admin); Sports screens' `BoardHeader` takes `sport`, which turns the kicker sport orange with a trophy; standings points are sport orange like the leader's rank. (2) Today leads with `NextGameCard`: the next scheduled game (the viewer's own team's when they have one, from `nextGame()`), teams in the display face and the time on a logo-orange badge, with the logo at 120px in the header, replacing the "Hi, name" note. (3) The neutrals warm up: page `#F5F1E8`, sheets `#FFFDF8`, rules `#E8E1D3`, muted ink `#5F5850`, pale tab `#E6E1D7`. A "This week's verse" card for Today is designed but waits on verse data.

More orange in Sports, no dark text on orange (2026-10-30, ENG-32): the score badges (dark digits on a logo-orange fill) are retired, and so is `--cis-ink-on-sport`. Scores, the Next game time and every other orange word are `--cis-sport-text`. To give the Sports section more orange, heavy rules there (the 5px `SheetRule`, table-head rules, the action bar's top rule) take `--cis-heavy`, which is ink by default and the logo orange inside `.cis-sport-scope` (the Sports layout and the Next game card). "Final" is a pale orange chip, "Next up" an orange outline, and Manage's current stage a pale orange box with an orange border. Buttons, tabs and the block switcher stay slate: nothing pressable is orange.

Logo-gradient rules (2026-11-01, ENG-32): after a prototype comparing flat orange with three gradients, the orange heavy rules in Sports and on the Next game card use `--cis-logo-gradient`, left to right `#E3602A` → `#EE6B2D` → `#F48344` → `#F9A14F`, sampled from the fish mark (deep at the tail, golden at the head). Rules drawn as fills (`SheetRule`, Manage's day form) read `--cis-heavy-fill`; rules drawn as borders take it through `border-image`, and table-head rows paint it behind a transparent border because a collapsed table ignores `border-image` on rows. Outside `.cis-sport-scope` every heavy rule stays flat ink. This is the single exception to the no-gradients rule in §3.

### Appearance (2026-11-03)

The global Appearance selector offers Light, Dark and System (default), including on auth
screens. The choice persists on the device. Dark mode uses charcoal pages and slate sheets,
light warm ink, pale slate actions with dark ink, brighter orange score text and sage faith
colors. Semantic roles, geometry and typography stay the same. `:root.dark` in
`design/tokens.css` and the `dark` overrides in `design/tokens.json` define the palette;
shadcn semantic tokens follow it. The light-palette contrast examples above apply to light
mode; both palettes must meet the same AA thresholds. Hover washes use theme tokens.
QR cards retain black text and white backgrounds for scanning and printing.
