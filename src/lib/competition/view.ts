/**
 * What each Sports screen shows, worked out from the raw rows.
 *
 * Pure functions with no database and no React, so every rule the designs spell
 * out ("Next up is the next slot to start", "Winner of Semi-final 1", where a bye
 * row goes, how a place is described) is unit-tested, including against every
 * bracket the generator can produce.
 *
 * Nothing here ranks a table itself: ranking is `rankStandings` (standings.ts), so
 * the rank on screen is always the library's, whatever a header is sorted by.
 */

import { sportLabel, scheduleText, ordinal, plural, signed, tiebreakPhrase } from './labels';
import { rankStandings, type StandingsRow } from './standings';
import type {
  BlockRecord,
  GameRecord,
  PlaceRecord,
  ResultRecord,
  Slot,
  TeamRecord,
} from './types';

// ---------------------------------------------------------------------------
// One game
// ---------------------------------------------------------------------------

/**
 * `final`    played (ember chip).
 * `next`     the next slot to start (orange chip).
 * `upcoming` both teams known, not started (outlined chip).
 * `waiting`  a team comes from an earlier game (dashed chip).
 */
export type GameState = 'final' | 'next' | 'upcoming' | 'waiting';

const bothTeams = (g: GameRecord) => Boolean(g.home_team_id && g.away_team_id);

const slotKey = (g: GameRecord) => `${g.scheduled_date} ${g.scheduled_time ?? '00:00:00'}`;

/**
 * The games in the earliest slot that still has an unplayed game with both teams
 * known. Based on the order of the schedule, not the clock, so it is right
 * whenever the page is read.
 */
export function nextUpIds(games: readonly GameRecord[]): Set<string> {
  const ready = games.filter((g) => g.status === 'scheduled' && bothTeams(g) && g.scheduled_date);
  if (ready.length === 0) return new Set();
  const earliest = ready.map(slotKey).sort()[0];
  return new Set(ready.filter((g) => slotKey(g) === earliest).map((g) => g.id));
}

export function gameState(game: GameRecord, next: ReadonlySet<string>): GameState {
  if (game.status === 'completed') return 'final';
  if (!bothTeams(game)) return 'waiting';
  return next.has(game.id) ? 'next' : 'upcoming';
}

/** "Winner of Semi-final 1" for a slot a team has not reached yet. */
export function sourceText(game: GameRecord, slot: Slot, all: readonly GameRecord[]): string {
  const won = all.find((g) => g.winner_to_game_id === game.id && g.winner_to_slot === slot);
  if (won) return `Winner of ${won.label}`;
  const lost = all.find((g) => g.loser_to_game_id === game.id && g.loser_to_slot === slot);
  if (lost) return `Loser of ${lost.label}`;
  return 'To be decided';
}

export interface TeamLine {
  name: string;
  /** Null until the game has a result. */
  score: number | null;
  /**
   * `win` and `loss` once played; a drawn game is `neutral` on both sides.
   * `waiting` is a slot still waiting for a team, whose `name` is its source.
   */
  tone: 'win' | 'loss' | 'neutral' | 'waiting';
}

export interface GameView {
  id: string;
  label: string;
  state: GameState;
  home: TeamLine;
  away: TeamLine;
  /** A level knockout game: "Level, Warriors won on penalties". */
  tiebreakNote: string | null;
  draw: boolean;
  result: ResultRecord | undefined;
}

export interface GameContext {
  sport: string;
  teams: ReadonlyMap<string, TeamRecord>;
  /** Every game in the block, to find where a waiting team comes from. */
  games: readonly GameRecord[];
  results: ReadonlyMap<string, ResultRecord>;
  next: ReadonlySet<string>;
}

