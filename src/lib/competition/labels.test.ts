import {
  blockTitle,
  standingsNote,
  formatClock,
  formatClockMeridiem,
  formatDay,
  formatShortDate,
  ordinal,
  ordinalParts,
  plural,
  scheduleText,
  signed,
  sportLabel,
  tiebreakPhrase,
} from './labels';

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [8, '8th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [101, '101st'],
    [111, '111th'],
  ])('%i is %s', (n, text) => {
    expect(ordinal(n)).toBe(text);
  });

  it('splits the number from the suffix for a superscript', () => {
    expect(ordinalParts(3)).toEqual({ value: 3, suffix: 'rd' });
  });
});

describe('dates and times', () => {
  it('formats a calendar date from its parts, whatever the viewer time zone', () => {
    expect(formatDay('2026-10-17')).toBe('Saturday, Oct 17');
    expect(formatDay('2026-12-31')).toBe('Thursday, Dec 31');
    expect(formatShortDate('2026-01-05')).toBe('Jan 5');
  });

  it('formats a clock time without AM/PM, and with it', () => {
    expect(formatClock('09:45:00')).toBe('9:45');
    expect(formatClock('13:05:00')).toBe('1:05');
    expect(formatClock('00:30:00')).toBe('12:30');
    expect(formatClock('12:00:00')).toBe('12:00');
    expect(formatClockMeridiem('09:45:00')).toBe('9:45 AM');
    expect(formatClockMeridiem('13:05:00')).toBe('1:05 PM');
    expect(formatClockMeridiem('12:00:00')).toBe('12:00 PM');
    expect(formatClockMeridiem('00:30:00')).toBe('12:30 AM');
  });

  it('describes when and where a game is, leaving out what is not set', () => {
    expect(scheduleText({ scheduled_date: '2026-10-19', scheduled_time: '09:00:00', court: 1 })).toBe(
      'Oct 19 · 9:00 · Court 1'
    );
    expect(scheduleText({ scheduled_date: '2026-10-19', scheduled_time: null, court: null })).toBe('Oct 19');
    expect(scheduleText({ scheduled_date: null, scheduled_time: '09:00:00', court: 1 })).toBeNull();
  });
});

describe('small helpers', () => {
  it('pluralises', () => {
    expect(plural(1, 'game')).toBe('1 game');
    expect(plural(0, 'game')).toBe('0 games');
    expect(plural(3, 'court')).toBe('3 courts');
    expect(plural(2, 'class', 'classes')).toBe('2 classes');
  });

  it('signs a difference, with a real minus', () => {
    expect(signed(7)).toBe('+7');
    expect(signed(0)).toBe('0');
    expect(signed(-4)).toBe('−4');
  });

  it('knows sports and falls back for ones it does not', () => {
    expect(sportLabel('soccer')).toBe('Soccer');
    expect(sportLabel('curling')).toBe('Curling');
    expect(tiebreakPhrase('soccer')).toBe('on penalties');
    expect(tiebreakPhrase('basketball')).toBe('in overtime');
    expect(tiebreakPhrase('dodgeball')).toBe('in the extra round');
    expect(tiebreakPhrase('curling')).toBe('in the tiebreak');
  });
});

describe('block names and the standings footnote', () => {
  it('names a block by division and sport', () => {
    expect(blockTitle('juniors', 'soccer')).toBe('Juniors soccer');
    expect(blockTitle('ambassadors', 'basketball')).toBe('Ambassadors basketball');
  });

  it('spells out the abbreviations for each sport and says how rank is set', () => {
    expect(standingsNote('soccer')).toBe(
      'GD goal difference · GF goals scored · 3 points for a win, 1 for a draw. ' +
        'Rank is set by points, then head-to-head between tied teams, then GD; it does not move when you sort.'
    );
    expect(standingsNote('basketball')).toContain('PD point difference · PF points scored');
    expect(standingsNote('volleyball')).toContain('SD set difference · SW sets won');
    expect(standingsNote('dodgeball')).toContain('RD round difference · RW rounds won');
  });
});
