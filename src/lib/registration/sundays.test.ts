import { SEASON_SUNDAYS, formatSunday, seasonSundays } from './sundays';

describe('season Sundays', () => {
  it('lists every Sunday from January 3 to April 18, 2027', () => {
    expect(SEASON_SUNDAYS).toHaveLength(16);
    expect(SEASON_SUNDAYS[0]).toBe('2027-01-03');
    expect(SEASON_SUNDAYS[15]).toBe('2027-04-18');
    for (const d of SEASON_SUNDAYS) {
      expect(new Date(`${d}T00:00:00Z`).getUTCDay()).toBe(0);
    }
  });

  it('crosses the daylight-saving change without drifting', () => {
    expect(seasonSundays('2027-03-07', '2027-03-21')).toEqual(['2027-03-07', '2027-03-14', '2027-03-21']);
  });

  it('formats a Sunday as a short date', () => {
    expect(formatSunday('2027-01-03')).toBe('Jan 3');
    expect(formatSunday('2027-04-18')).toBe('Apr 18');
  });
});