export function gameView(game: GameRecord, ctx: GameContext): GameView {
  const result = ctx.results.get(game.id);
  const played = game.status === 'completed' && result !== undefined;
  const draw = played && result.winner_team_id === null;

  const line = (teamId: string | null, slot: Slot): TeamLine => {
    if (!teamId) {
      return { name: sourceText(game, slot, ctx.games), score: null, tone: 'waiting' };
    }
    const name = ctx.teams.get(teamId)?.name ?? 'Unknown team';
    if (!played) return { name, score: null, tone: 'neutral' };
    const score = slot === 'home' ? result.home_total : result.away_total;
    if (draw) return { name, score, tone: 'neutral' };
    return { name, score, tone: result.winner_team_id === teamId ? 'win' : 'loss' };
  };

  const home = line(game.home_team_id, 'home');
  const away = line(game.away_team_id, 'away');

  let tiebreakNote: string | null = null;
  if (played && result.tiebreak_winner_team_id) {
    const winner = ctx.teams.get(result.tiebreak_winner_team_id)?.name ?? 'Unknown team';
    tiebreakNote = `Level, ${winner} won ${tiebreakPhrase(ctx.sport)}`;
  }

  return {
    id: game.id,
    label: game.label,
    state: gameState(game, ctx.next),
    home,
    away,
    tiebreakNote,
    draw,
    result,
  };
}

/** "Soccer · Round 1", with "· draw" after a drawn league game. */
export function gameMeta(sport: string, view: GameView): string {
  return `${sportLabel(sport)} · ${view.label}${view.draw ? ' · draw' : ''}`;
}

// ---------------------------------------------------------------------------
// The schedule
// ---------------------------------------------------------------------------

export interface ScheduleSlot {
  time: string | null;
  games: GameRecord[];
}

export interface ScheduleDay {
  date: string;
  slots: ScheduleSlot[];
  /** Games on the day, after any team filter. */
  count: number;
  /** The highest court number in use. */
  courts: number;
}

const byCourt = (a: GameRecord, b: GameRecord) =>
  (a.court ?? Infinity) - (b.court ?? Infinity) || a.label.localeCompare(b.label);

/**
 * Scheduled games grouped by day (latest day first, so what just happened is at
 * the top and nobody scrolls to the end), then by time and court (earliest first
 * within a day, as a game day is read). A game with no date
 * is not on the schedule. With `teamIds`, only games one of those teams is already
 * known to play in: a knockout game stays off a team's schedule until it is decided.
 */
export function buildSchedule(
  games: readonly GameRecord[],
  opts: { teamIds?: ReadonlySet<string> } = {}
): ScheduleDay[] {
  const { teamIds } = opts;
  const scheduled = games.filter(
    (g) =>
      g.scheduled_date &&
      (!teamIds ||
        (g.home_team_id !== null && teamIds.has(g.home_team_id)) ||
        (g.away_team_id !== null && teamIds.has(g.away_team_id)))
  );

  const dates = [...new Set(scheduled.map((g) => g.scheduled_date!))].sort((a, b) => b.localeCompare(a));
  return dates.map((date) => {
    const dayGames = scheduled.filter((g) => g.scheduled_date === date);
    const times = [...new Set(dayGames.map((g) => g.scheduled_time))].sort((a, b) => {
      if (a === b) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return a.localeCompare(b);
    });
    return {
      date,
      slots: times.map((time) => ({
        time,
        games: dayGames.filter((g) => g.scheduled_time === time).sort(byCourt),
      })),
      count: dayGames.length,
      courts: Math.max(0, ...dayGames.map((g) => g.court ?? 0)),
    };
  });
}

