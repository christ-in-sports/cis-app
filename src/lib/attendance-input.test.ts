import { assignmentInput, markInput, sessionInput } from './attendance-input';

const id = 'b885f8bc-347d-4a99-82ea-d36bb1b35554';

describe('attendance input validation', () => {
  it('accepts a registration session for either division or both', () => {
    for (const division of ['juniors', 'ambassadors', null]) {
      expect(sessionInput.parse({ seasonId: id, title: ' Sunday ', date: '2026-11-01', division }).title).toBe('Sunday');
    }
  });
  it('rejects impossible dates and empty titles', () => {
    expect(sessionInput.safeParse({ seasonId: id, title: ' ', date: '2026-02-30', division: null }).success).toBe(false);
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
