import { attendanceRanks, awardsRoster, sortAttendance } from './attendance-awards';
import type { SummaryRow } from './attendance';

const row = (id: string, overrides: Partial<SummaryRow> = {}): SummaryRow => ({
  registration_id: id, first_name: id, last_name: 'Kid', grade: 6, division: 'juniors',
  team_id: null, team_name: null, eligible: 4, present: 2, late: 0, absent: 2,
  excused: 0, unmarked: 0, attended: 2, pct: 50, ...overrides,
});

it('includes kids with no records, preserves totals and uses the current team', () => {
  const kids = ['a', 'b'].map((id) => ({ id, kid_id: `kid-${id}`, first_name: id, last_name: 'Kid', grade: 6, division: 'juniors' as const, team_id: 'lions' }));
  const result = awardsRoster(kids, [{ id: 'lions', name: 'Lions', division: 'juniors', active: true }], [row('a', { late: 1, attended: 3 }), row('past')]);
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({ attended: 3, late: 1, team_name: 'Lions' });
  expect(result[1]).toMatchObject({ registration_id: 'b', attended: 0, eligible: 0, pct: 0, team_name: 'Lions' });
});

it('ranks each division independently with shared ties and competition gaps', () => {
  const ranks = attendanceRanks([row('a', { attended: 3 }), row('b', { attended: 3 }), row('c'), row('d', { division: 'ambassadors', attended: 1 }), row('empty', { eligible: 0 }), row('unmarked', { unmarked: 4 })]);
  expect([...ranks.entries()]).toEqual([['a', 1], ['b', 1], ['c', 3], ['d', 1]]);
});

it('sorts by attendance without preferring a single perfect day over more days present', () => {
  const rows = [row('one', { attended: 1, pct: 100 }), row('many', { attended: 3, pct: 75 })];
  expect(sortAttendance(rows, 'attendance').map((r) => r.registration_id)).toEqual(['many', 'one']);
  expect(sortAttendance(rows, 'percent').map((r) => r.registration_id)).toEqual(['one', 'many']);
  expect(rows.map((r) => r.registration_id)).toEqual(['one', 'many']);
});

it('sorts teams alphabetically, then names, without changing division ranks', () => {
  const rows = [row('z', { team_name: 'Zebras', attended: 3 }), row('b', { team_name: 'Lions' }), row('a', { team_name: 'Lions' }), row('none')];
  expect(sortAttendance(rows, 'team').map((r) => r.registration_id)).toEqual(['a', 'b', 'none', 'z']);
  expect(attendanceRanks(rows).get('z')).toBe(1);
  expect(sortAttendance(rows, 'name').map((r) => r.registration_id)).toEqual(['a', 'b', 'none', 'z']);
});
