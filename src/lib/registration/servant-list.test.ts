import Papa from 'papaparse';

import {
  SERVANT_CSV_COLUMNS,
  servantsToCsv,
  sessionTeams,
  type ServantListRow,
} from './servant-list';

function row(over: Partial<ServantListRow> = {}): ServantListRow {
  return {
    id: 'r1',
    full_name: 'Mina Hanna',
    email: 'mina@test.local',
    phone: '(510) 555-1234',
    evaluation_status: 'completed',
    is_serving: true,
    sessions: ['juniors', 'ambassadors'],
    juniors_subteams: ['coaches', 'prayer'],
    ambassadors_subteams: [],
    juniors_other: null,
    ambassadors_other: 'Photography',
    notes: 'Prefer mornings',
    dates_missing: 'Feb 7',
    gender: 'male',
    dob: '1990-04-02',
    home_address: '1 Main St, Hayward, CA',
    emergency_contact_name: 'Sara Hanna',
    emergency_contact_phone: '(510) 555-9876',
    created_at: '2026-10-01T18:30:00Z',
    updated_at: '2026-10-02T18:30:00Z',
    ...over,
  };
}

describe('sessionTeams', () => {
  it('lists chosen teams in a fixed order, then Other', () => {
    expect(sessionTeams(row({ juniors_other: 'Setup' }), 'juniors')).toBe(
      'Coaches, Prayer Team, Other: Setup',
    );
    expect(sessionTeams(row(), 'ambassadors')).toBe('Other: Photography');
  });
});

describe('servantsToCsv', () => {
  const parse = (csv: string) => Papa.parse<string[]>(csv, { header: false }).data;

  it('has the agreed columns, one row per servant', () => {
    const data = parse(servantsToCsv([row(), row({ id: 'r2', full_name: 'Sara Y' })]));
    expect(data[0]).toEqual([...SERVANT_CSV_COLUMNS]);
    expect(data).toHaveLength(3);
  });

  it('writes the answers as readable text', () => {
    const [header, values] = parse(servantsToCsv([row()]));
    const cell = (name: string) => values[header.indexOf(name)];
    expect(cell('is_serving')).toBe('Yes');
    expect(cell('evaluation_status')).toBe('Completed');
    expect(cell('sessions')).toBe('Juniors, Ambassadors');
    expect(cell('juniors_teams')).toBe('Coaches, Prayer Team');
    expect(cell('ambassadors_teams')).toBe('Other: Photography');
    expect(cell('gender')).toBe('Male');
    expect(cell('home_address')).toBe('1 Main St, Hayward, CA');
  });

  it('leaves sessions and teams empty for someone who is not serving', () => {
    const [header, values] = parse(
      servantsToCsv([
        row({
          is_serving: false,
          sessions: [],
          juniors_subteams: [],
          ambassadors_subteams: [],
          ambassadors_other: null,
        }),
      ]),
    );
    expect(values[header.indexOf('is_serving')]).toBe('No');
    expect(values[header.indexOf('sessions')]).toBe('');
    expect(values[header.indexOf('juniors_teams')]).toBe('');
  });

  it('stops a typed value from running as a spreadsheet formula', () => {
    const [header, values] = parse(
      servantsToCsv([row({ notes: '=HYPERLINK("http://x")', dates_missing: '-2+3', full_name: '@me' })]),
    );
    expect(values[header.indexOf('notes')]).toBe(`'=HYPERLINK("http://x")`);
    expect(values[header.indexOf('dates_missing')]).toBe("'-2+3");
    expect(values[header.indexOf('full_name')]).toBe("'@me");
  });

  it('quotes values with commas and line breaks so rows stay intact', () => {
    const data = parse(servantsToCsv([row({ notes: 'a, b\nc' })]));
    expect(data).toHaveLength(2);
    expect(data[1][data[0].indexOf('notes')]).toBe('a, b\nc');
  });
});
