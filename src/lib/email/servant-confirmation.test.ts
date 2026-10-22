import { buildServantConfirmation, escapeHtml } from './servant-confirmation';

const base = {
  fullName: 'Mina Hanna',
  seasonName: 'CIS 2026-2027',
  formUrl: 'https://cis.example/servant-registration',
  registration: {
    is_serving: true,
    sessions: ['juniors', 'ambassadors'] as ('juniors' | 'ambassadors')[],
    juniors_subteams: ['coaches', 'prayer'] as ('coaches' | 'prayer')[],
    ambassadors_subteams: [] as never[],
    juniors_other: null,
    ambassadors_other: 'Photography',
    dates_missing: 'Feb 7',
  },
};

describe('buildServantConfirmation', () => {
  it('summarises the sessions and teams chosen', () => {
    const { subject, text } = buildServantConfirmation(base);
    expect(subject).toContain('CIS 2026-2027');
    expect(text).toContain('Juniors: Coaches, Prayer Team');
    expect(text).toContain('Ambassadors: Other: Photography');
    expect(text).toContain('Dates you will miss: Feb 7');
    expect(text).toContain(base.formUrl);
  });

  it('says so when the servant is not serving', () => {
    const { text } = buildServantConfirmation({
      ...base,
      registration: { ...base.registration, is_serving: false, sessions: [], dates_missing: null },
    });
    expect(text).toContain('not serving a session');
    expect(text).not.toContain('Juniors:');
  });

  // The email lives in an inbox; none of these belong there.
  it('never includes the date of birth, home address or emergency contact', () => {
    const { text, html } = buildServantConfirmation({
      ...base,
      // Extra fields on the object must not leak into the message.
      registration: {
        ...base.registration,
        dob: '1990-04-02',
        home_address: '1 Main St',
        emergency_contact_name: 'Sara',
        emergency_contact_phone: '5105559876',
      } as typeof base.registration,
    });
    for (const secret of ['1990-04-02', '1 Main St', 'Sara', '5105559876']) {
      expect(text).not.toContain(secret);
      expect(html).not.toContain(secret);
    }
  });

  it('escapes what a servant typed in the HTML body', () => {
    const { html } = buildServantConfirmation({
      ...base,
      fullName: '<script>x</script>',
    });
    expect(html).not.toContain('<script>');
    expect(escapeHtml(`a&b<"'`)).toBe('a&amp;b&lt;&quot;&#39;');
  });
});
