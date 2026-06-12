'use client';

import { useState, useEffect } from 'react';
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

  // Scoring dialog state
  const [scoringMatch, setScoringMatch] = useState<Match | null>(null);
  const [scoreState, setScoreState] = useState<any>({});

  // Create game day form
  const [newDate, setNewDate] = useState('');
  const [newCourts, setNewCourts] = useState('2');
  const [newSlots, setNewSlots] = useState('4');
  const [newSport, setNewSport] = useState('soccer');
  const [newNotes, setNewNotes] = useState('');

  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  // Real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('schedule-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournament.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMatches((prev) => [...prev, payload.new as Match]);
        } else if (payload.eventType === 'UPDATE') {
          setMatches((prev) => prev.map((m) => (m.id === (payload.new as Match).id ? (payload.new as Match) : m)));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_scores' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setScores((prev) => [...prev, payload.new as Score]);
        } else if (payload.eventType === 'UPDATE') {
          setScores((prev) => prev.map((s) => (s.id === (payload.new as Score).id ? (payload.new as Score) : s)));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tournament.id]);

  const createGameDay = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase
      .from('game_days')
      .insert({
        tournament_id: tournament.id,
        date: newDate,
        start_time: newStartTime,
        duration_min: parseInt(newSlots) * 20, // will be recalculated based on sport
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
      await supabase
        .from('matches')
        .update({ scheduled_date: null, scheduled_time: null, court: null })
        .eq('tournament_id', tournament.id)
        .eq('scheduled_date', dayToDelete.date);
    }

    await supabase.from('game_days').delete().eq('id', id);
    setGameDays((prev) => prev.filter((d) => d.id !== id));
    if (selectedDay?.id === id) setSelectedDay(null);
    toast({ title: 'Game day deleted' });
    router.refresh();
  };

  // Auto-schedule: fill slots with unscheduled matches
  const autoSchedule = async (gameDay: GameDay) => {
    setLoading(true);

    const sport = sports.find((s) => s.sport_type === gameDay.sport_type);
    if (!sport) {
      toast({ title: 'Error', description: 'Sport not found', variant: 'destructive' });
      setLoading(false);
      return;
    }

    const totalSlots = Math.floor(gameDay.duration_min / 20); // We stored slots * 20 as duration
    const courts = gameDay.courts_available;

    // Get unscheduled matches for this sport (league first, then knockout)
    const unscheduledLeague = matches.filter(
      (m) =>
        m.sport_id === sport.id &&
        m.status === 'scheduled' &&
        !m.scheduled_date &&
        m.match_type === 'league' &&
        m.home_team_id &&
        m.away_team_id
    );

    const unscheduledKnockout = matches.filter(
      (m) =>
        m.sport_id === sport.id &&
        m.status === 'scheduled' &&
        !m.scheduled_date &&
        m.match_type !== 'league' &&
        m.match_type !== 'spiritual' &&
        m.home_team_id &&
        m.away_team_id
    );

    const unscheduled = [...unscheduledLeague, ...unscheduledKnockout];

    if (unscheduled.length === 0) {
      toast({ title: 'No matches available', description: 'All matches are scheduled or waiting for teams', variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Select balanced matches
    const selected = selectBalancedMatches(unscheduled, totalSlots, courts, teams);

    // Assign slot numbers as scheduled_time (slot 1, 2, 3...)
    const updates: { id: string; court: number; scheduled_date: string; scheduled_time: string }[] = [];
    // Get game duration from sport settings
    const gameDuration = sport?.settings?.game_duration_min || 20;

    // Parse start time
    const [startHours, startMinutes] = gameDay.start_time.split(':').map(Number);

    let slotIndex = 0;

    for (let i = 0; i < selected.length; i += courts) {
      const slotMatches = selected.slice(i, i + courts);
      slotIndex++;

      // Calculate actual start time for this slot
      const totalMinutes = startHours * 60 + startMinutes + (slotIndex - 1) * gameDuration;
      const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
      const mins = (totalMinutes % 60).toString().padStart(2, '0');
      const timeStr = `${hours}:${mins}:00`;

      slotMatches.forEach((m, courtIdx) => {
        updates.push({
          id: m.id,
          court: courtIdx + 1,
          scheduled_date: gameDay.date,
          scheduled_time: timeStr,
        });
      });
    }

    for (const upd of updates) {
      await supabase
        .from('matches')
        .update({
          court: upd.court,
          scheduled_date: upd.scheduled_date,
          scheduled_time: upd.scheduled_time,
        })
        .eq('id', upd.id);
    }

    toast({
      title: 'Schedule created!',
      description: `${updates.length} matches assigned to ${slotIndex} slots`,
    });
    router.refresh();
    setLoading(false);
  };

  // Get schedule grid for a day
  const getScheduleGrid = (gameDay: GameDay) => {
    const sport = sports.find((s) => s.sport_type === gameDay.sport_type);
    if (!sport) return [];

    const dayMatches = matches.filter(
      (m) => m.scheduled_date === gameDay.date && m.sport_id === sport.id
    );

    // Group by slot (scheduled_time)
    const slots = new Map<string, Match[]>();
    dayMatches.forEach((m) => {
      if (!m.scheduled_time) return;
      const slot = m.scheduled_time;
      if (!slots.has(slot)) slots.set(slot, []);
      slots.get(slot)!.push(m);
    });

    return Array.from(slots.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([slot, slotMatches], index) => ({
        slotNumber: index + 1,
        matches: slotMatches.sort((a, b) => (a.court || 0) - (b.court || 0)),
      }));
  };

  // Score helpers
  const getMatchScore = (matchId: string) => {
    return scores.find((s) => s.match_id === matchId);
  };

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
      case 'knockout': return 'Knockout';
      case 'third_place': return '3rd Place';
      case 'fifth_place': return '5th/7th Place';
      default: return '';
    }
  };

  // ---- SCORING LOGIC ----
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

  const getSportType = (match: Match) => {
    const sport = sports.find((s) => s.id === match.sport_id);
    return sport?.sport_type || 'soccer';
  };

  const calculateTotals = (details: any, sportType: string): { home: number; away: number } => {
    switch (sportType) {
      case 'soccer':
      case 'basketball': {
        let home = details.home_score;
        let away = details.away_score;
        // Handle old array format
        if (Array.isArray(home)) home = home.reduce((a: number, b: number) => a + b, 0);
        if (Array.isArray(away)) away = away.reduce((a: number, b: number) => a + b, 0);
        // Handle old halves format
        if (home === undefined || home === null) home = (details.home_halves || []).reduce((a: number, b: number) => a + b, 0);
        if (away === undefined || away === null) away = (details.away_halves || []).reduce((a: number, b: number) => a + b, 0);
        return { home: home || 0, away: away || 0 };
      }
      case 'volleyball': {
        // Only count sets where at least one team scored
        const playedSets = (details.sets || []).filter((s: any) => s.home > 0 || s.away > 0);
        const homeSets = playedSets.filter((s: any) => s.home > s.away).length;
        const awaySets = playedSets.filter((s: any) => s.away > s.home).length;
        return { home: homeSets, away: awaySets };
      }
      case 'dodgeball': {
        // Only count rounds with a winner
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

    await supabase
      .from('match_scores')
      .upsert({
        match_id: scoringMatch.id,
        home_score: totals.home,
        away_score: totals.away,
        score_details: scoreState,
      }, { onConflict: 'match_id' });

    await supabase
      .from('matches')
      .update({
        status: 'completed',
        winner_team_id: winnerId,
        is_draw: isDraw,
      })
      .eq('id', scoringMatch.id);

    // Recalculate standings if league match
    if (scoringMatch.match_type === 'league') {
      await recalculateStandings(scoringMatch.sport_id, sportType);
    }

    // Advance knockout winners
    if (scoringMatch.match_type !== 'league') {
      await advanceKnockoutWinners(scoringMatch.sport_id);
    }

    toast({ title: 'Score saved!' });
    setScoringMatch(null);
    setLoading(false);
    router.refresh();
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
    const { data: allScores } = await supabase
      .from('match_scores')
      .select('*')
      .in('match_id', matchIds);

    const { data: currentStandings } = await supabase
      .from('standings')
      .select('*')
      .eq('sport_id', sportId);

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

    // Head-to-head: returns positive if B wins, negative if A wins, 0 if tied
    const getHeadToHead = (teamA: string, teamB: string, matches: any[]) => {
      const directMatches = matches.filter(
        (m) =>
          (m.home_team_id === teamA && m.away_team_id === teamB) ||
          (m.home_team_id === teamB && m.away_team_id === teamA)
      );

      let aWins = 0;
      let bWins = 0;

      directMatches.forEach((m) => {
        if (m.winner_team_id === teamA) aWins++;
        else if (m.winner_team_id === teamB) bWins++;
      });

      if (bWins > aWins) return 1;  // B is better
      if (aWins > bWins) return -1; // A is better
      return 0; // still tied
    };

    const sorted = Object.entries(stats)
      .map(([teamId, s]) => ({ teamId, ...s, points: s.won * 3 + s.drawn, difference: s.scored - s.conceded }))
      .sort((a, b) => {
        // 1. League points
        if (b.points !== a.points) return b.points - a.points;
        // 2. Point/goal/set/round difference
        if (b.difference !== a.difference) return b.difference - a.difference;
        // 3. Head-to-head
        const h2h = getHeadToHead(a.teamId, b.teamId, completedMatches);
        if (h2h !== 0) return h2h;
        // 4. Total scored
        return b.scored - a.scored;
      });

    const updates = sorted.map((t, i) =>
      supabase.from('standings').update({
        played: t.played, won: t.won, drawn: t.drawn, lost: t.lost,
        points: t.points, scored: t.scored, conceded: t.conceded,
        difference: t.difference, position: i + 1,
      }).eq('sport_id', sportId).eq('team_id', t.teamId)
    );

    await Promise.all(updates);
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

  // Scoring UI renderer
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
              {/* Home */}
              <div className="flex flex-col items-center gap-3 flex-1">
                <span className="text-sm font-medium truncate max-w-[100px] text-center">{homeTeam}</span>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    className="h-14 w-14 text-xl"
                    onClick={() => {
                      const s = { ...scoreState };
                      s.home_score = Math.max(0, (s.home_score || 0) - 1);
                      setScoreState(s);
                    }}
                  >−</Button>
                  <span className="text-4xl font-bold w-12 text-center">{scoreState.home_score || 0}</span>
                  <Button
                    variant="outline"
                    className="h-14 w-14 text-xl"
                    onClick={() => {
                      const s = { ...scoreState };
                      s.home_score = (s.home_score || 0) + 1;
                      setScoreState(s);
                    }}
                  >+</Button>
                </div>
              </div>

              <span className="text-2xl text-muted-foreground px-2">-</span>

              {/* Away */}
              <div className="flex flex-col items-center gap-3 flex-1">
                <span className="text-sm font-medium truncate max-w-[100px] text-center">{awayTeam}</span>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    className="h-14 w-14 text-xl"
                    onClick={() => {
                      const s = { ...scoreState };
                      s.away_score = Math.max(0, (s.away_score || 0) - 1);
                      setScoreState(s);
                    }}
                  >−</Button>
                  <span className="text-4xl font-bold w-12 text-center">{scoreState.away_score || 0}</span>
                  <Button
                    variant="outline"
                    className="h-14 w-14 text-xl"
                    onClick={() => {
                      const s = { ...scoreState };
                      s.away_score = (s.away_score || 0) + 1;
                      setScoreState(s);
                    }}
                  >+</Button>
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
                      {homeTeam}
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
                      {awayTeam}
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

  return (
    <div className="min-h-screen pb-32 safe-top safe-bottom">
      {/* Header */}
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
        {/* Game Day Selector */}
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

        {/* Selected Day Content */}
        {selectedDay && (() => {
          const grid = getScheduleGrid(selectedDay);
          const totalSlots = Math.floor(selectedDay.duration_min / 20);
          const formatTime = (time: string) => {
            const [h, m] = time.split(':');
            const hour = parseInt(h);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
            return `${h12}:${m} ${ampm}`;
          };

          return (
            <div>
              {/* Day Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold">
                    {getSportEmoji(selectedDay.sport_type)}{' '}
                    {new Date(selectedDay.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {totalSlots} slots • {selectedDay.courts_available} court{selectedDay.courts_available > 1 ? 's' : ''}
                    {selectedDay.notes && ` • ${selectedDay.notes}`}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    {grid.length === 0 && (
                      <Button onClick={() => autoSchedule(selectedDay)} disabled={loading} className="h-12">
                        {loading ? '...' : '⚡ Fill'}
                      </Button>
                    )}
                    <Button variant="ghost" className="h-12 text-red-400" onClick={() => deleteGameDay(selectedDay.id)}>
                      🗑️
                    </Button>
                  </div>
                )}
              </div>

              {/* Schedule Grid */}
              {grid.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <p className="text-lg mb-2">No games scheduled</p>
                    {isAdmin && <p className="text-sm">Tap ⚡ Fill to auto-assign matches</p>}
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
                          {slot.matches[0]?.scheduled_time && (
                            <span className="text-xs text-muted-foreground ml-auto">
                              {formatTime(slot.matches[0].scheduled_time)}
                            </span>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        {slot.matches.map((match) => {
                          const matchScore = getMatchScore(match.id);
                          const sportType = getSportType(match);
                          const totals = matchScore ? calculateTotals(matchScore.score_details || {}, sportType) : null;

                          return (
                            <div
                              key={match.id}
                              className={`p-4 border-b border-muted/30 last:border-0 ${
                                match.status === 'completed' ? 'bg-green-500/5' : ''
                              }`}
                            >
                              {/* Court label + match type */}
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    Court {match.court || '?'}
                                  </Badge>
                                  <Badge className="text-xs bg-muted text-muted-foreground">
                                    {getMatchTypeLabel(match)}
                                  </Badge>
                                </div>
                                {match.status === 'completed' && (
                                  <Badge className="text-xs bg-green-500/20 text-green-400">Done</Badge>
                                )}
                              </div>

                              {/* Teams and Score */}
                              <div className="flex items-center justify-between py-2">
                                {/* Home */}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getTeamColor(match.home_team_id) }} />
                                    <span className={`text-base ${match.winner_team_id === match.home_team_id ? 'font-bold' : ''}`}>
                                      {getTeamName(match.home_team_id)}
                                    </span>
                                  </div>
                                </div>

                                {/* Score */}
                                <div className="px-4">
                                  {match.status === 'completed' && totals ? (
                                    <span className="text-2xl font-bold">
                                      {totals.home} - {totals.away}
                                    </span>
                                  ) : (
                                    <span className="text-lg text-muted-foreground">vs</span>
                                  )}
                                </div>

                                {/* Away */}
                                <div className="flex-1 flex justify-end">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-base ${match.winner_team_id === match.away_team_id ? 'font-bold' : ''}`}>
                                      {getTeamName(match.away_team_id)}
                                    </span>
                                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getTeamColor(match.away_team_id) }} />
                                  </div>
                                </div>
                              </div>

                              {/* Admin action */}
                              {isAdmin && match.home_team_id && match.away_team_id && (
                                <Button
                                  variant="outline"
                                  className="w-full h-12 mt-2 text-sm"
                                  onClick={() => openScoring(match)}
                                >
                                  {match.status === 'completed' ? '✏️ Edit Score' : '📝 Record Score'}
                                </Button>
                              )}

                              {/* TBD notice */}
                              {(!match.home_team_id || !match.away_team_id) && (
                                <p className="text-xs text-muted-foreground text-center mt-2">
                                  Waiting for previous results...
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  ))}
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

      {/* Scoring Dialog */}
      {scoringMatch && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/80" onClick={() => setScoringMatch(null)} />
            <div className="relative z-50 w-full max-w-md max-h-[85vh] overflow-auto rounded-t-2xl sm:rounded-2xl border bg-background p-6 pb-32 shadow-lg mx-0 sm:mx-4">            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">
                {getTeamName(scoringMatch.home_team_id)} vs {getTeamName(scoringMatch.away_team_id)}
              </h2>
              <button onClick={() => setScoringMatch(null)} className="text-2xl p-2">✕</button>
            </div>

            {renderScoringUI()}

            <Button
              onClick={saveScore}
              className="w-full h-14 mt-6 text-base"
              disabled={loading}
            >
              {loading ? 'Saving...' : '✓ Save Result'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Balance algorithm
function selectBalancedMatches(
  unscheduled: Match[],
  totalSlots: number,
  courts: number,
  teams: Team[]
): Match[] {
  const selected: Match[] = [];
  const remaining = [...unscheduled];
  const teamSlotCount: Record<string, number[]> = {};
  teams.forEach((t) => (teamSlotCount[t.id] = []));

  for (let slot = 0; slot < totalSlots && remaining.length > 0; slot++) {
    const slotTeams = new Set<string>();

    for (let c = 0; c < courts && remaining.length > 0; c++) {
      let bestIdx = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const m = remaining[i];
        if (!m.home_team_id || !m.away_team_id) continue;
        if (slotTeams.has(m.home_team_id) || slotTeams.has(m.away_team_id)) continue;

        const homeSlots = teamSlotCount[m.home_team_id] || [];
        const awaySlots = teamSlotCount[m.away_team_id] || [];
        const homeGap = homeSlots.length > 0 ? slot - homeSlots[homeSlots.length - 1] : 99;
        const awayGap = awaySlots.length > 0 ? slot - awaySlots[awaySlots.length - 1] : 99;
        let score = homeGap + awayGap;

        // Penalize 3 in a row
        const homeConsec = homeSlots.length >= 2 && homeSlots[homeSlots.length - 1] === slot - 1 && homeSlots[homeSlots.length - 2] === slot - 2;
        const awayConsec = awaySlots.length >= 2 && awaySlots[awaySlots.length - 1] === slot - 1 && awaySlots[awaySlots.length - 2] === slot - 2;
        if (homeConsec) score -= 100;
        if (awayConsec) score -= 100;

        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) break;

      const chosen = remaining.splice(bestIdx, 1)[0];
      selected.push(chosen);
      slotTeams.add(chosen.home_team_id!);
      slotTeams.add(chosen.away_team_id!);
      if (teamSlotCount[chosen.home_team_id!]) teamSlotCount[chosen.home_team_id!].push(slot);
      if (teamSlotCount[chosen.away_team_id!]) teamSlotCount[chosen.away_team_id!].push(slot);
    }
  }

  return selected;
}