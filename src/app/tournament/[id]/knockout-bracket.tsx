'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  generateKnockout8TeamsGrouped,
  generateKnockout6Teams,
  generateKnockout8TeamsFullLeague,
  generateTournamentOnly,
} from '@/lib/knockout';
import MatchCard from './match-card';

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

interface Standing {
  team_id: string;
  position: number | null;
  sport_id: string;
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
  status: string;
  settings: any;
}

export default function KnockoutBracket({
  tournament,
  currentSport,
  teams,
  matches,
  scores,
  standings,
  isAdmin,
}: {
  tournament: { id: string; team_count: number };
  currentSport: Sport;
  teams: Team[];
  matches: Match[];
  scores: Score[];
  standings: Standing[];
  isAdmin: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const knockoutMatches = matches.filter(
    (m) => m.sport_id === currentSport.id && m.match_type !== 'league' && m.match_type !== 'spiritual'
  );

  const hasKnockout = knockoutMatches.length > 0;
  const leagueComplete = matches
    .filter((m) => m.sport_id === currentSport.id && m.match_type === 'league')
    .every((m) => m.status === 'completed');

  const canGenerateKnockout =
    isAdmin &&
    !hasKnockout &&
    (currentSport.play_mode === 'tournament' || (currentSport.play_mode !== 'league' && leagueComplete));

  const generateKnockoutBracket = async () => {
    setLoading(true);

    let knockoutFixtures;
    const sportStandings = standings
      .filter((s) => s.sport_id === currentSport.id)
      .sort((a, b) => (a.position || 99) - (b.position || 99));

    if (currentSport.play_mode === 'tournament') {
      // Tournament only — no league
      knockoutFixtures = generateTournamentOnly(teams.map((t) => t.id));
    } else if (tournament.team_count === 8 && currentSport.settings?.groups) {
      // 8 teams with groups
      const groups = currentSport.settings.groups;
      const groupAStandings = sportStandings
        .filter((s) => groups.A.includes(s.team_id))
        .map((s) => s.team_id);
      const groupBStandings = sportStandings
        .filter((s) => groups.B.includes(s.team_id))
        .map((s) => s.team_id);

      knockoutFixtures = generateKnockout8TeamsGrouped(groupAStandings, groupBStandings);
    } else if (tournament.team_count === 8) {
      // 8 teams full round-robin
      const sortedTeams = sportStandings.map((s) => s.team_id);
      knockoutFixtures = generateKnockout8TeamsFullLeague(sortedTeams);
    } else if (tournament.team_count === 6) {
      // 6 teams
      const sortedTeams = sportStandings.map((s) => s.team_id);
      knockoutFixtures = generateKnockout6Teams(sortedTeams);
    } else {
      // Generic fallback for other counts
      const sortedTeams = sportStandings.map((s) => s.team_id);
      knockoutFixtures = generateTournamentOnly(sortedTeams);
    }

    if (!knockoutFixtures || knockoutFixtures.length === 0) {
      toast({ title: 'Error', description: 'Could not generate knockout bracket', variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Insert knockout matches
    const inserts = knockoutFixtures.map((f) => ({
      sport_id: currentSport.id,
      tournament_id: tournament.id,
      home_team_id: f.home_team_id,
      away_team_id: f.away_team_id,
      match_type: f.match_type,
      round: f.round,
      bracket: f.bracket,
      status: (f.home_team_id && f.away_team_id) ? 'scheduled' : 'scheduled',
    }));

    const { error } = await supabase.from('matches').insert(inserts);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // Update sport status
      await supabase
        .from('sports')
        .update({ status: 'tournament_phase' })
        .eq('id', currentSport.id);

      toast({ title: 'Knockout bracket generated!' });
      router.refresh();
    }

    setLoading(false);
  };

  // Advance winners after a knockout match is completed
  const handleMatchUpdate = async () => {
    // Fetch fresh knockout matches from DB (not stale state)
    const { data: freshMatches } = await supabase
      .from('matches')
      .select('*')
      .eq('sport_id', currentSport.id)
      .eq('tournament_id', tournament.id)
      .neq('match_type', 'league')
      .neq('match_type', 'spiritual');

    if (!freshMatches) {
      router.refresh();
      return;
    }

    // Find completed matches whose winners haven't been advanced yet
    for (const completed of freshMatches) {
      if (completed.status !== 'completed' || !completed.winner_team_id) continue;

      const winnerId = completed.winner_team_id;
      const loserId = completed.home_team_id === winnerId
        ? completed.away_team_id
        : completed.home_team_id;

      const round = completed.round || 1;
      const bracket = completed.bracket;

      // Find next round knockout match in same bracket
      const nextKnockout = freshMatches.find(
        (m) =>
          m.round === round + 1 &&
          m.bracket === bracket &&
          m.match_type === 'knockout' &&
          (m.home_team_id === null || m.away_team_id === null)
      );

      // Check if winner is already placed somewhere in next round
      const alreadyAdvanced = freshMatches.some(
        (m) =>
          m.round === round + 1 &&
          m.bracket === bracket &&
          (m.home_team_id === winnerId || m.away_team_id === winnerId)
      );

      if (!alreadyAdvanced && nextKnockout) {
        const update: any = {};
        if (nextKnockout.home_team_id === null) {
          update.home_team_id = winnerId;
        } else {
          update.away_team_id = winnerId;
        }
        await supabase.from('matches').update(update).eq('id', nextKnockout.id);
      }

      // Place loser in 3rd/5th/7th place match
      const placementMatch = freshMatches.find(
        (m) =>
          m.round === round + 1 &&
          m.bracket === bracket &&
          (m.match_type === 'third_place' || m.match_type === 'fifth_place') &&
          (m.home_team_id === null || m.away_team_id === null)
      );

      const loserAlreadyPlaced = freshMatches.some(
        (m) =>
          m.round === round + 1 &&
          m.bracket === bracket &&
          (m.match_type === 'third_place' || m.match_type === 'fifth_place') &&
          (m.home_team_id === loserId || m.away_team_id === loserId)
      );

      if (!loserAlreadyPlaced && placementMatch && loserId) {
        const update: any = {};
        if (placementMatch.home_team_id === null) {
          update.home_team_id = loserId;
        } else {
          update.away_team_id = loserId;
        }
        await supabase.from('matches').update(update).eq('id', placementMatch.id);
      }
    }

    router.refresh();
  };

  const getTeamName = (teamId: string | null) => {
    if (!teamId) return 'TBD';
    return teams.find((t) => t.id === teamId)?.name || 'Unknown';
  };

  const getTeamColor = (teamId: string | null) => {
    if (!teamId) return '#666';
    return teams.find((t) => t.id === teamId)?.color || '#666';
  };

  const getMatchScore = (matchId: string) => {
    return scores.find((s) => s.match_id === matchId);
  };

  // Group knockout matches by bracket and round
  const topBracket = knockoutMatches.filter((m) => m.bracket === 'top');
  const bottomBracket = knockoutMatches.filter((m) => m.bracket === 'bottom');
  const mainBracket = knockoutMatches.filter((m) => m.bracket === 'main');

  const renderBracketSection = (bracketMatches: Match[], title: string, subtitle: string) => {
    const byRound: Record<number, Match[]> = {};
    bracketMatches.forEach((m) => {
      const round = m.round || 0;
      if (!byRound[round]) byRound[round] = [];
      byRound[round].push(m);
    });

    return (
      <div className="mb-6">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {Object.entries(byRound)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([round, roundMatches]) => (
            <div key={round} className="mb-4">
              <p className="text-xs text-muted-foreground mb-2">
                {roundMatches[0]?.match_type === 'third_place'
                  ? ''
                  : roundMatches[0]?.match_type === 'fifth_place'
                  ? ''
                  : `Round ${round}`}
              </p>
              <div className="space-y-2">
                {roundMatches.map((match) => (
                  <div key={match.id}>
                    {/* Match label */}
                    <p className="text-xs text-primary mb-1">
                      {getMatchLabel(match)}
                    </p>
                    <MatchCard
                      match={match}
                      score={getMatchScore(match.id)}
                      homeTeamName={getTeamName(match.home_team_id)}
                      awayTeamName={getTeamName(match.away_team_id)}
                      homeTeamColor={getTeamColor(match.home_team_id)}
                      awayTeamColor={getTeamColor(match.away_team_id)}
                      sportType={currentSport.sport_type}
                      sportSettings={currentSport.settings || {}}
                      isAdmin={isAdmin && match.home_team_id !== null && match.away_team_id !== null}
                      onUpdate={handleMatchUpdate}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    );
  };

  const getMatchLabel = (match: Match): string => {
    if (match.match_type === 'third_place') return '🥉 3rd Place';
    if (match.match_type === 'fifth_place') return '5th Place';

    const round = match.round || 1;
    const totalKnockoutInBracket = knockoutMatches.filter(
      (m) => m.bracket === match.bracket && m.match_type === 'knockout'
    );
    const maxRound = Math.max(...totalKnockoutInBracket.map((m) => m.round || 1));

    if (round === maxRound) return '🏆 Final';
    if (round === maxRound - 1) return 'Semi-Final';
    return 'Quarter-Final';
  };

  return (
    <div>
      {/* Generate button */}
      {canGenerateKnockout && (
        <Card className="border-dashed mb-4">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            {currentSport.play_mode !== 'tournament' && !leagueComplete && (
              <p className="text-muted-foreground mb-4">
                Complete all league matches first to generate the knockout bracket
              </p>
            )}
            {(currentSport.play_mode === 'tournament' || leagueComplete) && (
              <>
                <p className="text-muted-foreground mb-4">
                  {currentSport.play_mode === 'tournament'
                    ? 'Ready to generate the bracket!'
                    : 'League phase complete! Generate knockout bracket based on standings.'}
                </p>
                <Button onClick={generateKnockoutBracket} disabled={loading}>
                  {loading ? 'Generating...' : '🏆 Generate Knockout Bracket'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!canGenerateKnockout && !hasKnockout && !isAdmin && currentSport.play_mode !== 'league' && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            {leagueComplete
              ? 'Waiting for admin to generate knockout bracket...'
              : 'Knockout bracket will be available after league phase completes'}
          </CardContent>
        </Card>
      )}

      {/* Render brackets */}
      {hasKnockout && (
        <>
          {mainBracket.length > 0 && renderBracketSection(mainBracket, '🏆 Knockout Bracket', 'Single elimination')}
          {topBracket.length > 0 && renderBracketSection(topBracket, '🏆 Top Bracket (1st-4th)', 'Championship bracket')}
          {bottomBracket.length > 0 && renderBracketSection(bottomBracket, '📋 Bottom Bracket (5th-8th)', 'Placement bracket')}
        </>
      )}
    </div>
  );
}