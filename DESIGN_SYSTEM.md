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
- **Consistent radii, not pills everywhere.** 12px chips/stamps, 14px tick boxes, 18px tab
  tops, 26px sheets, 40px shell. `border-radius: 999px` (full pill) is reserved for buttons only.
- **No gradients, textures, patterns or frosted glass.** Flat warm color. The one patterned
  surface in the system is the ruled-paper line grid behind `RunOfDayList`.
- **No transparency or blur on chrome.** Translucent bars fail in direct sun. The only
  non-opaque value in the system is the `rgba(36,31,28,.07)` hover wash on a secondary button.
- **No emoji**, in labels, empty states or notifications.
- **Repeated utility strings get extracted.** Any Tailwind class string of 8+ utilities
  repeated across instances becomes a component or a `cva` variant, not copy-pasted.

---

## 4. Color tokens

| Token | Hex | Role |
|---|---|---|
| `--cis-orange` | `#EE6B2D` | Primary. Filled buttons (ink text), active nav, progress fill, present state |
| `--cis-orange-text` | `#C2531B` | Orange as *text* on cream (passes 4.5:1). Links use this, `#9C3E12` on hover |
| `--cis-ember` | `#C4341C` | Sport: scores, "Game"/"Final" chips, unverified flags, leader rank |
| `--cis-danger` / hover / press | `#8E1F17` / `#A3231A` / `#761A13` | **Destructive actions only** — delete, remove. Never a status, never a chip |
| `--cis-danger-tint` / `--cis-ink-on-danger` | `#F7E4E0` / `#FFF6EE` | Hover wash behind an outlined danger action; text on a danger fill |
| `--cis-sage` | `#6F8457` | Spiritual: psalm-point button, verse-huddle rules, verse chips |
| `--cis-apricot` / tint | `#FFC98E` / `#FFE3C4` | Highlights on dark grounds; chip fills (pair with `#9C3E12` text) |
| `--cis-page` | `#E9DCC6` | App backdrop |
| `--cis-paper-light` / `--cis-paper` | `#FFFCF6` / `#F3E7D4` | Primary and secondary paper sheets |
| `--cis-ink` / `--cis-ink-muted` | `#241F1C` / `#5E534A` | Body and secondary text |
| `--cis-ink-dark` | `#201E1D` | Text on an orange fill; heavy rules; dark scoreboard ground |
| `--cis-ink-on-ember` | `#FFF6EE` | Text on an ember fill — warmer than `--cis-ink-on-dark` |
| `--cis-board` / `--cis-board-tab` | `#6F5133` / `#7A5C3C` | Clipboard hardboard and inactive tab |
| `--cis-rule` / `--cis-rule-soft` / `--cis-rule-dash` | `#E3D4B8` / `#DFCFAF` / `#D6C4A6` | 1px row rule, ruled-paper gradient line, 2px dashed section break |
| `--cis-box-empty` | `#C9B49A` | Border of an unticked attendance box |

**Two reds, and how to keep them apart.** `--cis-ember` and `--cis-danger` are both red,
which is a risk the system takes deliberately — destroying a record is the one action that has
to look different from every other, and none of orange/ember/sage could carry it without
breaking the one-colour-one-job rule.

They are separated by **usage**, not just hue, and the separation is what makes them
unambiguous in practice:

- **`--cis-danger` only ever appears on an action** the user can press — a delete or remove
  control. It is never a chip, a status, a rule or a fill behind text.
- **`--cis-ember` never appears on an action.** It marks sport results: scores, "Game"/"Final"
  chips, the leader row.

So a red thing you can press is destructive; a red thing you cannot press is a score. If a new
screen needs red for anything that is neither, that is a signal to stop and flag it rather than
to reach for whichever red is closer.

**Contrast rules — non-negotiable:**
- Never use `#EE6B2D` for small text — use `#C2531B` instead.
- `#5E534A` is the minimum-safe muted ink on cream backgrounds.
- Text on an orange fill is ink `#201E1D`, not white. White is 2.6:1 and fails at every size;
  ink is 6.6:1.
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
:focus-visible { outline: 2px solid #EE6B2D; outline-offset: 3px; }
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
| `Sheet` | Global | The cream paper card. `tone="light"` is the primary sheet, `tone="paper"` the secondary. `joined` squares the top corners under `DivisionTabs`. Ships with `SheetHeading` (Caprasimo 18px, sentence case) and `SheetRule` (the 5px ink rule). |
| `Chip` | Global | The 12px label the three named chips share. Variants: `sport` (ember fill), `faith` (sage outline), `tint` (apricot fill), `stamp` (rotated -5deg double rule). |
| `Icon` | Global | Wrapper over the Lucide glyph set so stroke-width 2.75 lives in one place. |
| `PrimaryButton` / `SecondaryButton` | Global | Pill radius, ink text on orange fill; `tone="sage"` for spiritual actions; secondary is a 3px ink outline. |

**Domain components:**

| Component | Used for | Notes |
|---|---|---|
| `AttendanceRow` | Coach attendance list | Jersey number, name, verse-recited mark, 44px tick box. Whole row is the tap target. |
| `GameSheetHeader` | Coach home | "Game day" label, date, week/home stamp, matchup block with tip-off countdown. |
| `RunOfDayList` | Coach home | Ruled-paper schedule list; row color varies by type (game = ember, verse = sage). |
| `StandingsTable` | Admin standings | Real `<table>`, sortable headers, rank/team/record/points columns, leader-row wash. |
| `DivisionTabs` | Admin standings | Juniors/Ambassadors switch; active tab joined visually to the sheet below. |
| `UnverifiedFilterChip` | Admin standings | Toggle chip that filters the table to flagged rows; inverts fill when active. |
| `VerseProgressBadge` | Spiritual/verse screens | Sage-colored, carries psalm-point state — not a bare dot. |
| `BottomNav` | Global (mobile shell) | 4 items, Lucide icons (stroke-width 2.75), 11px labels, 56×48px min tap target. Items are a prop — only the Coach and Admin sets are designed. |

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

- **Logo:** one file only — an orange low-poly ichthys over a hand-lettered "Christ In Sports"
  script, on transparency (PNG, 1060×647). **There is no vector version, no reversed/white
  version and no icon-only lockup.** It holds on `--cis-page`, `--cis-paper` and
  `--cis-paper-light` only — never on an orange, ember or sage fill, and never on the board.
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

- Vector logo artwork, plus a reversed/white version for dark grounds (currently raster only,
  light grounds only).
- The program's own icon set, if one exists, to replace Lucide.
- Remaining MVP screens not yet designed: role-based nav shells for Program Team, Prayer Team,
  Parent, and Kid roles; equipment inventory; season calendar; verse/psalm logging flow (Prayer
  Team side); CSV import review screen. The components in §7 compose these, but the screens
  themselves must be designed — do not infer them, and do not assume `BottomNav`'s item set.
- Confirm this direction holds up at data-dense edges (full roster view, equipment list) before
  treating it as fully validated — see the step-by-step validation pass in the team's process
  notes.

---

*Product/scope decisions that deviate from `prd.docx` are logged in [`docs/decisions.md`](./docs/decisions.md); technical/architecture decisions are logged in [`docs/arch_decisions.md`](./docs/arch_decisions.md).*