/** "5 slots · 2 courts", or "3 games" when one team's games are shown. */
export function dayNote(day: ScheduleDay, filtered: boolean): string {
  if (filtered) return plural(day.count, 'game');
  return `${plural(day.slots.length, 'slot')} · ${plural(day.courts, 'court')}`;
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export interface StandingsRowView extends StandingsRow {
  name: string;
}

export interface StandingsTableData {
  group: 'A' | 'B' | null;
  rows: StandingsRowView[];
}

export interface StandingsView {
  tables: StandingsTableData[];
  /** League games with a result, and all league games. */
  played: number;
  total: number;
  /** Nothing played yet: ranks show as a dash and teams run A to Z. */
  started: boolean;
  /** "League · round 3 of 7", "Groups · not started". */
  chip: string;
}

/**
 * The league tables of a block, or null for a knockout-only block (nothing to
 * rank). Teams are those that appear in the league games.
 */
export function standingsView(
  block: Pick<BlockRecord, 'league_structure'>,
  teams: ReadonlyMap<string, TeamRecord>,
  games: readonly GameRecord[],
  results: ReadonlyMap<string, ResultRecord>
): StandingsView | null {
  const league = games.filter((g) => g.stage === 'league' && bothTeams(g));
  if (league.length === 0) return null;

  const played = league.filter((g) => g.status === 'completed').length;
  const groups = block.league_structure === 'groups';
  const labels: ('A' | 'B' | null)[] = groups ? ['A', 'B'] : [null];

  const tables = labels.flatMap((group) => {
    const inTable = league.filter((g) => (groups ? g.group_label === group : true));
    if (inTable.length === 0) return [];
    const ids = [...new Set(inTable.flatMap((g) => [g.home_team_id!, g.away_team_id!]))];
    const rows = rankStandings(
      ids.map((id) => ({ id, name: teams.get(id)?.name ?? 'Unknown team' })),
      inTable.map((g) => ({ id: g.id, home: g.home_team_id!, away: g.away_team_id! })),
      inTable.flatMap((g) => {
        const r = results.get(g.id);
        return r ? [{ gameId: g.id, homeTotal: r.home_total, awayTotal: r.away_total }] : [];
      })
    ).map((row) => ({ ...row, name: teams.get(row.teamId)?.name ?? 'Unknown team' }));
    return [{ group, rows }];
  });

  const kind = groups ? 'Groups' : 'League';
  const rounds = league.map((g) => g.round);
  const last = Math.max(...rounds);
  const open = league.filter((g) => g.status !== 'completed').map((g) => g.round);
  const current = open.length > 0 ? Math.min(...open) : last;

  let chip: string;
  if (played === 0) chip = `${kind} · not started`;
  else if (open.length === 0) chip = `${kind} · complete`;
  else chip = `${kind} · round ${current} of ${last}`;

  return { tables, played, total: league.length, started: played > 0, chip };
}

export type SortKey = 'team' | 'played' | 'record' | 'difference' | 'scored' | 'points';
export type SortDir = 'asc' | 'desc';

/** The direction a header sorts first when tapped: names A to Z, numbers high to low. */
export function defaultDir(key: SortKey): SortDir {
  return key === 'team' ? 'asc' : 'desc';
}

/**
 * Re-orders rows for display. A sort never changes anyone's `rank`; that is set by
 * `rankStandings` and travels with the row (DESIGN_SYSTEM.md section 8).
 */
export function sortRows(
  rows: readonly StandingsRowView[],
  key: SortKey,
  dir: SortDir
): StandingsRowView[] {
  const value = (r: StandingsRowView): number[] | string => {
    switch (key) {
      case 'team':
        return r.name;
      case 'played':
        return [r.played];
      case 'record':
        return [r.won, r.drawn, -r.lost];
      case 'difference':
        return [r.difference];
      case 'scored':
        return [r.scored];
      case 'points':
        return [r.points];
    }
  };
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    let order = 0;
    if (typeof va === 'string' && typeof vb === 'string') {
      order = va.localeCompare(vb);
    } else if (Array.isArray(va) && Array.isArray(vb)) {
      for (let i = 0; i < va.length && order === 0; i++) order = va[i] - vb[i];
    }
    return order * sign || a.rank - b.rank;
  });
}

export const record = (r: Pick<StandingsRow, 'won' | 'drawn' | 'lost'>) =>
  `${r.won}–${r.drawn}–${r.lost}`;

export { signed };

// ---------------------------------------------------------------------------
// The bracket
// ---------------------------------------------------------------------------

export type SectionId = 'quarters' | 'semis' | 'final' | 'places';

export interface BracketGameView extends GameView {
  /** "Oct 19 · 9:00 · Court 1", or null if not scheduled. */
  when: string | null;
  /** "Winner plays Semi-final 1 · loser plays 5th place". */
  exit: string;
}

export type BracketItem =
  | { kind: 'bye'; team: string; goesTo: string }
  | { kind: 'game'; game: BracketGameView };

export interface BracketSection {
  id: SectionId;
  title: string;
  items: BracketItem[];
  played: number;
  total: number;
}

const targetName = (label: string) => (label === 'Final' ? 'the final' : label);

/**
 * What happens to a game's winner and loser, in words: where each goes next, or
 * which places the game decides.
 */
