import { servantRegistrationSchema, type ServantRegistrationInput } from './servant';

const base = (over: Partial<ServantRegistrationInput> = {}): ServantRegistrationInput => ({
  full_name: ' Mina Hanna ',
  evaluation_status: 'completed',
  is_serving: true,
  sessions: ['juniors'],
  juniors_subteams: ['coaches'],
  ambassadors_subteams: [],
  juniors_other: '',
  ambassadors_other: '',
  notes: '',
  dates_missing: '',
  phone: '510-555-1234',
  emergency_contact_name: 'Sara Hanna',
  emergency_contact_phone: '5105559876',
  gender: 'male',
  dob: '1990-04-02',
  home_address: '1 Main St, Hayward CA',
  ...over,
});

const issues = (input: ServantRegistrationInput) => {
  const r = servantRegistrationSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
};

describe('servantRegistrationSchema', () => {
  it('accepts a serving servant, trimming text and normalising phones', () => {
    const r = servantRegistrationSchema.parse(base());
    expect(r.full_name).toBe('Mina Hanna');
    expect(r.phone).toBe('(510) 555-1234');
    expect(r.emergency_contact_phone).toBe('(510) 555-9876');
    expect(r.notes).toBeNull();
    expect(r.dates_missing).toBeNull();
  });

  it('requires at least one session when serving', () => {
    expect(issues(base({ sessions: [] }))).toContainEqual(
      expect.objectContaining({ path: 'sessions', message: 'Choose at least one session' }),
    );
  });

  it('requires a team or Other for each chosen session', () => {
    const found = issues(
      base({ sessions: ['juniors', 'ambassadors'], juniors_subteams: ['prayer'] }),
    );
    expect(found.map((i) => i.path)).toEqual(['ambassadors_subteams']);
  });

  it('accepts Other in place of a team', () => {
    expect(
      issues(base({ juniors_subteams: [], juniors_other: 'Photography' })),
    ).toEqual([]);
  });

  it('does not ask for sessions or teams when not serving, and drops any sent', () => {
    const r = servantRegistrationSchema.parse(
      base({ is_serving: false, sessions: ['juniors'], juniors_subteams: ['admin'], juniors_other: 'x' }),
    );
    expect(r.sessions).toEqual([]);
    expect(r.juniors_subteams).toEqual([]);
    expect(r.juniors_other).toBeNull();
  });

  it('drops answers for a session that was not chosen', () => {
    const r = servantRegistrationSchema.parse(
      base({ ambassadors_subteams: ['program'], ambassadors_other: 'x' }),
    );
    expect(r.ambassadors_subteams).toEqual([]);
    expect(r.ambassadors_other).toBeNull();
  });

  it('rejects a non-US phone and a non-existent sub-team', () => {
    expect(issues(base({ phone: '+44 20 7946 0958' })).map((i) => i.path)).toEqual(['phone']);
    expect(
      issues(base({ emergency_contact_phone: '12345' })).map((i) => i.path),
    ).toEqual(['emergency_contact_phone']);
    expect(
      servantRegistrationSchema.safeParse({ ...base(), juniors_subteams: ['goalkeepers'] }).success,
    ).toBe(false);
  });

  it('requires the contact and identity fields', () => {
    const r = servantRegistrationSchema.safeParse({});
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining([
        'full_name', 'evaluation_status', 'is_serving', 'phone',
        'emergency_contact_name', 'emergency_contact_phone', 'gender', 'dob', 'home_address',
      ]),
    );
  });

  it('rejects an impossible date of birth', () => {
    expect(issues(base({ dob: '1990-02-31' })).map((i) => i.path)).toEqual(['dob']);
  });
});
