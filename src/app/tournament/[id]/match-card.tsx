'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

interface MatchCardProps {
  match: {
    id: string;
    sport_id: string;  // ← ADD THIS
    home_team_id: string | null;
    away_team_id: string | null;
    status: string;
    winner_team_id: string | null;
    is_draw: boolean;
    match_type: string;
    round: number | null;
    court: number | null;
    scheduled_time: string | null;
  };
  score: { id: string; home_score: number; away_score: number; score_details: any } | undefined;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamColor: string;
  awayTeamColor: string;
  sportType: string;
  sportSettings: any;
  isAdmin: boolean;
  onUpdate: () => void;
}

export default function MatchCard({
  match,
  score,
  homeTeamName,
  awayTeamName,
  homeTeamColor,
  awayTeamColor,
  sportType,
  sportSettings,
  isAdmin,
  onUpdate,
}: MatchCardProps) {
  const [showScoring, setShowScoring] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();
  const { toast } = useToast();

  // Initialize score state based on sport type
  const initScoreState = () => {
    if (score?.score_details && Object.keys(score.score_details).length > 0) {
      return score.score_details;
    }

    switch (sportType) {
      case 'soccer':
      case 'basketball':
        return { home_halves: [0, 0], away_halves: [0, 0] };
      case 'volleyball': {
        const maxSets = sportSettings?.max_sets || 3;
        return {
          sets: Array.from({ length: maxSets }, () => ({ home: 0, away: 0 })),
          home_sets_won: 0,
          away_sets_won: 0,
        };
      }
      case 'dodgeball': {
        const maxRounds = sportSettings?.max_rounds || 3;
        return {
          rounds: Array.from({ length: maxRounds }, () => ({ winner: null })),
          home_rounds_won: 0,
          away_rounds_won: 0,
        };
      }
      default:
        return {};
    }
  };

  const [scoreState, setScoreState] = useState(initScoreState);

  const calculateTotals = (details: any): { home: number; away: number } => {
    switch (sportType) {
      case 'soccer':
      case 'basketball': {
        const home = (details.home_halves || []).reduce((a: number, b: number) => a + b, 0);
        const away = (details.away_halves || []).reduce((a: number, b: number) => a + b, 0);
        return { home, away };
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
    setSaving(true);
    const totals = calculateTotals(scoreState);

    let winnerId: string | null = null;
    let isDraw = false;

    if (totals.home > totals.away) {
      winnerId = match.home_team_id;
    } else if (totals.away > totals.home) {
      winnerId = match.away_team_id;
    } else {
      isDraw = true;
    }

    // Upsert score
    const { error: scoreError } = await supabase
      .from('match_scores')
      .upsert({
        match_id: match.id,
        home_score: totals.home,
        away_score: totals.away,
        score_details: scoreState,
      }, { onConflict: 'match_id' });

    if (scoreError) {
      toast({ title: 'Error', description: scoreError.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    // Update match status
    const { error: matchError } = await supabase
      .from('matches')
      .update({
        status: 'completed',
        winner_team_id: winnerId,
        is_draw: isDraw,
      })
      .eq('id', match.id);

    if (matchError) {
      toast({ title: 'Error', description: matchError.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    // Recalculate standings
    await recalculateStandings();

    toast({ title: 'Score saved!' });
    setShowScoring(false);
    setSaving(false);
    onUpdate();
  };

  const recalculateStandings = async () => {
    const sportId = match.sport_id;
    if (!sportId) {
      console.error('No sport_id on match');
      return;
    }

    // Fetch all completed league matches for this sport
    const { data: completedMatches, error: fetchError } = await supabase
      .from('matches')
      .select('id, home_team_id, away_team_id, winner_team_id, is_draw')
      .eq('sport_id', sportId)
      .eq('match_type', 'league')
      .eq('status', 'completed');

    if (fetchError || !completedMatches) {
      console.error('Failed to fetch matches:', fetchError);
      return;
    }

    // Fetch all scores for those matches
    const matchIds = completedMatches.map((m) => m.id);
    const { data: allScores } = await supabase
      .from('match_scores')
      .select('*')
      .in('match_id', matchIds);

    // Fetch current standings entries
    const { data: currentStandings } = await supabase
      .from('standings')
      .select('*')
      .eq('sport_id', sportId);

    if (!currentStandings) return;

    // Build stats from scratch
    const stats: Record<string, {
      played: number; won: number; drawn: number; lost: number;
      scored: number; conceded: number;
    }> = {};

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

      // Get actual scored values from details
      let homeScored = matchScore.home_score;
      let awayScored = matchScore.away_score;

      if ((sportType === 'soccer' || sportType === 'basketball') && matchScore.score_details) {
        const details = matchScore.score_details;
        homeScored = (details.home_halves || []).reduce((a: number, b: number) => a + b, 0);
        awayScored = (details.away_halves || []).reduce((a: number, b: number) => a + b, 0);
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
      } else if (m.winner_team_id === m.away_team_id) {
        stats[m.away_team_id].won++;
        stats[m.home_team_id].lost++;
      }
    });

    // Sort for positions
    const sortedTeams = Object.entries(stats)
      .map(([teamId, s]) => ({
        teamId,
        ...s,
        points: s.won * 3 + s.drawn * 1,
        difference: s.scored - s.conceded,
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.difference !== a.difference) return b.difference - a.difference;
        if (b.scored !== a.scored) return b.scored - a.scored;
        return 0;
      });

    // Update each standing row
    const updates = sortedTeams.map((t, i) => 
      supabase
        .from('standings')
        .update({
          played: t.played,
          won: t.won,
          drawn: t.drawn,
          lost: t.lost,
          points: t.points,
          scored: t.scored,
          conceded: t.conceded,
          difference: t.difference,
          position: i + 1,
        })
        .eq('sport_id', sportId)
        .eq('team_id', t.teamId)
    );

    await Promise.all(updates);
  };

  // Score editing UI based on sport type
  const renderScoringUI = () => {
    switch (sportType) {
      case 'soccer':
      case 'basketball':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              {sportType === 'soccer' ? 'Goals' : 'Points'} per half
            </p>
            {[0, 1].map((half) => (
              <div key={half} className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">
                  {half === 0 ? '1st Half' : '2nd Half'}
                </p>
                <div className="flex items-center justify-between gap-4">
                  {/* Home */}
                  <div className="flex-1 flex items-center justify-end gap-2">
                    <span className="text-sm truncate">{homeTeamName}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => {
                          const newState = { ...scoreState };
                          newState.home_halves = [...(newState.home_halves || [0, 0])];
                          newState.home_halves[half] = Math.max(0, newState.home_halves[half] - 1);
                          setScoreState(newState);
                        }}
                      >
                        −
                      </Button>
                      <span className="w-8 text-center text-lg font-bold">
                        {scoreState.home_halves?.[half] || 0}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => {
                          const newState = { ...scoreState };
                          newState.home_halves = [...(newState.home_halves || [0, 0])];
                          newState.home_halves[half]++;
                          setScoreState(newState);
                        }}
                      >
                        +
                      </Button>
                    </div>
                  </div>

                  <span className="text-muted-foreground">vs</span>

                  {/* Away */}
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => {
                          const newState = { ...scoreState };
                          newState.away_halves = [...(newState.away_halves || [0, 0])];
                          newState.away_halves[half] = Math.max(0, newState.away_halves[half] - 1);
                          setScoreState(newState);
                        }}
                      >
                        −
                      </Button>
                      <span className="w-8 text-center text-lg font-bold">
                        {scoreState.away_halves?.[half] || 0}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => {
                          const newState = { ...scoreState };
                          newState.away_halves = [...(newState.away_halves || [0, 0])];
                          newState.away_halves[half]++;
                          setScoreState(newState);
                        }}
                      >
                        +
                      </Button>
                    </div>
                    <span className="text-sm truncate">{awayTeamName}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Total */}
            <div className="border-t border-muted pt-3 flex justify-center items-center gap-4">
              <span className="font-bold text-xl">
                {(scoreState.home_halves || [0, 0]).reduce((a: number, b: number) => a + b, 0)}
              </span>
              <span className="text-muted-foreground">-</span>
              <span className="font-bold text-xl">
                {(scoreState.away_halves || [0, 0]).reduce((a: number, b: number) => a + b, 0)}
              </span>
            </div>
          </div>
        );

      case 'volleyball':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">Points per set</p>
            {(scoreState.sets || []).map((set: any, i: number) => (
              <div key={i} className="space-y-1">
                <p className="text-xs text-muted-foreground text-center">Set {i + 1}</p>
                <div className="flex items-center justify-center gap-3">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => {
                      const newState = { ...scoreState, sets: [...scoreState.sets] };
                      newState.sets[i] = { ...newState.sets[i], home: Math.max(0, newState.sets[i].home - 1) };
                      setScoreState(newState);
                    }}>−</Button>
                    <span className="w-8 text-center font-bold">{set.home}</span>
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => {
                      const newState = { ...scoreState, sets: [...scoreState.sets] };
                      newState.sets[i] = { ...newState.sets[i], home: newState.sets[i].home + 1 };
                      setScoreState(newState);
                    }}>+</Button>
                  </div>
                  <span className="text-muted-foreground text-sm">-</span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => {
                      const newState = { ...scoreState, sets: [...scoreState.sets] };
                      newState.sets[i] = { ...newState.sets[i], away: Math.max(0, newState.sets[i].away - 1) };
                      setScoreState(newState);
                    }}>−</Button>
                    <span className="w-8 text-center font-bold">{set.away}</span>
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => {
                      const newState = { ...scoreState, sets: [...scoreState.sets] };
                      newState.sets[i] = { ...newState.sets[i], away: newState.sets[i].away + 1 };
                      setScoreState(newState);
                    }}>+</Button>
                  </div>
                </div>
              </div>
            ))}
            {/* Sets won summary */}
            <div className="border-t border-muted pt-3 text-center text-sm">
              Sets: <span className="font-bold">{(scoreState.sets || []).filter((s: any) => s.home > s.away).length}</span>
              {' - '}
              <span className="font-bold">{(scoreState.sets || []).filter((s: any) => s.away > s.home).length}</span>
            </div>
          </div>
        );

      case 'dodgeball':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">Tap winner of each round</p>
            {(scoreState.rounds || []).map((round: any, i: number) => (
              <div key={i} className="flex items-center justify-center gap-3">
                <span className="text-xs text-muted-foreground w-12">Rd {i + 1}</span>
                <button
                  onClick={() => {
                    const newState = { ...scoreState, rounds: [...scoreState.rounds] };
                    newState.rounds[i] = { winner: round.winner === 'home' ? null : 'home' };
                    setScoreState(newState);
                  }}
                  className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors ${
                    round.winner === 'home'
                      ? 'bg-green-500/20 border-green-500 border text-green-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {homeTeamName}
                </button>
                <button
                  onClick={() => {
                    const newState = { ...scoreState, rounds: [...scoreState.rounds] };
                    newState.rounds[i] = { winner: round.winner === 'away' ? null : 'away' };
                    setScoreState(newState);
                  }}
                  className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors ${
                    round.winner === 'away'
                      ? 'bg-green-500/20 border-green-500 border text-green-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {awayTeamName}
                </button>
              </div>
            ))}
            {/* Rounds won summary */}
            <div className="border-t border-muted pt-3 text-center text-sm">
              Rounds: <span className="font-bold">{(scoreState.rounds || []).filter((r: any) => r.winner === 'home').length}</span>
              {' - '}
              <span className="font-bold">{(scoreState.rounds || []).filter((r: any) => r.winner === 'away').length}</span>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const totals = calculateTotals(score?.score_details || {});

  return (
    <Card className={`${match.status === 'completed' ? 'opacity-80' : ''}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          {/* Home team */}
          <div className="flex-1 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: homeTeamColor }} />
            <span className={`text-sm truncate ${match.winner_team_id === match.home_team_id ? 'font-bold' : ''}`}>
              {homeTeamName}
            </span>
          </div>

          {/* Score */}
          <div className="flex items-center gap-2 px-3">
            {match.status === 'completed' || score ? (
              <span className="font-bold text-lg">
                {score?.home_score ?? totals.home} - {score?.away_score ?? totals.away}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">vs</span>
            )}
          </div>

          {/* Away team */}
          <div className="flex-1 flex items-center justify-end gap-2">
            <span className={`text-sm truncate ${match.winner_team_id === match.away_team_id ? 'font-bold' : ''}`}>
              {awayTeamName}
            </span>
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: awayTeamColor }} />
          </div>
        </div>

        {/* Match info & actions */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1">
            {match.court && (
              <Badge variant="outline" className="text-xs">Ct {match.court}</Badge>
            )}
            {match.status === 'completed' && (
              <Badge className="text-xs bg-green-500/20 text-green-400">✓</Badge>
            )}
            {match.is_draw && (
              <Badge className="text-xs bg-yellow-500/20 text-yellow-400">Draw</Badge>
            )}
          </div>

          {isAdmin && (
            <Dialog open={showScoring} onOpenChange={(open) => {
              if (open) setScoreState(initScoreState());
              setShowScoring(open);
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs h-7">
                  {match.status === 'completed' ? 'Edit' : 'Record'}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-base">
                    {homeTeamName} vs {awayTeamName}
                  </DialogTitle>
                </DialogHeader>
                {renderScoringUI()}
                <Button
                  onClick={saveScore}
                  className="w-full h-12 mt-4"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : '✓ Save Result'}
                </Button>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}