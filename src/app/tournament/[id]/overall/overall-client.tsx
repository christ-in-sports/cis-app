'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Tournament {
  id: string;
  name: string;
  team_count: number;
  status: string;
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

interface Match {
  id: string;
  sport_id: string;
  match_type: string;
  status: string;
  winner_team_id: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  round: number | null;
  bracket: string | null;
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
  position: number | null;
  points: number;
}

const SPORTS = [
  { key: 'soccer', label: 'Soccer', emoji: '⚽' },
  { key: 'basketball', label: 'Basketball', emoji: '🏀' },
  { key: 'volleyball', label: 'Volleyball', emoji: '🏐' },
  { key: 'dodgeball', label: 'Dodgeball', emoji: '🤾' },
];

export default function OverallClient({
  tournament,
  teams,
  sports,
  matches,
  scores,
  standings,
  isAdmin,
}: {
  tournament: Tournament;
  teams: Team[];
  sports: Sport[];
  matches: Match[];
  scores: Score[];
  standings: Standing[];
  isAdmin: boolean;
}) {
  const router = useRouter();

  const teamCount = teams.length;

  const getTeamPositionInSport = (teamId: string, sport: Sport): number | null => {
    const sportMatches = matches.filter((m) => m.sport_id === sport.id);
    const sportStandings = standings.filter((s) => s.sport_id === sport.id);

    if (sport.play_mode === 'league') {
      const standing = sportStandings.find((s) => s.team_id === teamId);
      return standing?.position || null;
    }

    const knockoutMatches = sportMatches.filter(
      (m) => m.match_type !== 'league' && m.match_type !== 'spiritual'
    );

    if (knockoutMatches.length === 0) {
      const standing = sportStandings.find((s) => s.team_id === teamId);
      return standing?.position || null;
    }

    const completedKnockouts = knockoutMatches.filter((m) => m.status === 'completed');
    if (completedKnockouts.length === 0) {
      const standing = sportStandings.find((s) => s.team_id === teamId);
      return standing?.position || null;
    }

    const topBracketMatches = knockoutMatches.filter(
      (m) => m.bracket === 'top' || m.bracket === 'main'
    );
    const bottomBracketMatches = knockoutMatches.filter(
      (m) => m.bracket === 'bottom'
    );

    const positions: Record<string, number> = {};

    // Top/main bracket final
    const topKnockouts = topBracketMatches.filter((m) => m.match_type === 'knockout');
    if (topKnockouts.length > 0) {
      const maxRound = Math.max(...topKnockouts.map((m) => m.round || 0));
      const topFinal = topKnockouts.find((m) => m.round === maxRound);
      if (topFinal?.status === 'completed' && topFinal.winner_team_id) {
        positions[topFinal.winner_team_id] = 1;
        const loser = topFinal.home_team_id === topFinal.winner_team_id ? topFinal.away_team_id : topFinal.home_team_id;
        if (loser) positions[loser] = 2;
      }
    }

    // 3rd place match
    const thirdPlace = topBracketMatches.find((m) => m.match_type === 'third_place');
    if (thirdPlace?.status === 'completed' && thirdPlace.winner_team_id) {
      positions[thirdPlace.winner_team_id] = 3;
      const loser = thirdPlace.home_team_id === thirdPlace.winner_team_id ? thirdPlace.away_team_id : thirdPlace.home_team_id;
      if (loser) positions[loser] = 4;
    }

    // Bottom bracket
    if (bottomBracketMatches.length > 0) {
      const bottomKnockouts = bottomBracketMatches.filter((m) => m.match_type === 'knockout');
      if (bottomKnockouts.length > 0) {
        const maxRound = Math.max(...bottomKnockouts.map((m) => m.round || 0));
        const bottomFinal = bottomKnockouts.find((m) => m.round === maxRound);
        if (bottomFinal?.status === 'completed' && bottomFinal.winner_team_id) {
          positions[bottomFinal.winner_team_id] = 5;
          const loser = bottomFinal.home_team_id === bottomFinal.winner_team_id ? bottomFinal.away_team_id : bottomFinal.home_team_id;
          if (loser) positions[loser] = 6;
        }
      }

      const fifthPlace = bottomBracketMatches.find((m) => m.match_type === 'fifth_place');
      if (fifthPlace?.status === 'completed' && fifthPlace.winner_team_id) {
        positions[fifthPlace.winner_team_id] = 7;
        const loser = fifthPlace.home_team_id === fifthPlace.winner_team_id ? fifthPlace.away_team_id : fifthPlace.home_team_id;
        if (loser) positions[loser] = 8;
      }
    }

    return positions[teamId] || null;
  };

  const positionToPoints = (position: number | null): number => {
    if (position === null) return 0;
    return Math.max(0, teamCount - position + 1);
  };

  // Build overall standings
  const overallData = teams.map((team) => {
    const sportResults: Record<string, { position: number | null; points: number }> = {};
    let totalPoints = 0;
    let sportsCompleted = 0;

    SPORTS.forEach((s) => {
      const sport = sports.find((sp) => sp.sport_type === s.key);
      if (!sport) {
        sportResults[s.key] = { position: null, points: 0 };
        return;
      }

      const position = getTeamPositionInSport(team.id, sport);
      const points = positionToPoints(position);
      sportResults[s.key] = { position, points };
      totalPoints += points;
      if (position !== null) sportsCompleted++;
    });

    return {
      team,
      sportResults,
      totalPoints,
      sportsCompleted,
    };
  }).sort((a, b) => b.totalPoints - a.totalPoints);

  const getPositionLabel = (pos: number | null) => {
    if (pos === null) return '—';
    switch (pos) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `${pos}th`;
    }
  };

  const maxPoints = teamCount * 4;

  return (
    <div className="min-h-screen pb-32 safe-top safe-bottom">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur border-b border-muted p-4">
        <div className="max-w-2xl mx-auto">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/tournament/${tournament.id}`)}>
            ← Back
          </Button>
          <h1 className="text-xl font-bold mt-1">🏆 Overall Standings</h1>
          <p className="text-sm text-muted-foreground">{tournament.name} • Each sport = {positionToPoints(1)} max pts</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {/* Podium (top 3) */}
        {overallData.length >= 3 && overallData[0].totalPoints > 0 && (
          <div className="flex items-end justify-center gap-3 mb-8 pt-4">
            {/* 2nd place */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full border-4 border-gray-400 flex items-center justify-center mb-2" style={{ backgroundColor: overallData[1].team.color + '30' }}>
                <span className="text-2xl">🥈</span>
              </div>
              <span className="text-sm font-medium text-center max-w-[70px] truncate">{overallData[1].team.name}</span>
              <span className="text-lg font-bold">{overallData[1].totalPoints}</span>
              <div className="w-20 bg-gray-400/20 rounded-t-lg mt-1" style={{ height: '60px' }} />
            </div>
            {/* 1st place */}
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-full border-4 border-yellow-400 flex items-center justify-center mb-2" style={{ backgroundColor: overallData[0].team.color + '30' }}>
                <span className="text-3xl">🥇</span>
              </div>
              <span className="text-sm font-bold text-center max-w-[80px] truncate">{overallData[0].team.name}</span>
              <span className="text-xl font-bold">{overallData[0].totalPoints}</span>
              <div className="w-20 bg-yellow-400/20 rounded-t-lg mt-1" style={{ height: '90px' }} />
            </div>
            {/* 3rd place */}
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-full border-4 border-orange-600 flex items-center justify-center mb-2" style={{ backgroundColor: overallData[2].team.color + '30' }}>
                <span className="text-xl">🥉</span>
              </div>
              <span className="text-sm font-medium text-center max-w-[70px] truncate">{overallData[2].team.name}</span>
              <span className="text-lg font-bold">{overallData[2].totalPoints}</span>
              <div className="w-20 bg-orange-600/20 rounded-t-lg mt-1" style={{ height: '40px' }} />
            </div>
          </div>
        )}

        {/* Full Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Rankings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Table Header */}
            <div className="grid grid-cols-[40px_1fr_40px_40px_40px_40px_50px] gap-1 px-4 py-2 border-b border-muted text-xs text-muted-foreground font-medium">
              <span>#</span>
              <span>Team</span>
              <span className="text-center">⚽</span>
              <span className="text-center">🏀</span>
              <span className="text-center">🏐</span>
              <span className="text-center">🤾</span>
              <span className="text-center font-bold">Total</span>
            </div>

            {/* Rows */}
            {overallData.map((item, i) => (
              <div
                key={item.team.id}
                className={`grid grid-cols-[40px_1fr_40px_40px_40px_40px_50px] gap-1 px-4 py-3 border-b border-muted/30 items-center ${
                  i < 3 ? 'bg-primary/5' : ''
                }`}
              >
                <span className="text-sm font-bold text-muted-foreground">{i + 1}</span>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.team.color }} />
                  <span className="text-sm font-medium truncate">{item.team.name}</span>
                </div>
                <span className="text-center text-sm">
                  {item.sportResults.soccer.position ? getPositionLabel(item.sportResults.soccer.position) : '—'}
                </span>
                <span className="text-center text-sm">
                  {item.sportResults.basketball.position ? getPositionLabel(item.sportResults.basketball.position) : '—'}
                </span>
                <span className="text-center text-sm">
                  {item.sportResults.volleyball.position ? getPositionLabel(item.sportResults.volleyball.position) : '—'}
                </span>
                <span className="text-center text-sm">
                  {item.sportResults.dodgeball.position ? getPositionLabel(item.sportResults.dodgeball.position) : '—'}
                </span>
                <span className="text-center text-sm font-bold">{item.totalPoints}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Points Breakdown */}
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Points System</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 text-xs text-center">
              {Array.from({ length: teamCount }, (_, i) => (
                <div key={i} className="bg-muted rounded-lg p-2">
                  <p className="font-bold">{getPositionLabel(i + 1)}</p>
                  <p className="text-muted-foreground">{positionToPoints(i + 1)} pts</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3">
              Each sport contributes equally (25%). Max possible = {maxPoints} pts
            </p>
          </CardContent>
        </Card>

        {/* Sport Status */}
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sport Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {SPORTS.map((s) => {
                const sport = sports.find((sp) => sp.sport_type === s.key);
                const status = sport?.status || 'pending';
                const statusLabel = status === 'completed' ? '✅ Complete' :
                  status === 'tournament_phase' ? '🏆 Knockout' :
                  status === 'league_phase' ? '⚡ League' : '⏳ Pending';

                return (
                  <div key={s.key} className="flex items-center justify-between py-2">
                    <span className="text-sm">{s.emoji} {s.label}</span>
                    <Badge variant="outline" className="text-xs">{statusLabel}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}