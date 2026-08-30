'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

interface Tournament {
  id: string;
  name: string;
  team_count: number;
}

interface Team {
  id: string;
  name: string;
  color: string;
}

interface Sport {
  id: string;
  sport_type: string;
  play_mode: string;
  settings: any;
  status: string;
}

interface Match {
  id: string;
  sport_id: string;
  tournament_id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  match_type: string;
  round: number | null;
  bracket: string | null;
  court: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: string;
  winner_team_id: string | null;
  is_draw: boolean;
}

interface Score {
  id: string;
  match_id: string;
  home_score: number;
  away_score: number;
  score_details: any;
}

interface GameDay {
  id: string;
  tournament_id: string;
  date: string;
  start_time: string;
  duration_min: number;
  courts_available: number;
  sport_type: string | null;
  notes: string | null;
}

/** One court position within a time slot. */
interface SlotCell {
  court: number;
  match: Match | null;
}

/** One time slot across all courts. */
interface SlotRow {
  slotNumber: number;
  time: string;
  cells: SlotCell[];
}

/** duration_min is stored as (slots * 20) by createGameDay. */
const SLOT_UNIT_MIN = 20;

export default function ScheduleClient({
  tournament,
  teams,
  sports,
  matches: initialMatches,
  scores: initialScores,
  gameDays: initialGameDays,
  isAdmin,
}: {
  tournament: Tournament;
  teams: Team[];
  sports: Sport[];
  matches: Match[];
  scores: Score[];
  gameDays: GameDay[];
  isAdmin: boolean;
}) {
  const [matches, setMatches] = useState(initialMatches);
  const [scores, setScores] = useState(initialScores);
  const [gameDays, setGameDays] = useState(initialGameDays);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDay, setSelectedDay] = useState<GameDay | null>(
    initialGameDays.length > 0 ? initialGameDays[initialGameDays.length - 1] : null
  );
  const [loading, setLoading] = useState(false);
  const [newStartTime, setNewStartTime] = useState('14:00');

  const [scoringMatch, setScoringMatch] = useState<Match | null>(null);
  const [scoreState, setScoreState] = useState<any>({});

  const [newDate, setNewDate] = useState('');
  const [newCourts, setNewCourts] = useState('2');
  const [newSlots, setNewSlots] = useState('4');
  const [newSport, setNewSport] = useState('soccer');
  const [newNotes, setNewNotes] = useState('');

  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  // Guards against the auto-fill effect firing on top of itself
  const autoFillLock = useRef(false);

  // ---------------------------------------------------------------
  // Realtime
  // ---------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel(`schedule-${tournament.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `tournament_id=eq.${tournament.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as Match;
            setMatches((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as Match;
            setMatches((prev) => prev.map((m) => (m.id === row.id ? row : m)));
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as Partial<Match>;
            setMatches((prev) => prev.filter((m) => m.id !== row.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_scores' },
        (payload) => {
          // match_scores has no tournament_id, so filter client-side
          const row = (payload.new ?? payload.old) as Partial<Score>;
          if (!row?.match_id) return;

          if (payload.eventType === 'DELETE') {
            setScores((prev) => prev.filter((s) => s.id !== row.id));
            return;
          }

          const fresh = payload.new as Score;
          setScores((prev) => {
            const exists = prev.some((s) => s.match_id === fresh.match_id);
            return exists
              ? prev.map((s) => (s.match_id === fresh.match_id ? fresh : s))
              : [...prev, fresh];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournament.id]);

  // ---------------------------------------------------------------
  // Slot math — stable mapping between slot index and clock time
  // ---------------------------------------------------------------
  const getSportForDay = (gameDay: GameDay) =>
    sports.find((s) => s.sport_type === gameDay.sport_type);

  const getSlotCount = (gameDay: GameDay) =>
    Math.max(1, Math.floor((gameDay.duration_min || SLOT_UNIT_MIN) / SLOT_UNIT_MIN));

  const getGameDuration = (gameDay: GameDay) => {
    const sport = getSportForDay(gameDay);
    return sport?.settings?.game_duration_min || SLOT_UNIT_MIN;
  };

  /** Clock time for a 1-based slot index. Deterministic — this is the key to re-filling. */
  const slotTime = (gameDay: GameDay, slotNumber: number) => {
    const [h, m] = (gameDay.start_time || '14:00:00').split(':').map(Number);
    const total = h * 60 + m + (slotNumber - 1) * getGameDuration(gameDay);
    const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    return `${hh}:${mm}:00`;
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${h12}:${m} ${ampm}`;
  };

  /**
   * Builds the full grid: every slot, every court, whether or not a match sits there.
   * `overflow` catches rows whose scheduled_time doesn't line up with any slot
   * (e.g. left over from the old scheduling algorithm) so they never vanish.
   */
  const buildGrid = (gameDay: GameDay): { grid: SlotRow[]; overflow: Match[] } => {
    const sport = getSportForDay(gameDay);
    if (!sport) return { grid: [], overflow: [] };

    const totalSlots = getSlotCount(gameDay);
    const courts = Math.max(1, gameDay.courts_available || 1);

    const grid: SlotRow[] = Array.from({ length: totalSlots }, (_, i) => ({
      slotNumber: i + 1,
      time: slotTime(gameDay, i + 1),
      cells: Array.from({ length: courts }, (_, c) => ({ court: c + 1, match: null })),
    }));

    const timeToSlot = new Map<string, number>();
    grid.forEach((row) => timeToSlot.set(row.time, row.slotNumber));

    const dayMatches = matches.filter(
      (m) => m.scheduled_date === gameDay.date && m.sport_id === sport.id
    );

    const overflow: Match[] = [];

    dayMatches.forEach((m) => {
      const slotNumber = m.scheduled_time ? timeToSlot.get(m.scheduled_time) : undefined;
      if (!slotNumber) {
        overflow.push(m);
        return;
      }
      const row = grid[slotNumber - 1];
      const cell =
        row.cells.find((c) => c.court === (m.court || 1) && !c.match) ??
        row.cells.find((c) => !c.match);
      if (cell) cell.match = m;
      else overflow.push(m);
    });

    return { grid, overflow };
  };

  // ---------------------------------------------------------------
  // Game day CRUD
  // ---------------------------------------------------------------
  const createGameDay = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase
      .from('game_days')
      .insert({
        tournament_id: tournament.id,
        date: newDate,
        start_time: newStartTime,
        duration_min: parseInt(newSlots) * SLOT_UNIT_MIN,
        courts_available: parseInt(newCourts),
        sport_type: newSport,
        notes: newNotes || null,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setGameDays((prev) => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)));
      setShowCreate(false);
      setSelectedDay(data);
      setNewDate('');
      setNewNotes('');
      toast({ title: 'Game day created!' });
    }
    setLoading(false);
  };

  const deleteGameDay = async (id: string) => {
    const confirmed = window.confirm('Delete this game day and unschedule all its matches?');
    if (!confirmed) return;

    const dayToDelete = gameDays.find((d) => d.id === id);
    if (dayToDelete) {
      const sport = getSportForDay(dayToDelete);
      let q = supabase
        .from('matches')
        .update({ scheduled_date: null, scheduled_time: null, court: null })
        .eq('tournament_id', tournament.id)
        .eq('scheduled_date', dayToDelete.date);

      // Only unschedule this day's sport, not every sport sharing the date
      if (sport) q = q.eq('sport_id', sport.id);
      await q;
    }

    await supabase.from('game_days').delete().eq('id', id);
    setGameDays((prev) => prev.filter((d) => d.id !== id));
    if (selectedDay?.id === id) setSelectedDay(null);
    toast({ title: 'Game day deleted' });
    router.refresh();
  };

  /** Clears the day so you can re-fill from scratch. */
  const clearDay = async (gameDay: GameDay) => {
    const sport = getSportForDay(gameDay);
    if (!sport) return;
    const confirmed = window.confirm('Unschedule every match on this day? Scores are kept.');
    if (!confirmed) return;

    setLoading(true);
    await supabase
      .from('matches')
      .update({ scheduled_date: null, scheduled_time: null, court: null })
      .eq('tournament_id', tournament.id)
      .eq('sport_id', sport.id)
      .eq('scheduled_date', gameDay.date);

    setMatches((prev) =>
      prev.map((m) =>
        m.scheduled_date === gameDay.date && m.sport_id === sport.id
          ? { ...m, scheduled_date: null, scheduled_time: null, court: null }
          : m
      )
    );
    toast({ title: 'Day cleared' });
    setLoading(false);
  };

  // ---------------------------------------------------------------
  // Incremental auto-schedule
  // ---------------------------------------------------------------
  const autoSchedule = async (gameDay: GameDay, silent = false) => {
    const sport = getSportForDay(gameDay);
    if (!sport) {
      if (!silent) toast({ title: 'Error', description: 'Sport not found', variant: 'destructive' });
      return;
    }

    setLoading(true);

    const { grid } = buildGrid(gameDay);

    // Free cells, earliest slot first
    const freeCells: { slot: number; court: number; time: string }[] = [];
    grid.forEach((row) =>
      row.cells.forEach((cell) => {
        if (!cell.match) freeCells.push({ slot: row.slotNumber, court: cell.court, time: row.time });
      })
    );

    if (freeCells.length === 0) {
      if (!silent) toast({ title: 'Day is full', description: 'Every slot already has a match.' });
      setLoading(false);
      return;
    }

    // Teams already committed per slot, and each team's slot history (for spacing)
    const busyBySlot = new Map<number, Set<string>>();
    const teamSlots: Record<string, number[]> = {};
    grid.forEach((row) => {
      const busy = new Set<string>();
      row.cells.forEach((cell) => {
        const m = cell.match;
        if (!m) return;
        [m.home_team_id, m.away_team_id].forEach((t) => {
          if (!t) return;
          busy.add(t);
          (teamSlots[t] ||= []).push(row.slotNumber);
        });
      });
      busyBySlot.set(row.slotNumber, busy);
    });

    const unscheduled = matches.filter(
      (m) =>
        m.sport_id === sport.id &&
        m.status === 'scheduled' &&
        !m.scheduled_date &&
        m.match_type !== 'spiritual'
    );

    // Ready = both teams known. League before knockout.
    const ready = [
      ...unscheduled.filter((m) => m.match_type === 'league' && m.home_team_id && m.away_team_id),
      ...unscheduled
        .filter((m) => m.match_type !== 'league' && m.home_team_id && m.away_team_id)
        .sort((a, b) => (a.round || 0) - (b.round || 0)),
    ];

    // Pending = real knockout rows still waiting on results. These become the TBD slots.
    const pending = unscheduled
      .filter((m) => m.match_type !== 'league' && (!m.home_team_id || !m.away_team_id))
      .sort((a, b) => (a.round || 0) - (b.round || 0) || (a.bracket || '').localeCompare(b.bracket || ''));

    const updates: { id: string; court: number; scheduled_date: string; scheduled_time: string }[] = [];
    const remainingReady = [...ready];
    const usedCells = new Set<string>();

    // Pass 1 — place matches with known teams, spacing teams out
    for (const cell of freeCells) {
      if (remainingReady.length === 0) break;
      const busy = busyBySlot.get(cell.slot)!;

      let bestIdx = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < remainingReady.length; i++) {
        const m = remainingReady[i];
        const home = m.home_team_id!;
        const away = m.away_team_id!;
        if (busy.has(home) || busy.has(away)) continue;

        const hs = teamSlots[home] || [];
        const as = teamSlots[away] || [];
        const hGap = hs.length ? cell.slot - Math.max(...hs) : 99;
        const aGap = as.length ? cell.slot - Math.max(...as) : 99;
        let score = hGap + aGap;

        // Discourage three consecutive slots
        if (hs.includes(cell.slot - 1) && hs.includes(cell.slot - 2)) score -= 100;
        if (as.includes(cell.slot - 1) && as.includes(cell.slot - 2)) score -= 100;

        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) continue;

      const chosen = remainingReady.splice(bestIdx, 1)[0];
      updates.push({
        id: chosen.id,
        court: cell.court,
        scheduled_date: gameDay.date,
        scheduled_time: cell.time,
      });
      usedCells.add(`${cell.slot}-${cell.court}`);
      busy.add(chosen.home_team_id!);
      busy.add(chosen.away_team_id!);
      (teamSlots[chosen.home_team_id!] ||= []).push(cell.slot);
      (teamSlots[chosen.away_team_id!] ||= []).push(cell.slot);
    }

    // Pass 2 — fill remaining cells with pending knockout rows (TBD vs TBD).
    // Runs second so these land in later slots, after the games that decide them.
    const stillFree = freeCells.filter((c) => !usedCells.has(`${c.slot}-${c.court}`));
    for (const cell of stillFree) {
      const next = pending.shift();
      if (!next) break;
      updates.push({
        id: next.id,
        court: cell.court,
        scheduled_date: gameDay.date,
        scheduled_time: cell.time,
      });
      usedCells.add(`${cell.slot}-${cell.court}`);
    }

    if (updates.length === 0) {
      if (!silent) {
        toast({
          title: 'Nothing to schedule',
          description: 'No unscheduled matches for this sport. Empty slots stay open.',
        });
      }
      setLoading(false);
      return;
    }

    await Promise.all(
      updates.map((u) =>
        supabase
          .from('matches')
          .update({
            court: u.court,
            scheduled_date: u.scheduled_date,
            scheduled_time: u.scheduled_time,
          })
          .eq('id', u.id)
      )
    );

    // Optimistic local update; realtime will confirm
    setMatches((prev) =>
      prev.map((m) => {
        const u = updates.find((x) => x.id === m.id);
        return u
          ? { ...m, court: u.court, scheduled_date: u.scheduled_date, scheduled_time: u.scheduled_time }
          : m;
      })
    );

    const openLeft = stillFree.length - updates.filter((u) => !ready.some((r) => r.id === u.id)).length;

    if (!silent) {
      toast({
        title: 'Schedule updated',
        description:
          `${updates.length} match${updates.length === 1 ? '' : 'es'} placed` +
          (openLeft > 0 ? ` • ${openLeft} slot${openLeft === 1 ? '' : 's'} still open` : ''),
      });
    }
    setLoading(false);
  };

  /**
   * OPTIONAL live auto-fill. When the knockout bracket is created elsewhere,
   * realtime inserts those rows and this drops them into open slots with no
   * button press. Delete this whole effect if you'd rather fill manually.
   */
  useEffect(() => {
    if (!isAdmin || !selectedDay || loading || autoFillLock.current) return;

    const sport = getSportForDay(selectedDay);
    if (!sport) return;

    const { grid } = buildGrid(selectedDay);
    const hasFreeCell = grid.some((row) => row.cells.some((c) => !c.match));
    if (!hasFreeCell) return;

    const hasWaiting = matches.some(
      (m) =>
        m.sport_id === sport.id &&
        m.status === 'scheduled' &&
        !m.scheduled_date &&
        m.match_type !== 'spiritual'
    );
    if (!hasWaiting) return;

    autoFillLock.current = true;
    autoSchedule(selectedDay, true).finally(() => {
      setTimeout(() => {
        autoFillLock.current = false;
      }, 1500);
    });
  }, [matches, selectedDay, isAdmin]);

  // ---------------------------------------------------------------
  // Display helpers
  // ---------------------------------------------------------------
  const getMatchScore = (matchId: string) => scores.find((s) => s.match_id === matchId);

  const getTeamName = (teamId: string | null) => {
    if (!teamId) return 'TBD';
    return teams.find((t) => t.id === teamId)?.name || '?';
  };

  const getTeamColor = (teamId: string | null) => {
    if (!teamId) return '#666';
    return teams.find((t) => t.id === teamId)?.color || '#666';
  };

  const getSportEmoji = (sport: string | null) => {
    switch (sport) {
      case 'soccer': return '⚽';
      case 'basketball': return '🏀';
      case 'volleyball': return '🏐';
      case 'dodgeball': return '🤾';
      default: return '🏆';
    }
  };

  const getMatchTypeLabel = (match: Match) => {
    switch (match.match_type) {
      case 'league': return 'League';
      case 'knockout': return match.round ? `Knockout R${match.round}` : 'Knockout';
      case 'third_place': return '3rd Place';
      case 'fifth_place': return '5th/7th Place';
      default: return match.match_type;
    }
  };

  const getSportType = (match: Match) => {
    const sport = sports.find((s) => s.id === match.sport_id);
    return sport?.sport_type || 'soccer';
  };

  // ---------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------
  const openScoring = (match: Match) => {
    const existingScore = getMatchScore(match.id);
    const sport = sports.find((s) => s.id === match.sport_id);
    const sportType = sport?.sport_type || 'soccer';

    let initial: any;
    if (existingScore?.score_details && Object.keys(existingScore.score_details).length > 0) {
      initial = existingScore.score_details;
    } else {
      switch (sportType) {
        case 'soccer':
        case 'basketball':
          initial = { home_score: 0, away_score: 0 };
          break;
        case 'volleyball': {
          const maxSets = sport?.settings?.max_sets || 5;
          initial = { sets: Array.from({ length: maxSets }, () => ({ home: 0, away: 0 })) };
          break;
        }
        case 'dodgeball': {
          const maxRounds = sport?.settings?.max_rounds || 5;
          initial = { rounds: Array.from({ length: maxRounds }, () => ({ winner: null })) };
          break;
        }
        default:
          initial = {};
      }
    }

    setScoreState(initial);
    setScoringMatch(match);
  };

  const calculateTotals = (details: any, sportType: string): { home: number; away: number } => {
    switch (sportType) {
      case 'soccer':
      case 'basketball': {
        let home = details.home_score;
        let away = details.away_score;
        if (Array.isArray(home)) home = home.reduce((a: number, b: number) => a + b, 0);
        if (Array.isArray(away)) away = away.reduce((a: number, b: number) => a + b, 0);
        if (home === undefined || home === null) home = (details.home_halves || []).reduce((a: number, b: number) => a + b, 0);
        if (away === undefined || away === null) away = (details.away_halves || []).reduce((a: number, b: number) => a + b, 0);
        return { home: home || 0, away: away || 0 };
      }
      case 'volleyball': {
        const playedSets = (details.sets || []).filter((s: any) => s.home > 0 || s.away > 0);
        const homeSets = playedSets.filter((s: any) => s.home > s.away).length;
        const awaySets = playedSets.filter((s: any) => s.away > s.home).length;
        return { home: homeSets, away: awaySets };
      }
      case 'dodgeball': {
        const homeRounds = (details.rounds || []).filter((r: any) => r.winner === 'home').length;
        const awayRounds = (details.rounds || []).filter((r: any) => r.winner === 'away').length;
        return { home: homeRounds, away: awayRounds };
      }
      default:
        return { home: 0, away: 0 };
    }
  };

  const saveScore = async () => {
    if (!scoringMatch) return;
    setLoading(true);

    const sportType = getSportType(scoringMatch);
    const totals = calculateTotals(scoreState, sportType);

    let winnerId: string | null = null;
    let isDraw = false;

    if (totals.home > totals.away) {
      winnerId = scoringMatch.home_team_id;
    } else if (totals.away > totals.home) {
      winnerId = scoringMatch.away_team_id;
    } else {
      isDraw = true;
    }

    await supabase.from('match_scores').upsert(
      {
        match_id: scoringMatch.id,
        home_score: totals.home,
        away_score: totals.away,
        score_details: scoreState,
      },
      { onConflict: 'match_id' }
    );

    await supabase
      .from('matches')
      .update({ status: 'completed', winner_team_id: winnerId, is_draw: isDraw })
      .eq('id', scoringMatch.id);

    if (scoringMatch.match_type === 'league') {
      await recalculateStandings(scoringMatch.sport_id, sportType);
    } else {
      await advanceKnockoutWinners(scoringMatch.sport_id);
    }

    toast({ title: 'Score saved!' });
    setScoringMatch(null);
    setLoading(false);
  };

  const recalculateStandings = async (sportId: string, sportType: string) => {
    const { data: completedMatches } = await supabase
      .from('matches')
      .select('id, home_team_id, away_team_id, winner_team_id, is_draw')
      .eq('sport_id', sportId)
      .eq('match_type', 'league')
      .eq('status', 'completed');

    if (!completedMatches) return;

    const matchIds = completedMatches.map((m) => m.id);
    const { data: allScores } = await supabase.from('match_scores').select('*').in('match_id', matchIds);
    const { data: currentStandings } = await supabase.from('standings').select('*').eq('sport_id', sportId);
    if (!currentStandings) return;

    const stats: Record<string, { played: number; won: number; drawn: number; lost: number; scored: number; conceded: number }> = {};
    currentStandings.forEach((s) => {
      stats[s.team_id] = { played: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0 };
    });

    completedMatches.forEach((m) => {
      if (!m.home_team_id || !m.away_team_id) return;
      if (!stats[m.home_team_id] || !stats[m.away_team_id]) return;

      const matchScore = allScores?.find((s) => s.match_id === m.id);
      if (!matchScore) return;

      stats[m.home_team_id].played++;
      stats[m.away_team_id].played++;

      let homeScored = matchScore.home_score;
      let awayScored = matchScore.away_score;

      if ((sportType === 'soccer' || sportType === 'basketball') && matchScore.score_details) {
        const d = matchScore.score_details;
        if (typeof d.home_score === 'number') {
          homeScored = d.home_score;
          awayScored = d.away_score;
        } else if (Array.isArray(d.home_score)) {
          homeScored = d.home_score.reduce((a: number, b: number) => a + b, 0);
          awayScored = d.away_score.reduce((a: number, b: number) => a + b, 0);
        } else if (d.home_halves) {
          homeScored = d.home_halves.reduce((a: number, b: number) => a + b, 0);
          awayScored = d.away_halves.reduce((a: number, b: number) => a + b, 0);
        }
      }

      stats[m.home_team_id].scored += homeScored;
      stats[m.home_team_id].conceded += awayScored;
      stats[m.away_team_id].scored += awayScored;
      stats[m.away_team_id].conceded += homeScored;

      if (m.is_draw) {
        stats[m.home_team_id].drawn++;
        stats[m.away_team_id].drawn++;
      } else if (m.winner_team_id === m.home_team_id) {
        stats[m.home_team_id].won++;
        stats[m.away_team_id].lost++;
      } else {
        stats[m.away_team_id].won++;
        stats[m.home_team_id].lost++;
      }
    });

    const getHeadToHead = (teamA: string, teamB: string, ms: any[]) => {
      const direct = ms.filter(
        (m) =>
          (m.home_team_id === teamA && m.away_team_id === teamB) ||
          (m.home_team_id === teamB && m.away_team_id === teamA)
      );
      let aWins = 0;
      let bWins = 0;
      direct.forEach((m) => {
        if (m.winner_team_id === teamA) aWins++;
        else if (m.winner_team_id === teamB) bWins++;
      });
      if (bWins > aWins) return 1;
      if (aWins > bWins) return -1;
      return 0;
    };

    const sorted = Object.entries(stats)
      .map(([teamId, s]) => ({ teamId, ...s, points: s.won * 3 + s.drawn, difference: s.scored - s.conceded }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.difference !== a.difference) return b.difference - a.difference;
        const h2h = getHeadToHead(a.teamId, b.teamId, completedMatches);
        if (h2h !== 0) return h2h;
        return b.scored - a.scored;
      });

    await Promise.all(
      sorted.map((t, i) =>
        supabase
          .from('standings')
          .update({
            played: t.played, won: t.won, drawn: t.drawn, lost: t.lost,
            points: t.points, scored: t.scored, conceded: t.conceded,
            difference: t.difference, position: i + 1,
          })
          .eq('sport_id', sportId)
          .eq('team_id', t.teamId)
      )
    );
  };

  const advanceKnockoutWinners = async (sportId: string) => {
    const { data: freshMatches } = await supabase
      .from('matches')
      .select('*')
      .eq('sport_id', sportId)
      .eq('tournament_id', tournament.id)
      .neq('match_type', 'league');

    if (!freshMatches) return;

    for (const completed of freshMatches) {
      if (completed.status !== 'completed' || !completed.winner_team_id) continue;

      const winnerId = completed.winner_team_id;
      const loserId = completed.home_team_id === winnerId ? completed.away_team_id : completed.home_team_id;
      const round = completed.round || 1;
      const bracket = completed.bracket;

      const alreadyAdvanced = freshMatches.some(
        (m) => m.round === round + 1 && m.bracket === bracket && (m.home_team_id === winnerId || m.away_team_id === winnerId)
      );

      if (!alreadyAdvanced) {
        const nextKnockout = freshMatches.find(
          (m) => m.round === round + 1 && m.bracket === bracket && m.match_type === 'knockout' && (m.home_team_id === null || m.away_team_id === null)
        );
        if (nextKnockout) {
          const update: any = nextKnockout.home_team_id === null ? { home_team_id: winnerId } : { away_team_id: winnerId };
          await supabase.from('matches').update(update).eq('id', nextKnockout.id);
        }
      }

      const loserAlreadyPlaced = freshMatches.some(
        (m) => m.round === round + 1 && m.bracket === bracket && (m.match_type === 'third_place' || m.match_type === 'fifth_place') && (m.home_team_id === loserId || m.away_team_id === loserId)
      );

      if (!loserAlreadyPlaced && loserId) {
        const placementMatch = freshMatches.find(
          (m) => m.round === round + 1 && m.bracket === bracket && (m.match_type === 'third_place' || m.match_type === 'fifth_place') && (m.home_team_id === null || m.away_team_id === null)
        );
        if (placementMatch) {
          const update: any = placementMatch.home_team_id === null ? { home_team_id: loserId } : { away_team_id: loserId };
          await supabase.from('matches').update(update).eq('id', placementMatch.id);
        }
      }
    }
  };

  // ---------------------------------------------------------------
  // Scoring UI
  // ---------------------------------------------------------------
  const renderScoringUI = () => {
    if (!scoringMatch) return null;
    const sportType = getSportType(scoringMatch);
    const homeTeam = getTeamName(scoringMatch.home_team_id);
    const awayTeam = getTeamName(scoringMatch.away_team_id);

    switch (sportType) {
      case 'soccer':
      case 'basketball':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex flex-col items-center gap-3 flex-1">
                <span className="text-sm font-medium truncate max-w-[100px] text-center">{homeTeam}</span>
                <div className="flex items-center gap-3">
                  <Button variant="outline" className="h-14 w-14 text-xl" onClick={() => setScoreState({ ...scoreState, home_score: Math.max(0, (scoreState.home_score || 0) - 1) })}>−</Button>
                  <span className="text-4xl font-bold w-12 text-center">{scoreState.home_score || 0}</span>
                  <Button variant="outline" className="h-14 w-14 text-xl" onClick={() => setScoreState({ ...scoreState, home_score: (scoreState.home_score || 0) + 1 })}>+</Button>
                </div>
              </div>

              <span className="text-2xl text-muted-foreground px-2">-</span>

              <div className="flex flex-col items-center gap-3 flex-1">
                <span className="text-sm font-medium truncate max-w-[100px] text-center">{awayTeam}</span>
                <div className="flex items-center gap-3">
                  <Button variant="outline" className="h-14 w-14 text-xl" onClick={() => setScoreState({ ...scoreState, away_score: Math.max(0, (scoreState.away_score || 0) - 1) })}>−</Button>
                  <span className="text-4xl font-bold w-12 text-center">{scoreState.away_score || 0}</span>
                  <Button variant="outline" className="h-14 w-14 text-xl" onClick={() => setScoreState({ ...scoreState, away_score: (scoreState.away_score || 0) + 1 })}>+</Button>
                </div>
              </div>
            </div>

            <div className="border-t border-muted pt-4 text-center">
              <span className="text-5xl font-bold">
                {scoreState.home_score || 0} - {scoreState.away_score || 0}
              </span>
            </div>
          </div>
        );

      case 'volleyball':
        return (
          <div className="space-y-5">
            <p className="text-center text-sm text-muted-foreground">Points per set (leave 0-0 for unplayed sets)</p>
            {(scoreState.sets || []).map((set: any, i: number) => (
              <div key={i} className="space-y-2">
                <p className="text-center text-xs font-medium text-muted-foreground">Set {i + 1}</p>
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="h-12 w-12 text-lg" onClick={() => {
                      const sets = [...(scoreState.sets || [])];
                      sets[i] = { ...sets[i], home: Math.max(0, sets[i].home - 1) };
                      setScoreState({ ...scoreState, sets });
                    }}>−</Button>
                    <span className="text-2xl font-bold w-8 text-center">{set.home}</span>
                    <Button variant="outline" className="h-12 w-12 text-lg" onClick={() => {
                      const sets = [...(scoreState.sets || [])];
                      sets[i] = { ...sets[i], home: sets[i].home + 1 };
                      setScoreState({ ...scoreState, sets });
                    }}>+</Button>
                  </div>
                  <span className="text-muted-foreground">-</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="h-12 w-12 text-lg" onClick={() => {
                      const sets = [...(scoreState.sets || [])];
                      sets[i] = { ...sets[i], away: Math.max(0, sets[i].away - 1) };
                      setScoreState({ ...scoreState, sets });
                    }}>−</Button>
                    <span className="text-2xl font-bold w-8 text-center">{set.away}</span>
                    <Button variant="outline" className="h-12 w-12 text-lg" onClick={() => {
                      const sets = [...(scoreState.sets || [])];
                      sets[i] = { ...sets[i], away: sets[i].away + 1 };
                      setScoreState({ ...scoreState, sets });
                    }}>+</Button>
                  </div>
                </div>
              </div>
            ))}
            <div className="border-t border-muted pt-4 text-center">
              <span className="text-sm text-muted-foreground">Sets won: </span>
              <span className="text-2xl font-bold">
                {(scoreState.sets || []).filter((s: any) => s.home > s.away && (s.home > 0 || s.away > 0)).length}
                {' - '}
                {(scoreState.sets || []).filter((s: any) => s.away > s.home && (s.home > 0 || s.away > 0)).length}
              </span>
            </div>
          </div>
        );

      case 'dodgeball':
        return (
          <div className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">Tap the winner (leave blank for unplayed rounds)</p>
            {(scoreState.rounds || []).map((round: any, i: number) => (
              <div key={i} className="space-y-2">
                <p className="text-center text-xs text-muted-foreground">Round {i + 1}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      const rounds = [...(scoreState.rounds || [])];
                      rounds[i] = { winner: round.winner === 'home' ? null : 'home' };
                      setScoreState({ ...scoreState, rounds });
                    }}
                    className={`flex-1 py-5 rounded-xl text-sm font-medium transition-all ${
                      round.winner === 'home'
                        ? 'bg-green-500/20 border-2 border-green-500 text-green-400 scale-[1.02]'
                        : 'bg-muted border-2 border-transparent text-muted-foreground'
                    }`}
                  >
                    {getTeamName(scoringMatch.home_team_id)}
                  </button>
                  <button
                    onClick={() => {
                      const rounds = [...(scoreState.rounds || [])];
                      rounds[i] = { winner: round.winner === 'away' ? null : 'away' };
                      setScoreState({ ...scoreState, rounds });
                    }}
                    className={`flex-1 py-5 rounded-xl text-sm font-medium transition-all ${
                      round.winner === 'away'
                        ? 'bg-green-500/20 border-2 border-green-500 text-green-400 scale-[1.02]'
                        : 'bg-muted border-2 border-transparent text-muted-foreground'
                    }`}
                  >
                    {getTeamName(scoringMatch.away_team_id)}
                  </button>
                </div>
              </div>
            ))}
            <div className="border-t border-muted pt-4 text-center">
              <span className="text-sm text-muted-foreground">Rounds: </span>
              <span className="text-2xl font-bold">
                {(scoreState.rounds || []).filter((r: any) => r.winner === 'home').length}
                {' - '}
                {(scoreState.rounds || []).filter((r: any) => r.winner === 'away').length}
              </span>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ---------------------------------------------------------------
  // Cell renderers
  // ---------------------------------------------------------------
  const renderMatchCell = (match: Match) => {
    const matchScore = getMatchScore(match.id);
    const sportType = getSportType(match);
    const totals = matchScore ? calculateTotals(matchScore.score_details || {}, sportType) : null;
    const awaitingTeams = !match.home_team_id || !match.away_team_id;

    return (
      <div
        key={match.id}
        className={`p-4 border-b border-muted/30 last:border-0 ${
          match.status === 'completed' ? 'bg-green-500/5' : ''
        } ${awaitingTeams ? 'opacity-80' : ''}`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Court {match.court || '?'}</Badge>
            <Badge className="text-xs bg-muted text-muted-foreground">{getMatchTypeLabel(match)}</Badge>
          </div>
          {match.status === 'completed' && (
            <Badge className="text-xs bg-green-500/20 text-green-400">Done</Badge>
          )}
          {awaitingTeams && match.status !== 'completed' && (
            <Badge className="text-xs bg-amber-500/20 text-amber-400">Pending</Badge>
          )}
        </div>

        <div className="flex items-center justify-between py-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getTeamColor(match.home_team_id) }} />
              <span className={`text-base ${match.winner_team_id === match.home_team_id ? 'font-bold' : ''} ${!match.home_team_id ? 'text-muted-foreground italic' : ''}`}>
                {getTeamName(match.home_team_id)}
              </span>
            </div>
          </div>

          <div className="px-4">
            {match.status === 'completed' && totals ? (
              <span className="text-2xl font-bold">{totals.home} - {totals.away}</span>
            ) : (
              <span className="text-lg text-muted-foreground">vs</span>
            )}
          </div>

          <div className="flex-1 flex justify-end">
            <div className="flex items-center gap-2">
              <span className={`text-base ${match.winner_team_id === match.away_team_id ? 'font-bold' : ''} ${!match.away_team_id ? 'text-muted-foreground italic' : ''}`}>
                {getTeamName(match.away_team_id)}
              </span>
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getTeamColor(match.away_team_id) }} />
            </div>
          </div>
        </div>

        {isAdmin && match.home_team_id && match.away_team_id && (
          <Button variant="outline" className="w-full h-12 mt-2 text-sm" onClick={() => openScoring(match)}>
            {match.status === 'completed' ? '✏️ Edit Score' : '📝 Record Score'}
          </Button>
        )}

        {awaitingTeams && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            Teams decided by earlier results — updates automatically
          </p>
        )}
      </div>
    );
  };

  const renderEmptyCell = (slot: SlotRow, cell: SlotCell) => (
    <div
      key={`empty-${slot.slotNumber}-${cell.court}`}
      className="p-4 border-b border-muted/30 last:border-0"
    >
      <div className="flex items-center justify-between mb-2">
        <Badge variant="outline" className="text-xs opacity-60">Court {cell.court}</Badge>
        <Badge className="text-xs bg-muted/50 text-muted-foreground">TBD</Badge>
      </div>
      <div className="border border-dashed border-muted rounded-lg py-5 text-center">
        <p className="text-sm text-muted-foreground italic">Open slot</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Fills in once more matches exist
        </p>
      </div>
    </div>
  );

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div className="min-h-screen pb-32 safe-top safe-bottom">
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-muted p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => router.push(`/tournament/${tournament.id}`)}>
              ← Back
            </Button>
            <h1 className="text-xl font-bold">📅 Game Days</h1>
          </div>
          {isAdmin && (
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button className="h-12 px-5">+ New Day</Button>
              </DialogTrigger>
              <DialogContent className="mt-12">
                <DialogHeader>
                  <DialogTitle>Create Game Day</DialogTitle>
                </DialogHeader>
                <form onSubmit={createGameDay} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required className="h-12 text-base" />
                  </div>
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input type="time" value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)} required className="h-12 text-base" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Time Slots</Label>
                      <select value={newSlots} onChange={(e) => setNewSlots(e.target.value)} className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base">
                        {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                          <option key={n} value={n}>{n} slots</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Courts</Label>
                      <select value={newCourts} onChange={(e) => setNewCourts(e.target.value)} className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base">
                        <option value="1">1 court</option>
                        <option value="2">2 courts</option>
                        <option value="3">3 courts</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Sport</Label>
                    <select value={newSport} onChange={(e) => setNewSport(e.target.value)} className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base">
                      <option value="soccer">⚽ Soccer</option>
                      <option value="basketball">🏀 Basketball</option>
                      <option value="volleyball">🏐 Volleyball</option>
                      <option value="dodgeball">🤾 Dodgeball</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Input placeholder="e.g., Finals day!" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} className="h-12 text-base" />
                  </div>
                  <Button type="submit" className="w-full h-14 text-base" disabled={loading}>
                    {loading ? 'Creating...' : 'Create Game Day'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {gameDays.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1">
            {gameDays.map((day) => (
              <button
                key={day.id}
                onClick={() => setSelectedDay(day)}
                className={`flex-shrink-0 px-4 py-3 rounded-xl text-sm transition-all ${
                  selectedDay?.id === day.id
                    ? 'bg-primary text-primary-foreground scale-[1.02]'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <span className="block text-lg">{getSportEmoji(day.sport_type)}</span>
                <span className="block text-xs mt-0.5">
                  {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </button>
            ))}
          </div>
        )}

        {selectedDay && (() => {
          const { grid, overflow } = buildGrid(selectedDay);
          const totalSlots = getSlotCount(selectedDay);
          const filledCount = grid.reduce((n, r) => n + r.cells.filter((c) => c.match).length, 0);
          const openCount = grid.reduce((n, r) => n + r.cells.filter((c) => !c.match).length, 0);

          return (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold">
                    {getSportEmoji(selectedDay.sport_type)}{' '}
                    {new Date(selectedDay.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {totalSlots} slots • {selectedDay.courts_available} court{selectedDay.courts_available > 1 ? 's' : ''}
                    {' • '}{filledCount} filled, {openCount} open
                    {selectedDay.notes && ` • ${selectedDay.notes}`}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    {openCount > 0 && (
                      <Button onClick={() => autoSchedule(selectedDay)} disabled={loading} className="h-12">
                        {loading ? '...' : filledCount === 0 ? '⚡ Fill' : '⚡ Fill Open'}
                      </Button>
                    )}
                    {filledCount > 0 && (
                      <Button variant="ghost" className="h-12 text-xs" onClick={() => clearDay(selectedDay)} disabled={loading}>
                        ♻️
                      </Button>
                    )}
                    <Button variant="ghost" className="h-12 text-red-400" onClick={() => deleteGameDay(selectedDay.id)}>
                      🗑️
                    </Button>
                  </div>
                )}
              </div>

              {!getSportForDay(selectedDay) ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <p className="text-lg mb-2">Sport not set up</p>
                    <p className="text-sm">
                      No “{selectedDay.sport_type}” sport exists in this tournament yet.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {grid.map((slot) => (
                    <Card key={slot.slotNumber} className="overflow-hidden">
                      <CardHeader className="py-3 px-4 bg-muted/30">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                            {slot.slotNumber}
                          </span>
                          <span>Game {slot.slotNumber}</span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {formatTime(slot.time)}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        {slot.cells.map((cell) =>
                          cell.match ? renderMatchCell(cell.match) : renderEmptyCell(slot, cell)
                        )}
                      </CardContent>
                    </Card>
                  ))}

                  {overflow.length > 0 && (
                    <Card className="border-amber-500/40">
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm text-amber-400">
                          ⚠️ Outside the slot grid ({overflow.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        {overflow.map((m) => renderMatchCell(m))}
                        <p className="px-4 py-3 text-xs text-muted-foreground">
                          These were scheduled at times that don&apos;t line up with the current
                          slot grid. Tap ♻️ to clear the day and re-fill.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {gameDays.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="text-lg mb-2">No game days yet</p>
              {isAdmin && <p className="text-sm">Tap &quot;+ New Day&quot; to get started</p>}
            </CardContent>
          </Card>
        )}
      </div>

      {scoringMatch && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/80" onClick={() => setScoringMatch(null)} />
          <div className="relative z-50 w-full max-w-md max-h-[85vh] overflow-auto rounded-t-2xl sm:rounded-2xl border bg-background p-6 pb-32 shadow-lg mx-0 sm:mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">
                {getTeamName(scoringMatch.home_team_id)} vs {getTeamName(scoringMatch.away_team_id)}
              </h2>
              <button onClick={() => setScoringMatch(null)} className="text-2xl p-2">✕</button>
            </div>

            {renderScoringUI()}

            <Button onClick={saveScore} className="w-full h-14 mt-6 text-base" disabled={loading}>
              {loading ? 'Saving...' : '✓ Save Result'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}