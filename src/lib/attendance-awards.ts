import type { MinistryTeam, RosterKid, SummaryRow } from './attendance';

/** Include the whole registered roster, even kids with no attendance records. */
export function awardsRoster(kids: RosterKid[], teams: MinistryTeam[], summary: SummaryRow[], archived = false): SummaryRow[] {
  const totals = new Map(summary.map((row) => [row.registration_id, row]));
  const names = new Map(teams.map((team) => [team.id, team.name]));
  return kids.map((kid) => ({
    eligible: 0, present: 0, late: 0, absent: 0, excused: 0, unmarked: 0, attended: 0, pct: 0,
    ...totals.get(kid.id),
    registration_id: kid.id, first_name: kid.first_name, last_name: kid.last_name,
    grade: kid.grade, division: kid.division,
    team_id: archived && totals.has(kid.id) ? totals.get(kid.id)!.team_id : kid.team_id,
    team_name: archived && totals.has(kid.id) ? totals.get(kid.id)!.team_name : kid.team_id ? names.get(kid.team_id) ?? 'Team' : null,
  }));
}

/** Competition ranks by days attended, within each division. Ties share rank. */
export function attendanceRanks(rows: SummaryRow[]): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const division of ['juniors', 'ambassadors']) {
    const sorted = rows.filter((row) => row.division === division && row.eligible > row.unmarked)
      .sort((a, b) => b.attended - a.attended);
    let rank = 0;
    sorted.forEach((row, index) => {
      if (index === 0 || row.attended !== sorted[index - 1].attended) rank = index + 1;
      ranks.set(row.registration_id, rank);
    });
  }
  return ranks;
}

export function sortAttendance(rows: SummaryRow[], sort: string): SummaryRow[] {
  const name = (a: SummaryRow, b: SummaryRow) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name) || a.registration_id.localeCompare(b.registration_id);
  return [...rows].sort((a, b) => {
    if (sort === 'team') return (a.team_name ?? 'No team').localeCompare(b.team_name ?? 'No team') || name(a, b);
    if (sort === 'name') return name(a, b);
    if (sort === 'percent') return b.pct - a.pct || b.attended - a.attended || name(a, b);
    return b.attended - a.attended || name(a, b);
  });
}