export function exitText(game: GameRecord, all: readonly GameRecord[]): string {
  const labelOf = (id: string | null) => all.find((g) => g.id === id)?.label;
  const winnerTo = labelOf(game.winner_to_game_id);
  const loserTo = labelOf(game.loser_to_game_id);

  if (game.winner_place !== null && game.loser_place !== null) {
    return `Decides ${ordinal(game.winner_place)} and ${ordinal(game.loser_place)}`;
  }
  const winner = winnerTo ? `Winner plays ${targetName(winnerTo)}` : null;
  const loser = loserTo
    ? `loser plays ${targetName(loserTo)}`
    : game.loser_place !== null
      ? `loser takes ${ordinal(game.loser_place)}`
      : null;
  return [winner, loser].filter(Boolean).join(' · ');
}

function sectionOf(label: string): SectionId {
  if (/^quarter-final/i.test(label)) return 'quarters';
  if (/^semi-final/i.test(label)) return 'semis';
  if (label === 'Final' || label === '3rd place') return 'final';
  return 'places';
}

/** In the final section the Final comes first, then 3rd place, then anything else. */
function finalOrder(g: GameRecord): number {
  if (g.label === 'Final') return 0;
  if (g.label === '3rd place') return 1;
  return 2 + g.round;
}

/**
 * The knockout, grouped the way a person reads it: quarter-finals, semi-finals,
 * the final and 3rd place, and the placement games. Eight teams have enough
 * placement games (the 5th-8th semi-finals, 5th and 7th place) to deserve a
 * section of their own; with six or seven they are just a game or two, so they
 * sit with the final under "Final and places".
 *
 * A bye is a team seeded straight into a later round, and gets a row of its own
 * in the round it skips.
 */
export function bracketSections(
  block: Pick<BlockRecord, 'sport'>,
  teams: ReadonlyMap<string, TeamRecord>,
  games: readonly GameRecord[],
  results: ReadonlyMap<string, ResultRecord>
): BracketSection[] {
  const knockout = games.filter((g) => g.stage !== 'league');
  if (knockout.length === 0) return [];

  const ctx: GameContext = {
    sport: block.sport,
    teams,
    games: knockout,
    results,
    next: nextUpIds(knockout),
  };

  const placements = knockout.filter((g) => sectionOf(g.label) === 'places');
  const separatePlaces = placements.length >= 3;
  const idOf = (g: GameRecord): SectionId => {
    const id = sectionOf(g.label);
    return id === 'places' && !separatePlaces ? 'final' : id;
  };

  const order: SectionId[] = ['quarters', 'semis', 'final', 'places'];
  const title = (id: SectionId) =>
    ({
      quarters: 'Quarter-finals',
      semis: 'Semi-finals',
      final: separatePlaces ? 'Final and 3rd place' : 'Final and places',
      places: 'Placement games',
    })[id];

  const sections: BracketSection[] = order.flatMap((id) => {
    const inSection = knockout.filter((g) => idOf(g) === id);
    if (inSection.length === 0) return [];
    const sorted = [...inSection].sort((a, b) =>
      id === 'final'
        ? finalOrder(a) - finalOrder(b) || a.label.localeCompare(b.label)
        : a.round - b.round || a.label.localeCompare(b.label)
    );
    const items: BracketItem[] = sorted.map((g) => ({
      kind: 'game',
      game: {
        ...gameView(g, ctx),
        when: scheduleText(g),
        exit: exitText(g, knockout),
      },
    }));
    return [
      {
        id,
        title: title(id),
        items,
        played: sorted.filter((g) => g.status === 'completed').length,
        total: sorted.length,
      },
    ];
  });

  // Byes: a team seeded into a slot that no game feeds, in a round after the first.
  const fed = new Set<string>();
  for (const g of knockout) {
    if (g.winner_to_game_id && g.winner_to_slot) fed.add(`${g.winner_to_game_id}:${g.winner_to_slot}`);
    if (g.loser_to_game_id && g.loser_to_slot) fed.add(`${g.loser_to_game_id}:${g.loser_to_slot}`);
  }
  const firstRound = Math.min(...knockout.map((g) => g.round));
  const byesBySection = new Map<BracketSection, BracketItem[]>();
  const inOrder = [...knockout].sort((a, b) => a.round - b.round || a.label.localeCompare(b.label));
  for (const g of inOrder) {
    if (g.round <= firstRound) continue;
    for (const slot of ['home', 'away'] as const) {
      const teamId = slot === 'home' ? g.home_team_id : g.away_team_id;
      if (!teamId || fed.has(`${g.id}:${slot}`)) continue;

      // The bye row sits with the games of the round the team skipped.
      const skipped =
        sections.find((s) =>
          s.items.some((i) => i.kind === 'game' && knockout.find((k) => k.id === i.game.id)?.round === g.round - 1)
        ) ?? sections[0];
      byesBySection.set(skipped, [
        ...(byesBySection.get(skipped) ?? []),
        { kind: 'bye', team: teams.get(teamId)?.name ?? 'Unknown team', goesTo: g.label },
      ]);
    }
  }
  // Byes lead their section, in the order of the games they skip into.
  for (const [section, byes] of byesBySection) section.items.unshift(...byes);

  return sections;
}

