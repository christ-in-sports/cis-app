// Round-robin fixture generator using the "circle method"
export function generateRoundRobinFixtures(teamIds: string[]): { home: string; away: string; round: number }[] {
  const teams = [...teamIds];
  const fixtures: { home: string; away: string; round: number }[] = [];

  // If odd number of teams, add a "bye" placeholder
  if (teams.length % 2 !== 0) {
    teams.push('BYE');
  }

  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < half; i++) {
      const home = teams[i];
      const away = teams[n - 1 - i];

      if (home === 'BYE' || away === 'BYE') continue;

      fixtures.push({
        home,
        away,
        round: round + 1,
      });
    }

    // Rotate teams (keep first team fixed)
    const last = teams.pop()!;
    teams.splice(1, 0, last);
  }

  return fixtures;
}

// Generate GROUP STAGE fixtures for 8 teams (2 groups of 4)
export function generateGroupStageFixtures(
  teamIds: string[]
): {
  groupA: string[];
  groupB: string[];
  fixtures: { home: string; away: string; round: number; group: 'A' | 'B' }[];
} {
  // Shuffle teams
  const shuffled = [...teamIds].sort(() => Math.random() - 0.5);

  // Split into 2 groups of 4
  const groupA = shuffled.slice(0, 4);
  const groupB = shuffled.slice(4, 8);

  const fixtures: { home: string; away: string; round: number; group: 'A' | 'B' }[] = [];

  // Generate round-robin for each group
  const groupAFixtures = generateRoundRobinFixtures(groupA);
  const groupBFixtures = generateRoundRobinFixtures(groupB);

  groupAFixtures.forEach((f) => {
    fixtures.push({ ...f, group: 'A' });
  });

  groupBFixtures.forEach((f) => {
    fixtures.push({ ...f, group: 'B' });
  });

  return { groupA, groupB, fixtures };
}

// Generate knockout bracket slots
export function generateKnockoutSlots(
  teamCount: number,
  bracket: 'main' | 'top' | 'bottom' = 'main'
): { round: number; matchIndex: number; bracket: string }[] {
  const slots: { round: number; matchIndex: number; bracket: string }[] = [];

  let teamsInBracket = teamCount;
  let round = 1;

  while (teamsInBracket > 1) {
    const matchesInRound = Math.floor(teamsInBracket / 2);
    for (let i = 0; i < matchesInRound; i++) {
      slots.push({ round, matchIndex: i, bracket });
    }
    teamsInBracket = matchesInRound;
    round++;
  }

  return slots;
}

// Determine which fixture logic to use based on team count and play mode
export function generateLeagueFixturesForSport(
  teamIds: string[],
  playMode: string
): {
  groupA: string[] | null;
  groupB: string[] | null;
  fixtures: { home: string; away: string; round: number; group: 'A' | 'B' | null }[];
} {
  const teamCount = teamIds.length;

  // For 8 teams in league+tournament mode: 2 groups of 4
  if (teamCount === 8 && playMode === 'league_tournament') {
    const result = generateGroupStageFixtures(teamIds);
    return {
      groupA: result.groupA,
      groupB: result.groupB,
      fixtures: result.fixtures,
    };
  }

  // For everything else: full round-robin of all teams
  const fixtures = generateRoundRobinFixtures(teamIds);
  return {
    groupA: null,
    groupB: null,
    fixtures: fixtures.map((f) => ({ ...f, group: null })),
  };
}