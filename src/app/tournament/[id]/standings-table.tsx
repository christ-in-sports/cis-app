'use client';

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

interface Team {
  id: string;
  name: string;
  color: string;
}

export default function StandingsTable({
  standings,
  teams,
  sportType,
}: {
  standings: Standing[];
  teams: Team[];
  sportType: string;
}) {
  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  const diffLabel = () => {
    switch (sportType) {
      case 'soccer': return 'GD';
      case 'basketball': return 'PD';
      case 'volleyball': return 'SD';
      case 'dodgeball': return 'RD';
      default: return 'D';
    }
  };

  const scoredLabel = () => {
    switch (sportType) {
      case 'soccer': return 'GF';
      case 'basketball': return 'PF';
      case 'volleyball': return 'SW';
      case 'dodgeball': return 'RW';
      default: return 'F';
    }
  };

  if (standings.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Standings will appear once fixtures are generated
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-muted">
            <th className="text-left py-2 pr-2">#</th>
            <th className="text-left py-2">Team</th>
            <th className="text-center py-2 px-1">P</th>
            <th className="text-center py-2 px-1">W</th>
            <th className="text-center py-2 px-1">D</th>
            <th className="text-center py-2 px-1">L</th>
            <th className="text-center py-2 px-1">{scoredLabel()}</th>
            <th className="text-center py-2 px-1">{diffLabel()}</th>
            <th className="text-center py-2 px-1 font-bold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => {
            const team = getTeam(s.team_id);
            return (
              <tr key={s.id} className="border-b border-muted/50">
                <td className="py-2.5 pr-2 text-muted-foreground">{s.position || i + 1}</td>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: team?.color || '#666' }}
                    />
                    <span className="truncate max-w-[120px]">{team?.name || 'Unknown'}</span>
                  </div>
                </td>
                <td className="text-center py-2.5 text-muted-foreground">{s.played}</td>
                <td className="text-center py-2.5">{s.won}</td>
                <td className="text-center py-2.5">{s.drawn}</td>
                <td className="text-center py-2.5">{s.lost}</td>
                <td className="text-center py-2.5">{s.scored}</td>
                <td className="text-center py-2.5">
                  <span className={s.difference > 0 ? 'text-green-400' : s.difference < 0 ? 'text-red-400' : ''}>
                    {s.difference > 0 ? '+' : ''}{s.difference}
                  </span>
                </td>
                <td className="text-center py-2.5 font-bold">{s.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}