/** The jump chips under the bracket heading, one per section that exists. */
export function jumpTargets(sections: readonly BracketSection[]): { id: SectionId; label: string }[] {
  const labels: Record<SectionId, string> = {
    quarters: 'Quarters',
    semis: 'Semis',
    final: 'Final',
    places: 'Places',
  };
  return sections.map((s) => ({ id: s.id, label: labels[s.id] }));
}

// ---------------------------------------------------------------------------
// Final places
// ---------------------------------------------------------------------------

export interface PlaceRow {
  place: number;
  team: string;
  /** "Won the final, 2–0 over Hawks". */
  how: string;
}

function scoreText(result: ResultRecord, winnerIsHome: boolean): string {
  const [w, l] = winnerIsHome
    ? [result.home_total, result.away_total]
    : [result.away_total, result.home_total];
  return `${w}–${l}`;
}

/** "the final", "3rd place", "the 6th-7th game": a game's name inside a sentence. */
function gameName(label: string): string {
  if (label === 'Final') return 'the final';
  if (/place$/.test(label)) return label;
  return `the ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/**
 * Every team's place in a completed block, in order, each with how it was earned.
 * A league is placed by its table; a knockout by the game that ended each team's run.
 */
export function placeRows(
  block: Pick<BlockRecord, 'sport' | 'format' | 'league_structure'>,
  teams: ReadonlyMap<string, TeamRecord>,
  places: readonly PlaceRecord[],
  games: readonly GameRecord[],
  results: ReadonlyMap<string, ResultRecord>
): PlaceRow[] {
  const nameOf = (id: string) => teams.get(id)?.name ?? 'Unknown team';
  const table =
    block.format === 'league' ? standingsView(block, teams, games, results)?.tables.flatMap((t) => t.rows) : undefined;

  return [...places]
    .sort((a, b) => a.place - b.place)
    .map((p): PlaceRow => {
      const team = nameOf(p.team_id);

      if (block.format === 'league') {
        const row = table?.find((r) => r.teamId === p.team_id);
        const how = row ? `${plural(row.played, 'game')} · ${record(row)} · ${plural(row.points, 'point')}` : '';
        return { place: p.place, team, how };
      }

      const decided = games.find((g) => g.winner_place === p.place || g.loser_place === p.place);
      const result = decided ? results.get(decided.id) : undefined;
      if (!decided || !result) return { place: p.place, team, how: '' };

      const won = decided.winner_place === p.place;
      const name = gameName(decided.label);
      if (!won) return { place: p.place, team, how: `Lost ${name}` };

      const winnerIsHome = result.winner_team_id === decided.home_team_id;
      const loserId = winnerIsHome ? decided.away_team_id : decided.home_team_id;
      const level = result.home_total === result.away_total;
      const method = level && result.tiebreak_winner_team_id ? ` ${tiebreakPhrase(block.sport)}` : '';
      const over = loserId ? ` over ${nameOf(loserId)}` : '';
      return { place: p.place, team, how: `Won ${name}${method}, ${scoreText(result, winnerIsHome)}${over}` };
    });
}
