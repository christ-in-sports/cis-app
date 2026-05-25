// Generate knockout matches based on league standings
export interface KnockoutMatch {
  home_team_id: string | null;
  away_team_id: string | null;
  match_type: 'knockout' | 'third_place' | 'fifth_place';
  round: number;
  bracket: 'top' | 'bottom' | 'main';
  label: string; // e.g., "Semi-Final 1", "Final", "3rd Place"
}

// 8 teams with groups: Top 2 from each group → top bracket, Bottom 2 → bottom bracket
export function generateKnockout8TeamsGrouped(
  groupAStandings: string[], // team IDs sorted by position (1st, 2nd, 3rd, 4th)
  groupBStandings: string[]
): KnockoutMatch[] {
  const matches: KnockoutMatch[] = [];

  // TOP BRACKET (1st-4th place) — Semi-finals
  // A1 vs B2, B1 vs A2
  matches.push({
    home_team_id: groupAStandings[0], // A1
    away_team_id: groupBStandings[1], // B2
    match_type: 'knockout',
    round: 1,
    bracket: 'top',
    label: 'Semi-Final 1',
  });
  matches.push({
    home_team_id: groupBStandings[0], // B1
    away_team_id: groupAStandings[1], // A2
    match_type: 'knockout',
    round: 1,
    bracket: 'top',
    label: 'Semi-Final 2',
  });

  // Top bracket final & 3rd place (teams TBD until semis complete)
  matches.push({
    home_team_id: null,
    away_team_id: null,
    match_type: 'knockout',
    round: 2,
    bracket: 'top',
    label: 'Final',
  });
  matches.push({
    home_team_id: null,
    away_team_id: null,
    match_type: 'third_place',
    round: 2,
    bracket: 'top',
    label: '3rd Place',
  });

  // BOTTOM BRACKET (5th-8th place) — Semi-finals
  // A3 vs B4, B3 vs A4
  matches.push({
    home_team_id: groupAStandings[2], // A3
    away_team_id: groupBStandings[3], // B4
    match_type: 'knockout',
    round: 1,
    bracket: 'bottom',
    label: 'Semi-Final 5th-8th (1)',
  });
  matches.push({
    home_team_id: groupBStandings[2], // B3
    away_team_id: groupAStandings[3], // A4
    match_type: 'knockout',
    round: 1,
    bracket: 'bottom',
    label: 'Semi-Final 5th-8th (2)',
  });

  // Bottom bracket final (5th place) & 7th place
  matches.push({
    home_team_id: null,
    away_team_id: null,
    match_type: 'knockout',
    round: 2,
    bracket: 'bottom',
    label: '5th Place',
  });
  matches.push({
    home_team_id: null,
    away_team_id: null,
    match_type: 'fifth_place',
    round: 2,
    bracket: 'bottom',
    label: '7th Place',
  });

  return matches;
}

// 6 teams full round-robin → top 4 to knockout, bottom 2 play 5th/6th
export function generateKnockout6Teams(
  standings: string[] // all 6 team IDs sorted by position
): KnockoutMatch[] {
  const matches: KnockoutMatch[] = [];

  // MAIN BRACKET — Semi-finals
  // 1st vs 4th, 2nd vs 3rd
  matches.push({
    home_team_id: standings[0], // 1st
    away_team_id: standings[3], // 4th
    match_type: 'knockout',
    round: 1,
    bracket: 'main',
    label: 'Semi-Final 1',
  });
  matches.push({
    home_team_id: standings[1], // 2nd
    away_team_id: standings[2], // 3rd
    match_type: 'knockout',
    round: 1,
    bracket: 'main',
    label: 'Semi-Final 2',
  });

  // Final & 3rd place
  matches.push({
    home_team_id: null,
    away_team_id: null,
    match_type: 'knockout',
    round: 2,
    bracket: 'main',
    label: 'Final',
  });
  matches.push({
    home_team_id: null,
    away_team_id: null,
    match_type: 'third_place',
    round: 2,
    bracket: 'main',
    label: '3rd Place',
  });

  // 5th/6th place match
  matches.push({
    home_team_id: standings[4], // 5th
    away_team_id: standings[5], // 6th
    match_type: 'fifth_place',
    round: 1,
    bracket: 'main',
    label: '5th Place',
  });

  return matches;
}

