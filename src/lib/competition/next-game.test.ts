import { nextGame } from './next-game';
import type { BlockRecord, GameRecord, TeamRecord } from './types';

const block: BlockRecord = {
  id: 'b1',
  season_id: 's1',
  division: 'juniors',
  sport: 'basketball',
  format: 'league',
  league_structure: null,
  status: 'league',
  starts_on: '2026-10-24',
  ends_on: '2026-11-14',
  settings: null,
};

const teams: TeamRecord[] = ['Lions', 'Eagles', 'Hawks', 'Comets'].map((name, i) => ({
  id: `t${i + 1}`,
  name,
  active: true,
  division: 'juniors',
}));

function game(over: Partial<GameRecord> & { id: string }): GameRecord {
  return {
    sport_block_id: 'b1',
    home_team_id: 't1',
    away_team_id: 't2',
    stage: 'league',
    group_label: null,
    round: 1,
    label: 'Round 1',
    scheduled_date: '2026-10-31',
    scheduled_time: '10:30:00',
    court: 1,
    status: 'scheduled',
    winner_to_game_id: null,
    winner_to_slot: null,
    loser_to_game_id: null,
    loser_to_slot: null,
    winner_place: null,
    loser_place: null,
    ...over,
  };
}

const data = (games: GameRecord[], myTeamIds: string[] = []) => ({ blocks: [block], teams, games, myTeamIds });

describe('nextGame', () => {
  it('picks the earliest scheduled game from today on, by date, time and court', () => {
    const next = nextGame(
      data([
        game({ id: 'later', scheduled_date: '2026-11-07' }),
        game({ id: 'court2', scheduled_time: '09:00:00', court: 2 }),
        game({ id: 'court1', scheduled_time: '09:00:00', court: 1, home_team_id: 't3', away_team_id: 't4' }),
      ]),
      '2026-10-31',
    );
    expect(next?.game.id).toBe('court1');
    expect(next).toMatchObject({ home: 'Hawks', away: 'Comets', mine: false, block: { sport: 'basketball' } });
  });

  it("prefers the viewer's own teams when they have one", () => {
    const next = nextGame(
      data([game({ id: 'theirs', scheduled_time: '09:00:00' }), game({ id: 'mine', scheduled_time: '11:00:00', away_team_id: 't3' })], ['t3']),
      '2026-10-31',
    );
    expect(next?.game.id).toBe('mine');
    expect(next?.mine).toBe(true);
  });

  it('skips played games, past dates and games still waiting on a team', () => {
    expect(
      nextGame(
        data([
          game({ id: 'played', status: 'completed' }),
          game({ id: 'past', scheduled_date: '2026-10-24' }),
          game({ id: 'waiting', away_team_id: null }),
          game({ id: 'undated', scheduled_date: null }),
        ]),
        '2026-10-31',
      ),
    ).toBeNull();
  });

  it('puts a game with no time after the timed games on its day', () => {
    const next = nextGame(
      data([game({ id: 'untimed', scheduled_time: null }), game({ id: 'timed', scheduled_time: '15:00:00' })]),
      '2026-10-31',
    );
    expect(next?.game.id).toBe('timed');
  });
});
