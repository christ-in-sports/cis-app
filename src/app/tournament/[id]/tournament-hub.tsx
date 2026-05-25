'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { generateLeagueFixturesForSport } from '@/lib/fixtures';
import MatchCard from './match-card';
import StandingsTable from './standings-table';
import KnockoutBracket from './knockout-bracket';

interface Tournament {
  id: string;
  name: string;
  status: string;
  team_count: number;
  current_sport: string | null;
  share_code: string;
}

interface Team {
  id: string;
  name: string;
  color: string;
  seed: number;
}

interface Sport {
  id: string;
  sport_type: string;
  play_mode: string;
  status: string;
  settings: any;
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
  id: string;
  sport_id: string;
  team_id: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  scored: number;
  conceded: number;
  difference: number;
  position: number | null;
}

const SPORT_TABS = [
  { key: 'soccer', label: 'Soccer', emoji: '⚽' },
  { key: 'basketball', label: 'Basketball', emoji: '🏀' },
  { key: 'volleyball', label: 'Volleyball', emoji: '🏐' },
  { key: 'dodgeball', label: 'Dodgeball', emoji: '🤾' },
];

export default function TournamentHub({
  tournament,
  teams,
  sports,
  matches: initialMatches,
  scores: initialScores,
  standings: initialStandings,
  isAdmin,
  userId,
}: {
  tournament: Tournament;
  teams: Team[];
  sports: Sport[];
  matches: Match[];
  scores: Score[];
  standings: Standing[];
  isAdmin: boolean;
  userId: string | null;
}) {
  const [activeSport, setActiveSport] = useState(tournament.current_sport || 'soccer');
  const [activeTab, setActiveTab] = useState<'matches' | 'standings' | 'bracket'>('matches');
  const [matches, setMatches] = useState(initialMatches);
  const [scores, setScores] = useState(initialScores);
  const [standings, setStandings] = useState(initialStandings);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const currentSport = sports.find((s) => s.sport_type === activeSport);
  const sportMatches = matches.filter((m) => m.sport_id === currentSport?.id);
  const leagueMatches = sportMatches.filter((m) => m.match_type === 'league');
  const sportStandings = standings
    .filter((s) => s.sport_id === currentSport?.id)
    .sort((a, b) => (a.position || 99) - (b.position || 99));

  // Real-time subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('tournament-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournament.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMatches((prev) => [...prev, payload.new as Match]);
        } else if (payload.eventType === 'UPDATE') {
          setMatches((prev) => prev.map((m) => (m.id === (payload.new as Match).id ? (payload.new as Match) : m)));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_scores', filter: `match_id=in.(${matches.map(m => m.id).join(',')})` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setScores((prev) => [...prev, payload.new as Score]);
        } else if (payload.eventType === 'UPDATE') {
          setScores((prev) => prev.map((s) => (s.id === (payload.new as Score).id ? (payload.new as Score) : s)));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'standings' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setStandings((prev) => [...prev, payload.new as Standing]);
        } else if (payload.eventType === 'UPDATE') {
          setStandings((prev) => prev.map((s) => (s.id === (payload.new as Standing).id ? (payload.new as Standing) : s)));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournament.id, matches]);

  // Generate league fixtures
  const generateLeagueFixtures = async () => {
    if (!currentSport) return;

    if (leagueMatches.length > 0) {
      toast({ title: 'Fixtures already exist', description: 'Delete existing fixtures first', variant: 'destructive' });
      return;
    }

    setLoading(true);

    const teamIds = teams.map((t) => t.id);
    const { groupA, groupB, fixtures } = generateLeagueFixturesForSport(teamIds, currentSport.play_mode);

    // Insert matches
    const matchInserts = fixtures.map((f) => ({
      sport_id: currentSport.id,
      tournament_id: tournament.id,
      home_team_id: f.home,
      away_team_id: f.away,
      match_type: 'league' as const,
      round: f.round,
      bracket: f.group ? (f.group === 'A' ? 'top' : 'bottom') : null, // Group A = top, Group B = bottom
      status: 'scheduled' as const,
    }));

    const { data: newMatches, error } = await supabase
      .from('matches')
      .insert(matchInserts)
      .select();

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Initialize standings for all teams
    const standingInserts = teamIds.map((teamId) => ({
      sport_id: currentSport.id,
      team_id: teamId,
    }));

    await supabase.from('standings').insert(standingInserts);

    // Save group info in sport settings if groups were used
    if (groupA && groupB) {
      await supabase
        .from('sports')
        .update({
          status: 'league_phase',
          settings: {
            ...currentSport.settings,
            groups: { A: groupA, B: groupB },
          },
        })
        .eq('id', currentSport.id);
    } else {
      await supabase
        .from('sports')
        .update({ status: 'league_phase' })
        .eq('id', currentSport.id);
    }

    toast({
      title: 'Fixtures generated!',
      description: groupA
        ? `2 groups of 4 — ${fixtures.length} matches (3 per team)`
        : `${fixtures.length} matches created`,
    });
    router.refresh();
    setLoading(false);
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

  // Group matches by round
  const matchesByRound: Record<number, Match[]> = {};
  leagueMatches.forEach((m) => {
    const round = m.round || 0;
    if (!matchesByRound[round]) matchesByRound[round] = [];
    matchesByRound[round].push(m);
  });

  // Check if this sport uses groups (8 teams + league_tournament)
  const hasGroups = currentSport?.settings?.groups != null;
  const groups = currentSport?.settings?.groups || { A: [], B: [] };

  // Group A matches (bracket = 'top')
  const groupAMatches = leagueMatches.filter((m) => m.bracket === 'top');
  const groupBMatches = leagueMatches.filter((m) => m.bracket === 'bottom');

  const groupAMatchesByRound: Record<number, Match[]> = {};
  groupAMatches.forEach((m) => {
    const round = m.round || 0;
    if (!groupAMatchesByRound[round]) groupAMatchesByRound[round] = [];
    groupAMatchesByRound[round].push(m);
  });

  const groupBMatchesByRound: Record<number, Match[]> = {};
  groupBMatches.forEach((m) => {
    const round = m.round || 0;
    if (!groupBMatchesByRound[round]) groupBMatchesByRound[round] = [];
    groupBMatchesByRound[round].push(m);
  });

  const hasFixtures = leagueMatches.length > 0;

  return (
    <div className="min-h-screen pb-32 safe-top safe-bottom">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-muted p-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-bold">{tournament.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-xs">Code: {tournament.share_code}</Badge>
                {isAdmin && <Badge className="text-xs bg-green-500/20 text-green-400">Admin</Badge>}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => router.push(`/tournament/${tournament.id}/schedule`)}
                >
                  📅
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => router.push(`/tournament/${tournament.id}/overall`)}
                >
                  🏆
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => router.push(`/tournament/${tournament.id}/members`)}
                >
                  👥
                </Button>
          </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
              ←
            </Button>
          </div>

          {/* Sport Tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
            {SPORT_TABS.map((sport) => (
              <button
                key={sport.key}
                onClick={() => setActiveSport(sport.key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  activeSport === sport.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <span>{sport.emoji}</span>
                <span>{sport.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto p-4">
        {/* Sub tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('matches')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'matches' ? 'bg-muted text-foreground' : 'text-muted-foreground'
            }`}
          >
            Matches
          </button>
          <button
            onClick={() => setActiveTab('standings')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'standings' ? 'bg-muted text-foreground' : 'text-muted-foreground'
            }`}
          >
            Standings
          </button>
          {currentSport?.play_mode !== 'league' && (
            <button
              onClick={() => setActiveTab('bracket')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'bracket' ? 'bg-muted text-foreground' : 'text-muted-foreground'
              }`}
            >
              Bracket
            </button>
          )}
        </div>

        {activeTab === 'matches' && (
          <>
            {!hasFixtures && isAdmin && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-muted-foreground mb-2">No fixtures yet for {activeSport}</p>
                  {tournament.team_count === 8 && currentSport?.play_mode === 'league_tournament' && (
                    <p className="text-xs text-muted-foreground mb-4">
                      Teams will be randomly split into 2 groups of 4
                    </p>
                  )}
                  <Button onClick={generateLeagueFixtures} disabled={loading}>
                    {loading ? 'Generating...' : '⚡ Generate League Fixtures'}
                  </Button>
                </CardContent>
              </Card>
            )}

            {!hasFixtures && !isAdmin && (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                  Waiting for admin to generate fixtures...
                </CardContent>
              </Card>
            )}

            {hasFixtures && hasGroups && (
              <>
                {/* Group A */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-xs">A</span>
                    Group A
                  </h3>
                  {Object.entries(groupAMatchesByRound)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([round, roundMatches]) => (
                      <div key={`a-${round}`} className="mb-4">
                        <p className="text-xs text-muted-foreground mb-2">Round {round}</p>
                        <div className="space-y-2">
                          {roundMatches.map((match) => (
                            <MatchCard
                              key={match.id}
                              match={match}
                              score={getMatchScore(match.id)}
                              homeTeamName={getTeamName(match.home_team_id)}
                              awayTeamName={getTeamName(match.away_team_id)}
                              homeTeamColor={getTeamColor(match.home_team_id)}
                              awayTeamColor={getTeamColor(match.away_team_id)}
                              sportType={activeSport}
                              sportSettings={currentSport?.settings || {}}
                              isAdmin={isAdmin}
                              onUpdate={() => router.refresh()}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>

                {/* Group B */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-xs">B</span>
                    Group B
                  </h3>
                  {Object.entries(groupBMatchesByRound)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([round, roundMatches]) => (
                      <div key={`b-${round}`} className="mb-4">
                        <p className="text-xs text-muted-foreground mb-2">Round {round}</p>
                        <div className="space-y-2">
                          {roundMatches.map((match) => (
                            <MatchCard
                              key={match.id}
                              match={match}
                              score={getMatchScore(match.id)}
                              homeTeamName={getTeamName(match.home_team_id)}
                              awayTeamName={getTeamName(match.away_team_id)}
                              homeTeamColor={getTeamColor(match.home_team_id)}
                              awayTeamColor={getTeamColor(match.away_team_id)}
                              sportType={activeSport}
                              sportSettings={currentSport?.settings || {}}
                              isAdmin={isAdmin}
                              onUpdate={() => router.refresh()}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}

            {hasFixtures && !hasGroups && Object.entries(matchesByRound)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([round, roundMatches]) => (
                <div key={round} className="mb-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Round {round}
                  </h3>
                  <div className="space-y-2">
                    {roundMatches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        score={getMatchScore(match.id)}
                        homeTeamName={getTeamName(match.home_team_id)}
                        awayTeamName={getTeamName(match.away_team_id)}
                        homeTeamColor={getTeamColor(match.home_team_id)}
                        awayTeamColor={getTeamColor(match.away_team_id)}
                        sportType={activeSport}
                        sportSettings={currentSport?.settings || {}}
                        isAdmin={isAdmin}
                        onUpdate={() => router.refresh()}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </>
        )}

        {activeTab === 'standings' && (
          <>
            {hasGroups ? (
              <div className="space-y-6">
                {/* Group A standings */}
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-xs">A</span>
                    Group A
                  </h3>
                  <StandingsTable
                    standings={sportStandings.filter((s) => groups.A?.includes(s.team_id))}
                    teams={teams}
                    sportType={activeSport}
                  />
                </div>
                {/* Group B standings */}
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-xs">B</span>
                    Group B
                  </h3>
                  <StandingsTable
                    standings={sportStandings.filter((s) => groups.B?.includes(s.team_id))}
                    teams={teams}
                    sportType={activeSport}
                  />
                </div>
              </div>
            ) : (
              <StandingsTable
                standings={sportStandings}
                teams={teams}
                sportType={activeSport}
              />
            )}
          </>
        )}

        {activeTab === 'bracket' && currentSport && (
          <KnockoutBracket
            tournament={tournament}
            currentSport={currentSport}
            teams={teams}
            matches={matches}
            scores={scores}
            standings={standings}
            isAdmin={isAdmin}
          />
        )}

        {/* Admin Controls */}
        {isAdmin && currentSport && (
          <Card className="mt-6 border-muted">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">⚙️ Admin Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Mark sport complete */}
              {currentSport.status !== 'completed' && (
                <Button
                  variant="outline"
                  className="w-full h-12 text-sm"
                  onClick={async () => {
                    const confirmed = window.confirm(`Mark ${activeSport} as complete? This finalizes all results.`);
                    if (!confirmed) return;
                    await supabase.from('sports').update({ status: 'completed' }).eq('id', currentSport.id);
                    router.refresh();
                  }}
                >
                  ✅ Mark {activeSport} as Complete
                </Button>
              )}

              {currentSport.status === 'completed' && (
                <div className="text-center py-2 text-green-400 text-sm font-medium">
                  ✅ {activeSport} is complete!
                </div>
              )}

              {/* Reset fixtures */}
              <Button
                variant="ghost"
                className="w-full h-12 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={async () => {
                  const confirmed = window.confirm(
                    `⚠️ Delete ALL ${activeSport} matches, scores, and standings? This cannot be undone.`
                  );
                  if (!confirmed) return;
                  const confirmed2 = window.confirm('Are you really sure? Everything will be wiped.');
                  if (!confirmed2) return;

                  // Delete matches for this sport
                  await supabase.from('matches').delete().eq('sport_id', currentSport.id);
                  // Delete standings
                  await supabase.from('standings').delete().eq('sport_id', currentSport.id);
                  // Reset sport status
                  await supabase.from('sports').update({ 
                    status: 'pending',
                    settings: { ...currentSport.settings, groups: undefined }
                  }).eq('id', currentSport.id);

                  router.refresh();
                }}
              >
                🗑️ Reset All {activeSport} Fixtures
              </Button>

              {/* Mark entire tournament complete */}
              {sports.every((s) => s.status === 'completed') && tournament.status !== 'completed' && (
                <Button
                  className="w-full h-12 text-sm bg-yellow-500 hover:bg-yellow-600 text-black"
                  onClick={async () => {
                    const confirmed = window.confirm('Mark the entire tournament as COMPLETE? 🏆');
                    if (!confirmed) return;
                    await supabase.from('tournaments').update({ status: 'completed' }).eq('id', tournament.id);
                    router.refresh();
                  }}
                >
                  🏆 Finalize Tournament
                </Button>
              )}
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}