// 8 teams full round-robin (league only → tournament): top 4 vs bottom 4
export function generateKnockout8TeamsFullLeague(
  standings: string[] // all 8 team IDs sorted by position
): KnockoutMatch[] {
  const matches: KnockoutMatch[] = [];

  // TOP BRACKET (1st-4th)
  matches.push({
    home_team_id: standings[0], // 1st
    away_team_id: standings[3], // 4th
    match_type: 'knockout',
    round: 1,
    bracket: 'top',
    label: 'Semi-Final 1',
  });
  matches.push({
    home_team_id: standings[1], // 2nd
    away_team_id: standings[2], // 3rd
    match_type: 'knockout',
    round: 1,
    bracket: 'top',
    label: 'Semi-Final 2',
  });
  matches.push({
    home_team_id: null,
    away_team_id: null,
    match_type: 'knockout',
    round: 2,
    bracket: 'top',
    label: 'Final',
  });
  matches.push({
    home_team_id: null,
    away_team_id: null,
    match_type: 'third_place',
    round: 2,
    bracket: 'top',
    label: '3rd Place',
  });

  // BOTTOM BRACKET (5th-8th)
  matches.push({
    home_team_id: standings[4], // 5th
    away_team_id: standings[7], // 8th
    match_type: 'knockout',
    round: 1,
    bracket: 'bottom',
    label: 'Semi-Final 5th-8th (1)',
  });
  matches.push({
    home_team_id: standings[5], // 6th
    away_team_id: standings[6], // 7th
    match_type: 'knockout',
    round: 1,
    bracket: 'bottom',
    label: 'Semi-Final 5th-8th (2)',
  });
  matches.push({
    home_team_id: null,
    away_team_id: null,
    match_type: 'knockout',
    round: 2,
    bracket: 'bottom',
    label: '5th Place',
  });
  matches.push({
    home_team_id: null,
    away_team_id: null,
    match_type: 'fifth_place',
    round: 2,
    bracket: 'bottom',
    label: '7th Place',
  });

  return matches;
}

// Tournament-only mode (no league phase, straight bracket)
export function generateTournamentOnly(
  teamIds: string[]
): KnockoutMatch[] {
  const shuffled = [...teamIds].sort(() => Math.random() - 0.5);
  const count = shuffled.length;
  const matches: KnockoutMatch[] = [];

  if (count === 8) {
    // Quarter-finals
    for (let i = 0; i < 4; i++) {
      matches.push({
        home_team_id: shuffled[i * 2],
        away_team_id: shuffled[i * 2 + 1],
        match_type: 'knockout',
        round: 1,
        bracket: 'main',
        label: `Quarter-Final ${i + 1}`,
      });
    }
    // Semis
    matches.push({ home_team_id: null, away_team_id: null, match_type: 'knockout', round: 2, bracket: 'main', label: 'Semi-Final 1' });
    matches.push({ home_team_id: null, away_team_id: null, match_type: 'knockout', round: 2, bracket: 'main', label: 'Semi-Final 2' });
    // Final & 3rd
    matches.push({ home_team_id: null, away_team_id: null, match_type: 'knockout', round: 3, bracket: 'main', label: 'Final' });
    matches.push({ home_team_id: null, away_team_id: null, match_type: 'third_place', round: 3, bracket: 'main', label: '3rd Place' });
    // 5th place bracket
    matches.push({ home_team_id: null, away_team_id: null, match_type: 'knockout', round: 2, bracket: 'bottom', label: '5th-8th Semi 1' });
    matches.push({ home_team_id: null, away_team_id: null, match_type: 'knockout', round: 2, bracket: 'bottom', label: '5th-8th Semi 2' });
    matches.push({ home_team_id: null, away_team_id: null, match_type: 'knockout', round: 3, bracket: 'bottom', label: '5th Place' });
    matches.push({ home_team_id: null, away_team_id: null, match_type: 'fifth_place', round: 3, bracket: 'bottom', label: '7th Place' });
  } else if (count === 6) {
    // 1st and 2nd seed get byes to semis
    // QF: 3 vs 6, 4 vs 5
    matches.push({ home_team_id: shuffled[2], away_team_id: shuffled[5], match_type: 'knockout', round: 1, bracket: 'main', label: 'Quarter-Final 1' });
    matches.push({ home_team_id: shuffled[3], away_team_id: shuffled[4], match_type: 'knockout', round: 1, bracket: 'main', label: 'Quarter-Final 2' });
    // Semis: 1st vs QF1 winner, 2nd vs QF2 winner
    matches.push({ home_team_id: shuffled[0], away_team_id: null, match_type: 'knockout', round: 2, bracket: 'main', label: 'Semi-Final 1' });
    matches.push({ home_team_id: shuffled[1], away_team_id: null, match_type: 'knockout', round: 2, bracket: 'main', label: 'Semi-Final 2' });
    // Final & 3rd
    matches.push({ home_team_id: null, away_team_id: null, match_type: 'knockout', round: 3, bracket: 'main', label: 'Final' });
    matches.push({ home_team_id: null, away_team_id: null, match_type: 'third_place', round: 3, bracket: 'main', label: '3rd Place' });
    // 5th place
    matches.push({ home_team_id: null, away_team_id: null, match_type: 'fifth_place', round: 1, bracket: 'main', label: '5th Place' });
  } else if (count === 4) {
    matches.push({ home_team_id: shuffled[0], away_team_id: shuffled[3], match_type: 'knockout', round: 1, bracket: 'main', label: 'Semi-Final 1' });
    matches.push({ home_team_id: shuffled[1], away_team_id: shuffled[2], match_type: 'knockout', round: 1, bracket: 'main', label: 'Semi-Final 2' });
    matches.push({ home_team_id: null, away_team_id: null, match_type: 'knockout', round: 2, bracket: 'main', label: 'Final' });
    matches.push({ home_team_id: null, away_team_id: null, match_type: 'third_place', round: 2, bracket: 'main', label: '3rd Place' });
  }

  return matches;
}