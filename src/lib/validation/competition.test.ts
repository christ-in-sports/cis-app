import {
  clearGameDaySchema,
  firstIssue,
  recordResultSchema,
  saveSportBlockSchema,
  scheduleGameDaySchema,
} from './competition';

const ID = '3f2b8c1e-9a4d-4e6f-8b1a-2c7d5e9f0a11';

const block = { division: 'juniors', sport: 'soccer', format: 'league' } as const;

describe('saveSportBlockSchema', () => {
  it('accepts a league block and fills in the structure and empty settings', () => {
    const r = saveSportBlockSchema.parse(block);
    expect(r).toMatchObject({
      leagueStructure: 'round_robin',
      startsOn: null,
      endsOn: null,
      settings: {},
    });
  });

  it('makes a knockout-only block structureless', () => {
    expect(saveSportBlockSchema.parse({ ...block, format: 'knockout' }).leagueStructure).toBeNull();
    expect(
      saveSportBlockSchema.safeParse({ ...block, format: 'knockout', leagueStructure: 'groups' }).success
    ).toBe(false);
  });

  it('makes the admin choose a structure for league then knockout', () => {
    const missing = saveSportBlockSchema.safeParse({ ...block, format: 'league_knockout' });
    expect(missing.success).toBe(false);
    expect(!missing.success && firstIssue(missing.error)).toBe('Choose a league structure');

    for (const leagueStructure of ['round_robin', 'groups'] as const) {
      expect(
        saveSportBlockSchema.parse({ ...block, format: 'league_knockout', leagueStructure }).leagueStructure
      ).toBe(leagueStructure);
    }
  });

  it('rejects groups for a league-only block', () => {
    expect(saveSportBlockSchema.safeParse({ ...block, leagueStructure: 'groups' }).success).toBe(false);
  });

  it('rejects an unknown sport, a blank one, and a bad division or format', () => {
    expect(saveSportBlockSchema.safeParse({ ...block, sport: 'curling' }).success).toBe(false);
    expect(saveSportBlockSchema.safeParse({ ...block, sport: '  ' }).success).toBe(false);
    expect(saveSportBlockSchema.safeParse({ ...block, division: 'seniors' }).success).toBe(false);
    expect(saveSportBlockSchema.safeParse({ ...block, format: 'swiss' }).success).toBe(false);
  });

  it('accepts every sport the registry knows, ignoring case-trimmed whitespace', () => {
    for (const sport of ['soccer', 'basketball', 'volleyball', 'dodgeball']) {
      expect(saveSportBlockSchema.safeParse({ ...block, sport: ` ${sport} ` }).success).toBe(true);
    }
  });

  it('checks the dates', () => {
    expect(saveSportBlockSchema.safeParse({ ...block, startsOn: '2026-10-05', endsOn: '2026-10-26' }).success).toBe(true);
    expect(saveSportBlockSchema.safeParse({ ...block, startsOn: '2026-10-26', endsOn: '2026-10-05' }).success).toBe(false);
    expect(saveSportBlockSchema.safeParse({ ...block, startsOn: '10/05/2026' }).success).toBe(false);
    expect(saveSportBlockSchema.safeParse({ ...block, startsOn: '2026-13-45' }).success).toBe(false);
  });

  it('limits settings and refuses ones it does not know', () => {
    expect(saveSportBlockSchema.parse({ ...block, settings: { maxSets: 3, gameMinutes: 25 } }).settings).toEqual({
      maxSets: 3,
      gameMinutes: 25,
    });
    expect(saveSportBlockSchema.safeParse({ ...block, settings: { maxSets: 0 } }).success).toBe(false);
    expect(saveSportBlockSchema.safeParse({ ...block, settings: { gameMinutes: 2 } }).success).toBe(false);
    expect(saveSportBlockSchema.safeParse({ ...block, settings: { favourite: 'x' } }).success).toBe(false);
  });

  it('requires real ids when given', () => {
    expect(saveSportBlockSchema.safeParse({ ...block, id: 'abc' }).success).toBe(false);
    expect(saveSportBlockSchema.safeParse({ ...block, id: ID, seasonId: ID }).success).toBe(true);
  });
});

describe('recordResultSchema', () => {
  it('accepts any details (they are checked per sport later) and an optional tiebreak side', () => {
    expect(recordResultSchema.safeParse({ gameId: ID, details: { home: 2, away: 1 } }).success).toBe(true);
    expect(recordResultSchema.safeParse({ gameId: ID, details: {}, tiebreakWinner: 'away' }).success).toBe(true);
    expect(recordResultSchema.safeParse({ gameId: ID, details: {}, tiebreakWinner: null }).success).toBe(true);
  });

  it('rejects a tiebreak that is not a side, and a missing or malformed game id', () => {
    expect(recordResultSchema.safeParse({ gameId: ID, details: {}, tiebreakWinner: 'draw' }).success).toBe(false);
    expect(recordResultSchema.safeParse({ gameId: 'x', details: {} }).success).toBe(false);
    expect(recordResultSchema.safeParse({ details: {} }).success).toBe(false);
  });
});

describe('scheduleGameDaySchema', () => {
  const day = { blockId: ID, date: '2026-10-17', startTime: '14:00', slots: 6, courts: 2 };

  it('accepts a game day', () => {
    expect(scheduleGameDaySchema.safeParse(day).success).toBe(true);
  });

  it.each([
    ['a bad date', { date: '17 Oct' }],
    ['a 12-hour time', { startTime: '2:00 PM' }],
    ['an impossible time', { startTime: '25:00' }],
    ['no slots', { slots: 0 }],
    ['too many slots', { slots: 25 }],
    ['no courts', { courts: 0 }],
    ['too many courts', { courts: 9 }],
    ['fractional slots', { slots: 2.5 }],
  ])('rejects %s', (_name, patch) => {
    expect(scheduleGameDaySchema.safeParse({ ...day, ...patch }).success).toBe(false);
  });
});

describe('clearGameDaySchema', () => {
  it('needs a block and a date', () => {
    expect(clearGameDaySchema.safeParse({ blockId: ID, date: '2026-10-17' }).success).toBe(true);
    expect(clearGameDaySchema.safeParse({ blockId: ID }).success).toBe(false);
  });
});
