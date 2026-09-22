import { gradeNum, defaultSession, nextStatus } from './attendance';

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

describe('defaultSession', () => {
  it('maps grades 4-6 to juniors', () => {
    expect(defaultSession('4')).toBe('juniors');
    expect(defaultSession('6')).toBe('juniors');
  });

  it('maps grades 8-12 to ambassadors', () => {
    expect(defaultSession('8')).toBe('ambassadors');
    expect(defaultSession('12')).toBe('ambassadors');
  });

  it('leaves grade 7 unresolved so the kid must choose', () => {
    expect(defaultSession('7')).toBeNull();
  });

  it('returns null for an unparseable grade', () => {
    expect(defaultSession(null)).toBeNull();
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
