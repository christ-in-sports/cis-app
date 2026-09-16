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
| This file | **Living doc.** | The bridge between the two: what the tokens mean, which component owns which screen region, and the rules to keep when extending the design. |

Whenever the design is iterated further in Claude Design, run `/design-sync` before the next
UI-focused Claude Code session, re-export `tokens.css`/`tokens.json` if they changed, and update
this file's anti-pattern list or component inventory if a new decision was made.

---

## 2. Design direction

**Analog sports-clipboard, not SaaS dashboard.** A dark hardboard shell, cream paper sheets,
heavy rules instead of card borders, a display face used sparingly for scores and section
headings, and large, uncomplicated tap targets meant to be used standing on a court —
this app is checked mid-game on a phone, not browsed at a desk.

Three colors, each with one job — orange for primary actions, ember (red) for sport/results,
sage (green) for spiritual content. Everything else is neutral. This mapping is deliberate and
should hold across every screen: a user should be able to tell "this is a score" vs. "this is a
verse/psalm point" from color alone, consistently, everywhere in the app.

---

## 3. Anti-patterns to avoid

These are deliberate rules the design follows, not omissions — keep them when building new
screens, and flag it if a new screen seems to need breaking one.

- **No decorative accent bars.** A colored rule or fill appears only where it encodes real
  state (ember = game/score, sage = spiritual, orange = present/active) — never as pure
  decoration on a card edge or top.
- **Sentence-case headings.** No all-caps eyebrow labels or label-above-a-label patterns.
- **Tables for tabular data.** Standings is a real `<table>` with sortable header buttons and
  row rules — not a grid of cards. Don't reach for a card layout just because a card
  component is closest to hand.
- **No status dots.** State is carried by a label, a chip, or a filled tick box — never a
  color-only dot (this is also a WCAG requirement, not just a style choice).
- **Consistent radii, not pills everywhere.** 12px chips/stamps, 14px tick boxes, 26px sheets,
  40px shell. `border-radius: 999px` (full pill) is reserved for buttons only.
- **Repeated utility strings get extracted.** Any Tailwind class string of 8+ utilities
  repeated across instances becomes a component or a `cva` variant, not copy-pasted.

---

## 4. Color tokens

| Token | Hex | Role |
|---|---|---|
| `--cis-orange` | `#EE6B2D` | Primary. Filled buttons (ink text), active nav, progress fill, present state |
| `--cis-orange-text` | `#C2531B` | Orange as *text* on cream (passes 4.5:1). Links use this, `#9C3E12` on hover |
| `--cis-ember` | `#C4341C` | Sport: scores, "Game"/"Final" chips, unverified flags, leader rank |
| `--cis-sage` | `#6F8457` | Spiritual: psalm-point button, verse-huddle rules, verse chips |
| `--cis-apricot` / tint | `#FFC98E` / `#FFE3C4` | Highlights on dark grounds; chip fills (pair with `#9C3E12` text) |
| `--cis-page` | `#E9DCC6` | App backdrop |
| `--cis-paper-light` / `--cis-paper` | `#FFFCF6` / `#F3E7D4` | Primary and secondary paper sheets |
| `--cis-ink` / `--cis-ink-muted` | `#241F1C` / `#5E534A` | Body and secondary text |
| `--cis-ink-dark` | `#201E1D` | Dark scoreboard ground (alternate/non-clipboard variant) |
| `--cis-board` / `--cis-board-tab` | `#6F5133` / `#7A5C3C` | Clipboard hardboard and inactive tab |

**Contrast rules — non-negotiable:**
- Never use `#EE6B2D` for small text — use `#C2531B` instead.
- `#5E534A` is the minimum-safe muted ink on cream backgrounds.
- Text on an orange fill is ink `#201E1D`, not white.
- All body/small text must be ≥ 4.5:1 contrast; large display type ≥ 3:1 (WCAG 2.1 AA, per
  `project_spec.md` §1.8).

---

## 5. Typography

- **Display — Caprasimo 400.** Team names, scores, section headings, rank numerals only.
  Never for paragraphs, never below 17px.
