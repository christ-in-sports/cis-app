import {
  gradeNum,
  defaultDivision,
  divisionAllowedForGrade,
  nextStatus,
} from './attendance';

describe('gradeNum', () => {
  it('parses numeric grades', () => {
    expect(gradeNum('4')).toBe(4);
    expect(gradeNum('12')).toBe(12);
  });

  it('parses kindergarten aliases as 0', () => {
    expect(gradeNum('K')).toBe(0);
    expect(gradeNum('kinder')).toBe(0);
    expect(gradeNum('TK')).toBe(0);
  });

  it('returns null for null or unparseable input', () => {
    expect(gradeNum(null)).toBeNull();
    expect(gradeNum('')).toBeNull();
  });
});

describe('defaultDivision', () => {
  it('maps grades 4-6 to juniors', () => {
    expect(defaultDivision(4)).toBe('juniors');
    expect(defaultDivision(6)).toBe('juniors');
  });

  it('maps grades 8-12 to ambassadors', () => {
    expect(defaultDivision(8)).toBe('ambassadors');
    expect(defaultDivision(12)).toBe('ambassadors');
  });

  it('leaves grade 7 unresolved so the kid must choose', () => {
    expect(defaultDivision(7)).toBeNull();
  });

  it('returns null for a missing grade', () => {
    expect(defaultDivision(null)).toBeNull();
  });
});

// Mirrors the registrations_division_matches_grade CHECK constraint. If these
// ever disagree, the UI will offer a choice the database then rejects.
describe('divisionAllowedForGrade', () => {
  it('permits grade 7 in either division', () => {
    expect(divisionAllowedForGrade(7, 'juniors')).toBe(true);
    expect(divisionAllowedForGrade(7, 'ambassadors')).toBe(true);
  });

  it('rejects a division that contradicts the grade', () => {
    expect(divisionAllowedForGrade(6, 'ambassadors')).toBe(false);
    expect(divisionAllowedForGrade(8, 'juniors')).toBe(false);
  });

  it('accepts the division the grade implies', () => {
    expect(divisionAllowedForGrade(5, 'juniors')).toBe(true);
    expect(divisionAllowedForGrade(9, 'ambassadors')).toBe(true);
  });
});

describe('nextStatus', () => {
  it('cycles present to absent', () => {
    expect(nextStatus('present')).toBe('absent');
  });

  it('cycles anything else back to present', () => {
    expect(nextStatus('absent')).toBe('present');
    expect(nextStatus('late')).toBe('present');
    expect(nextStatus('unmarked')).toBe('present');
  });
});
