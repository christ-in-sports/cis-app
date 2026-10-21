import { assignmentInput, markInput, renameTeamInput, sessionInput } from './attendance-input';

const id = 'b885f8bc-347d-4a99-82ea-d36bb1b35554';

describe('attendance input validation', () => {
  it('trims team names and rejects missing, oversized names and invalid team IDs', () => {
    expect(renameTeamInput.parse({ teamId: id, name: ' Lions ' }).name).toBe('Lions');
    for (const name of ['', '  ', 'x'.repeat(81)]) expect(renameTeamInput.safeParse({ teamId: id, name }).success).toBe(false);
    expect(renameTeamInput.safeParse({ teamId: 'invalid', name: 'Lions' }).success).toBe(false);
  });
  it('creates an attendance day from just a date', () => {
    expect(sessionInput.parse({ date: '2026-11-01' })).toEqual({ date: '2026-11-01' });
  });
  it('rejects impossible or missing dates', () => {
    expect(sessionInput.safeParse({ date: '2026-02-30' }).success).toBe(false);
    expect(sessionInput.safeParse({}).success).toBe(false);
  });
  it('validates status, targets and note length before a mark is submitted', () => {
    expect(markInput.safeParse({ dayId: id, ids: [], status: 'present' }).success).toBe(false);
    expect(markInput.safeParse({ dayId: id, ids: [id], status: 'unknown' }).success).toBe(false);
    expect(markInput.safeParse({ dayId: id, ids: [id], status: 'late', note: 'x'.repeat(1001) }).success).toBe(false);
    expect(markInput.parse({ dayId: id, ids: [id], status: 'unmarked' }).onlyUnmarked).toBe(false);
  });
  it('allows clearing a team assignment without allowing an empty selection', () => {
    expect(assignmentInput.parse({ ids: [id], teamId: null }).teamId).toBeNull();
    expect(assignmentInput.safeParse({ ids: [], teamId: null }).success).toBe(false);
  });
});