- **UI/body — Figtree 400/600/700/800.** Buttons and table figures use weight 800.
- **Scale:** 12 (meta) · 13 (chips) · 15 (body) · 17 (rows, names) · 18–22 (section headings,
  display) · 26–34 (scores, matchups).
- **Line-height:** 1.0–1.15 on display type, 1.45–1.5 on body copy.

---

## 6. Spacing & radii

| Element | Radius |
|---|---|
| Chips, stamps | 12px |
| Tick boxes | 14px |
| Sheets (cards) | 26px |
| Phone shell | 40px |
| Buttons | full pill (`999px`) — the *only* pill usage |

Focus state on every interactive element (required, never rely on the browser default):
```css
:focus-visible { outline: 2px solid #EE6B2D; outline-offset: 3px; }
```
Filled buttons: pressed state translates 3px down and shrinks a 4px offset shadow to 1px.
Tick boxes / rows: `:active` scales to `.94`. No animation beyond that.

---

## 7. Component inventory

Map screens to reusable domain components — build these once, compose everywhere, rather than
one-off markup per screen.

| Component | Used for | Notes |
|---|---|---|
| `AttendanceRow` | Coach attendance list | Jersey number, name, verse-recited mark, 44px tick box. Whole row is the tap target. |
| `GameSheetHeader` | Coach home | "Game day" label, date, week/home stamp, matchup block with tip-off countdown. |
| `RunOfDayList` | Coach home | Ruled-paper schedule list; row color varies by type (game = ember, verse = sage). |
| `StandingsTable` | Admin standings | Real `<table>`, sortable headers, rank/team/record/points columns, leader-row wash. |
| `DivisionTabs` | Admin standings | Juniors/Ambassadors switch; active tab joined visually to the sheet below. |
| `UnverifiedFilterChip` | Admin standings | Toggle chip that filters the table to flagged rows; inverts fill when active. |
| `VerseProgressBadge` | Spiritual/verse screens | Sage-colored, carries psalm-point state — not a bare dot. |
| `BottomNav` | Global (mobile shell) | 4 items, Lucide icons (stroke-width 2.75), 11px labels, 56×48px min tap target. |
| `PrimaryButton` / `SecondaryButton` | Global | Pill radius, ink text on orange fill; secondary variants outlined or sage-filled. |

Each of these should be a real component in the codebase (not a one-off per-screen block) so
new screens compose from the same set instead of reinventing layout.

---

## 8. Screens delivered so far

- **Coach game-day home** (`CIS Coach Home Clipboard.dc.html` — chosen direction). Purpose: a
  coach on the sideline needs, in order, what/when the game is, who's here, what's next.
  Alternate darker "scoreboard" take (`CIS Coach Home.dc.html`) kept as reference only.
- **Admin standings** (`CIS Admin Standings.dc.html`). Purpose: an admin checks both divisions
  quickly and spots scores needing verification.

State shape for reference (local UI state — real app fetches roster/schedule/standings/verified
flags from Supabase):
- Coach home: `present: boolean[12]` (roster order), derived present count.
- Standings: `division`, `sortKey`, `sortDir`, `flaggedOnly`.

Sorting: tapping a header sets/flips sort key; rank is always computed from record then point
differential, independent of sort — the rank number never changes on re-sort.

---

## 9. Assets

- Logo: white wordmark for dark grounds, orange wordmark on white for light grounds — vector
  artwork still needed from the program before shipping (currently PNG/JPG only).
- Icons: [Lucide](https://lucide.dev), stroke-width 2.75.
- Fonts: Caprasimo and Figtree, Google Fonts.

---

## 10. Open items

- Vector logo artwork (currently raster only).
- Remaining MVP screens not yet designed: role-based nav shells for Program Team, Prayer Team,
  Parent, and Kid roles; equipment inventory; season calendar; verse/psalm logging flow (Prayer
  Team side); CSV import review screen.
- Confirm this direction holds up at data-dense edges (full roster view, equipment list) before
  treating it as fully validated — see the step-by-step validation pass in the team's process
  notes.
