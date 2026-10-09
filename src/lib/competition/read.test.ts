import { blocksInDivision, pickBlock, pickDivision } from './read';
import type { BlockRecord, Division, TeamRecord } from './types';

const block = (over: Partial<BlockRecord> & { id: string }): BlockRecord => ({
  season_id: 's',
  division: 'juniors',
  sport: 'soccer',
  format: 'league',
  league_structure: 'round_robin',
  status: 'setup',
  starts_on: null,
  ends_on: null,
  settings: null,
  ...over,
});

const team = (id: string, division: Division): TeamRecord => ({ id, name: id, division });

describe('blocksInDivision', () => {
  it('keeps one division, ordered by start date then sport, undated last', () => {
    const blocks = [
      block({ id: 'undated', sport: 'dodgeball' }),
      block({ id: 'late', sport: 'basketball', starts_on: '2026-11-02' }),
      block({ id: 'early-b', sport: 'volleyball', starts_on: '2026-10-05' }),
      block({ id: 'early-a', sport: 'soccer', starts_on: '2026-10-05' }),
      block({ id: 'amb', division: 'ambassadors', starts_on: '2026-10-05' }),
    ];
    expect(blocksInDivision(blocks, 'juniors').map((b) => b.id)).toEqual(['early-a', 'early-b', 'late', 'undated']);
    expect(blocksInDivision(blocks, 'ambassadors').map((b) => b.id)).toEqual(['amb']);
  });
});

describe('pickDivision', () => {
  const teams = [team('lions', 'juniors'), team('saints', 'ambassadors')];
  const blocks = [block({ id: 'a', division: 'ambassadors' })];

  it('uses the division in the URL', () => {
    expect(pickDivision({ requested: 'juniors', blocks, teams, myTeamIds: ['saints'] })).toBe('juniors');
  });

  it('ignores a division it does not know', () => {
    expect(pickDivision({ requested: 'seniors', blocks, teams, myTeamIds: ['saints'] })).toBe('ambassadors');
  });

  it('falls back to the division of the viewer team', () => {
    expect(pickDivision({ blocks: [], teams, myTeamIds: ['saints'] })).toBe('ambassadors');
  });

  it('then to the first division with a block', () => {
    expect(pickDivision({ blocks, teams, myTeamIds: [] })).toBe('ambassadors');
  });

  it('then to Juniors', () => {
    expect(pickDivision({ blocks: [], teams, myTeamIds: [] })).toBe('juniors');
  });
});

describe('pickBlock', () => {
  const blocks = [
    block({ id: 'done-1', sport: 'soccer', status: 'completed' }),
    block({ id: 'done-2', sport: 'basketball', status: 'completed' }),
    block({ id: 'live', sport: 'volleyball', status: 'league' }),
    block({ id: 'next', sport: 'dodgeball', status: 'setup' }),
  ];

  it('uses the block in the URL when it belongs to the division', () => {
    expect(pickBlock(blocks, 'done-1')?.id).toBe('done-1');
  });

  it('ignores a block from somewhere else', () => {
    expect(pickBlock(blocks, 'elsewhere')?.id).toBe('live');
  });

  it('prefers the block being played, then the latest finished one, then the first', () => {
    expect(pickBlock(blocks)?.id).toBe('live');
    expect(pickBlock(blocks.filter((b) => b.status === 'completed'))?.id).toBe('done-2');
    expect(pickBlock(blocks.filter((b) => b.status === 'setup'))?.id).toBe('next');
  });

  it('is null with no blocks', () => {
    expect(pickBlock([])).toBeNull();
  });
});
