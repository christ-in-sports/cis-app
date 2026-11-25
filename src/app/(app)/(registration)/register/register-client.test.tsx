/**
 * Covers the parent registration flow's behaviour: what the picker says about
 * each kid, which fields are locked for a returning kid, how grade drives
 * division, and that a bad form never reaches the server action.
 *
 * Registration validation is on AGENTS.md §7's must-test list. The schema has
 * its own tests; these check that the screen actually applies it, including the
 * rule that every kid has a photo.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import RegisterClient from './register-client';
import { PhotoError, preparePhoto } from '@/lib/photo/prepare';
import { uploadKidPhoto } from '@/lib/photo/upload';
import type { ParentKid } from '@/lib/registration/parent';
import { WAIVER_PARAGRAPHS, WAIVER_STATEMENTS } from '@/lib/registration/waiver';

const refresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: jest.fn() }),
}));

const registerKid = jest.fn();
jest.mock('./actions', () => ({
  registerKid: (input: unknown) => registerKid(input),
}));

const replaceKidPhoto = jest.fn();
jest.mock('../kid-photo-actions', () => ({
  replaceKidPhoto: (input: unknown) => replaceKidPhoto(input),
}));

// The browser pipeline (canvas, HEIC, Storage) is tested on its own; here it
// just has to hand the form a path.
jest.mock('@/lib/photo/prepare', () => {
  const actual = jest.requireActual('@/lib/photo/prepare');
  return { ...actual, preparePhoto: jest.fn() };
});
jest.mock('@/lib/photo/upload', () => ({ uploadKidPhoto: jest.fn() }));

const PHOTO_PATH = '4f3c1d52-9c7e-4d52-8a35-0b1f2f6c7a11.webp';
const ON_FILE = { photoPath: 'on-file.webp', signedUrl: 'https://signed/on-file' };

const season = { id: 'season-1', name: 'CIS 2026-2027' };
const SIGNED_IN = 'parent@signin.test';

function kid(overrides: Partial<ParentKid> = {}): ParentKid {
  return {
    id: '6f1c3a52-7a4b-4d55-9f44-0a6f3e1c2b10',
    first_name: 'Mina',
    last_name: 'Guirguis',
    dob: '2014-03-02',
    gender: 'male',
    email: null,
    phone: null,
    allergies: null,
    home_address: '1 Church Way, Hayward, CA',
    emergency_contact_name: 'Mariam Guirguis',
    emergency_contact_phone: '(510) 555-0111',
    guardian_name: 'Mariam Guirguis',
    guardian_phone: '(510) 555-0111',
    guardian_email: 'mariam@example.com',
    photo: ON_FILE,
    registration: {
      id: 'reg-1',
      grade: 6,
      division: 'juniors',
      tshirt_size: 'YM',
      top_sports: null,
      plays_outside_league: false,
      outside_sports: null,
      missed_sundays: [],
      on_team: false,
      consent_given_at: '2026-09-28T12:00:00Z',
    },
    ...overrides,
  };
}

const withReg = (patch: Partial<NonNullable<ParentKid['registration']>>) =>
  kid({ registration: { ...kid().registration!, ...patch } });

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const waiverBoxes = () =>
  WAIVER_STATEMENTS.map((s) => screen.getByRole('checkbox', { name: s.text }));
/** Ticks all four waiver statements, which is what agreeing is. */
const agreeToWaiver = () => waiverBoxes().forEach((box) => fireEvent.click(box));

/** Chooses a photo file, as a parent would, and waits for the upload to finish. */
async function choosePhoto(name = 'IMG_1.jpg') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], name, { type: 'image/jpeg' })] } });
  await screen.findByRole('button', { name: 'Replace photo' });
}

beforeEach(() => {
  jest.clearAllMocks();
  URL.createObjectURL = jest.fn(() => 'blob:preview');
  URL.revokeObjectURL = jest.fn();
  jest.mocked(preparePhoto).mockResolvedValue({ blob: new Blob(['x']) } as never);
  jest.mocked(uploadKidPhoto).mockResolvedValue(PHOTO_PATH);
});

describe('the kid picker', () => {
  it('goes straight to a blank form when the parent has no kids yet', () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);

    expect(screen.getByRole('heading', { name: 'About your kid' })).toBeInTheDocument();
    expect(field('Home address').value).toBe('');
    expect(screen.queryByText('Who are you registering?')).not.toBeInTheDocument();
  });

  it('offers the signed-in email as the guardian email on a first kid', () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);

    expect(field('Email')).toHaveValue(SIGNED_IN);
    // The kid's own email is a different field and stays blank.
    expect(screen.getByLabelText(/Kid's email/)).toHaveValue('');
  });

  it('keeps a typed-over guardian email for a sibling, and falls back to the sign-in email when empty', () => {
    const { unmount } = render(<RegisterClient season={season} kids={[kid()]} email={SIGNED_IN} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add another kid' }));
    expect(field('Email')).toHaveValue('mariam@example.com');
    unmount();

    render(<RegisterClient season={season} kids={[kid({ guardian_email: '' })]} email={SIGNED_IN} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add another kid' }));
    expect(field('Email')).toHaveValue(SIGNED_IN);
  });

  it('says when a registration is waiting on the waiver, and when it is done', () => {
    render(
      <RegisterClient
        season={season}
        email={SIGNED_IN}
        kids={[
          withReg({ consent_given_at: null }),
          kid({ id: 'k2', first_name: 'Marina' }),
          kid({ id: 'k3', first_name: 'Peter', registration: null }),
        ]}
      />,
    );

    const mina = screen.getByText('Mina Guirguis').closest('button')!;
    expect(within(mina).getByText('Grade 6 · Waiver needed')).toBeInTheDocument();
    expect(within(mina).getByText('Finish')).toBeInTheDocument();

    const marina = screen.getByText('Marina Guirguis').closest('button')!;
    expect(within(marina).getByText('Grade 6 · Registered')).toBeInTheDocument();
    expect(within(marina).getByText('Review')).toBeInTheDocument();

    const peter = screen.getByText('Peter Guirguis').closest('button')!;
    expect(within(peter).getByText('Not registered this season')).toBeInTheDocument();
    expect(within(peter).getByText('Register')).toBeInTheDocument();
  });

  it('shows each kid’s photo, and says when one is still needed', () => {
    const { container } = render(
      <RegisterClient
        season={season}
        email={SIGNED_IN}
        kids={[kid(), kid({ id: 'k2', first_name: 'Marina', photo: null })]}
      />,
    );

    const mina = screen.getByText('Mina Guirguis').closest('button')!;
    expect(mina.querySelector('img')).toHaveAttribute('src', 'https://signed/on-file');
    expect(within(mina).getByText('Review')).toBeInTheDocument();

    // A kid without a photo is not finished, however complete the rest is.
    const marina = screen.getByText('Marina Guirguis').closest('button')!;
    expect(marina.querySelector('img')).toBeNull();
    expect(within(marina).getByText('MG')).toBeInTheDocument();
    expect(within(marina).getByText('Grade 6 · Registered · Photo needed')).toBeInTheDocument();
    expect(within(marina).getByText('Finish')).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('carries household details to a new kid, but nothing about the child', () => {
    render(<RegisterClient season={season} kids={[kid()]} email={SIGNED_IN} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add another kid' }));

    expect(field('First name').value).toBe('');
    expect(field('Last name').value).toBe('');
    expect(field('Date of birth').value).toBe('');
    expect(field('Home address').value).toBe('1 Church Way, Hayward, CA');
    expect(screen.getAllByLabelText('Name')[0]).toHaveValue('Mariam Guirguis');
    expect(field('Email')).toHaveValue('mariam@example.com');
  });
});

describe('a returning kid', () => {
  it('shows name, birthday and gender as text, not as fields', () => {
    render(<RegisterClient season={season} kids={[kid()]} email={SIGNED_IN} />);
    fireEvent.click(screen.getByText('Mina Guirguis'));

    expect(screen.getByText('March 2, 2014')).toBeInTheDocument();
    expect(screen.getByText('Male')).toBeInTheDocument();
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Date of birth')).not.toBeInTheDocument();
    expect(screen.getByText(/ask an Admin/i)).toBeInTheDocument();
    // What they may still change is editable and pre-filled.
    expect(field('Home address').value).toBe('1 Church Way, Hayward, CA');
  });

  it('leaves the waiver unticked, because consent is given again on every save', () => {
    render(<RegisterClient season={season} kids={[kid()]} email={SIGNED_IN} />);
    fireEvent.click(screen.getByText('Mina Guirguis'));

    for (const box of waiverBoxes()) expect(box).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('sends the returning branch with the kid id, and no locked fields', async () => {
    registerKid.mockResolvedValue({ ok: true });
    render(<RegisterClient season={season} kids={[kid()]} email={SIGNED_IN} />);
    fireEvent.click(screen.getByText('Mina Guirguis'));
    agreeToWaiver();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(registerKid).toHaveBeenCalledTimes(1));
    const sent = registerKid.mock.calls[0][0];
    expect(sent.mode).toBe('returning');
    expect(sent.kid_id).toBe(kid().id);
    for (const locked of ['first_name', 'last_name', 'dob', 'gender']) {
      expect(sent.kid).not.toHaveProperty(locked);
    }
    expect(await screen.findByText('Registration saved')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('keeps the photo on file when none is chosen, and shows it', async () => {
    registerKid.mockResolvedValue({ ok: true });
    render(<RegisterClient season={season} kids={[kid()]} email={SIGNED_IN} />);
    fireEvent.click(screen.getByText('Mina Guirguis'));

    expect(screen.getByRole('button', { name: 'Replace photo' })).toBeInTheDocument();
    agreeToWaiver();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(registerKid).toHaveBeenCalledTimes(1));
    expect(registerKid.mock.calls[0][0].photo_path).toBeUndefined();
  });

  it('sends a replacement photo with the registration', async () => {
    registerKid.mockResolvedValue({ ok: true });
    render(<RegisterClient season={season} kids={[kid()]} email={SIGNED_IN} />);
    fireEvent.click(screen.getByText('Mina Guirguis'));

    await choosePhoto();
    agreeToWaiver();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(registerKid).toHaveBeenCalledTimes(1));
    expect(registerKid.mock.calls[0][0].photo_path).toBe(PHOTO_PATH);
  });

  it('asks for a photo from a kid who has none, and does not submit without one', async () => {
    render(<RegisterClient season={season} kids={[kid({ photo: null })]} email={SIGNED_IN} />);
    fireEvent.click(screen.getByText('Mina Guirguis'));
    agreeToWaiver();

    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(registerKid).not.toHaveBeenCalled();
    expect(screen.getByText('Add a photo of your kid')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add a photo' })).toHaveFocus());
  });

  it('lets that kid be registered once a photo is added', async () => {
    registerKid.mockResolvedValue({ ok: true });
    render(<RegisterClient season={season} kids={[kid({ photo: null })]} email={SIGNED_IN} />);
    fireEvent.click(screen.getByText('Mina Guirguis'));

    await choosePhoto();
    agreeToWaiver();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(registerKid).toHaveBeenCalledTimes(1));
    expect(registerKid.mock.calls[0][0].photo_path).toBe(PHOTO_PATH);
  });

  // The database refuses this too; the screen just should not offer the form.
  it('offers no form once the kid is on a team', () => {
    render(<RegisterClient season={season} kids={[withReg({ on_team: true })]} email={SIGNED_IN} />);
    fireEvent.click(screen.getByText('Mina Guirguis'));

    expect(screen.getByText('Mina Guirguis is on a team')).toBeInTheDocument();
    expect(screen.getByText(/Contact an Admin/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save changes|Register/ })).not.toBeInTheDocument();
  });

  describe('on a team, where only the photo can still change', () => {
    const onTeam = () => withReg({ on_team: true });

    it('replaces the photo at once, with no registration to submit', async () => {
      replaceKidPhoto.mockResolvedValue({ ok: true, photo: { photoPath: PHOTO_PATH, signedUrl: 'https://signed/new' } });
      const kids = [onTeam()];
      const { container } = render(<RegisterClient season={season} kids={kids} email={SIGNED_IN} />);
      fireEvent.click(screen.getByText('Mina Guirguis'));
      expect(screen.getByText('You can still replace their photo.')).toBeInTheDocument();

      await choosePhoto();

      expect(replaceKidPhoto).toHaveBeenCalledWith({ kid_id: kid().id, photo_path: PHOTO_PATH });
      expect(registerKid).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalled();
      expect(container.querySelector('img')).toHaveAttribute('src', 'https://signed/new');
    });

    it('asks for a photo from a kid on a team who has none', async () => {
      replaceKidPhoto.mockResolvedValue({ ok: true, photo: { photoPath: PHOTO_PATH, signedUrl: 'https://signed/new' } });
      render(<RegisterClient season={season} kids={[kid({ photo: null, registration: { ...kid().registration!, on_team: true } })]} email={SIGNED_IN} />);
      fireEvent.click(screen.getByText('Mina Guirguis'));

      expect(screen.getByText(/Add one so coaches can recognise them/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add a photo' })).toBeInTheDocument();

      await choosePhoto();

      expect(screen.queryByText(/Add one so coaches/)).not.toBeInTheDocument();
      expect(screen.getByText('You can still replace their photo.')).toBeInTheDocument();
    });

    it('shows why a replacement was refused, and keeps the photo on screen', async () => {
      replaceKidPhoto.mockResolvedValue({ ok: false, error: 'You can only change the photo of your own kids.' });
      const { container } = render(<RegisterClient season={season} kids={[onTeam()]} email={SIGNED_IN} />);
      fireEvent.click(screen.getByText('Mina Guirguis'));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });

      expect(await screen.findByRole('alert')).toHaveTextContent('your own kids');
      expect(container.querySelector('img')).toHaveAttribute('src', 'https://signed/on-file');
      expect(refresh).not.toHaveBeenCalled();
    });
  });
});

describe('the waiver', () => {
  it('shows the waiver text on the form, above its four statements, with no link out', () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);

    const heading = screen.getByRole('heading', { name: 'Liability waiver' });
    const sheet = heading.parentElement as HTMLElement;
    for (const paragraph of WAIVER_PARAGRAPHS) {
      expect(within(sheet).getByText(paragraph)).toBeInTheDocument();
    }
    expect(waiverBoxes()).toHaveLength(4);
    // The release reads before the first box that agrees to "the statement above".
    const release = within(sheet).getByText(WAIVER_PARAGRAPHS[0]);
    expect(release.compareDocumentPosition(waiverBoxes()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(sheet).queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('paying for registration', () => {
  it('links to Venmo with $100 and a note naming the kid being typed', () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);

    const venmo = () => screen.getByRole('link', { name: 'Pay $100 with Venmo' });
    expect(new URL(venmo().getAttribute('href')!).searchParams.get('note')).toBe('CIS Registration');

    fireEvent.change(field('First name'), { target: { value: 'Marina' } });
    fireEvent.change(field('Last name'), { target: { value: 'Guirguis' } });

    const url = new URL(venmo().getAttribute('href')!);
    expect(url.hostname).toBe('account.venmo.com');
    expect(url.searchParams.get('recipients')).toBe('CIS-stantonios');
    expect(url.searchParams.get('amount')).toBe('100');
    expect(url.searchParams.get('note')).toBe('Marina Guirguis CIS Registration');
    expect(venmo()).toHaveAttribute('target', '_blank');
  });

  it('tries the Venmo app on a phone, and just follows the link on a computer', () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);
    const venmo = screen.getByRole('link', { name: 'Pay $100 with Venmo' });

    // A computer: the click is left alone, so the website opens in a new tab.
    expect(fireEvent.click(venmo)).toBe(true);

    // A phone: the click is taken over to open the app instead.
    const ua = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    );
    const error = jest.spyOn(console, 'error').mockImplementation(() => {}); // jsdom cannot navigate
    try {
      expect(fireEvent.click(venmo)).toBe(false);
    } finally {
      ua.mockRestore();
      error.mockRestore();
    }
  });

  it('offers the Venmo website in a new tab, for a phone without the app', () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);
    fireEvent.change(field('First name'), { target: { value: 'Marina' } });
    fireEvent.change(field('Last name'), { target: { value: 'Guirguis' } });

    const web = screen.getByRole('link', { name: 'Pay on the Venmo website' });
    expect(web).toHaveAttribute('target', '_blank');
    const url = new URL(web.getAttribute('href')!);
    expect(url.hostname).toBe('account.venmo.com');
    expect(url.searchParams.get('note')).toBe('Marina Guirguis CIS Registration');
  });

  it('uses a returning kid\'s name in the Venmo note', () => {
    render(<RegisterClient season={season} kids={[kid()]} email={SIGNED_IN} />);
    fireEvent.click(screen.getByText('Mina Guirguis'));

    const href = screen.getByRole('link', { name: 'Pay $100 with Venmo' }).getAttribute('href')!;
    expect(new URL(href).searchParams.get('note')).toBe('Mina Guirguis CIS Registration');
  });

  it('lists every way to pay, with the $100 fee, before the waiver', () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);

    const heading = screen.getByRole('heading', { name: 'Paying for registration' });
    const sheet = heading.parentElement as HTMLElement;
    expect(within(sheet).getByText('$100')).toBeInTheDocument();
    expect(within(sheet).getByText('Give it to Maria Ehab or Joseph Tadrous')).toBeInTheDocument();
    expect(within(sheet).getByText('@CIS-stantonios')).toBeInTheDocument();

    const paypal = within(sheet).getByRole('link', { name: 'paypal.me/ChristinSports' });
    expect(paypal).toHaveAttribute('href', 'https://paypal.me/ChristinSports/');
    expect(paypal).toHaveAttribute('target', '_blank');
    expect(paypal.getAttribute('rel')).toContain('noopener');

    // Read top to bottom, a parent learns how to pay before agreeing and submitting.
    const waiver = screen.getByRole('heading', { name: 'Liability waiver' });
    expect(heading.compareDocumentPosition(waiver) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // ENG-9: the form must never say whether a kid has paid, for a new kid or a
  // returning one.
  it('says nothing about whether a kid has paid', () => {
    render(<RegisterClient season={season} kids={[kid()]} email={SIGNED_IN} />);
    expect(screen.queryByText(/\b(paid|unpaid|balance|owe)\b/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Mina Guirguis/ }));
    expect(screen.getByRole('heading', { name: 'Paying for registration' })).toBeInTheDocument();
    expect(screen.queryByText(/\b(paid|unpaid|balance|owe)\b/i)).not.toBeInTheDocument();
  });
});

describe('grade and division', () => {
  const division = (name: 'juniors' | 'ambassadors') =>
    document.querySelector(`input[name=division][value=${name}]`) as HTMLInputElement;

  it('sets the division from the grade and locks it', () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);

    fireEvent.change(field('Grade'), { target: { value: '5' } });
    expect(division('juniors')).toBeChecked();
    expect(division('juniors')).toBeDisabled();
    expect(division('ambassadors')).toBeDisabled();

    fireEvent.change(field('Grade'), { target: { value: '9' } });
    expect(division('ambassadors')).toBeChecked();
    expect(division('ambassadors')).toBeDisabled();
  });

  it('lets grade 7 choose either', () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);

    fireEvent.change(field('Grade'), { target: { value: '7' } });
    expect(division('juniors')).toBeEnabled();
    expect(division('ambassadors')).toBeEnabled();

    fireEvent.click(division('ambassadors'));
    expect(division('ambassadors')).toBeChecked();
  });

  it('does not allow a division before a grade is chosen', () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);

    expect(division('juniors')).toBeDisabled();
    expect(screen.getByText('Choose a grade first.')).toBeInTheDocument();
  });
});

describe('submitting a new kid', () => {
  function fillValid() {
    fireEvent.change(field('First name'), { target: { value: 'Marina' } });
    fireEvent.change(field('Last name'), { target: { value: 'Guirguis' } });
    fireEvent.change(field('Date of birth'), { target: { value: '2012-05-20' } });
    fireEvent.click(screen.getByLabelText('Female'));
    fireEvent.change(field('Home address'), { target: { value: '1 Church Way' } });
    fireEvent.change(field('Grade'), { target: { value: '6' } });
    fireEvent.click(screen.getByLabelText('M'));
    fireEvent.click(screen.getByLabelText('No'));
    const names = screen.getAllByLabelText('Name');
    const phones = screen.getAllByLabelText('Phone');
    fireEvent.change(names[0], { target: { value: 'Mariam Guirguis' } });
    fireEvent.change(phones[0], { target: { value: '555-0111' } });
    fireEvent.change(field('Email'), { target: { value: 'mariam@example.com' } });
    fireEvent.change(names[1], { target: { value: 'Peter Guirguis' } });
    fireEvent.change(phones[1], { target: { value: '555-0122' } });
  }

  it('shows every problem, focuses the first, and never calls the server', () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(registerKid).not.toHaveBeenCalled();
    // "Choose a grade" is also the select's placeholder option, so read the
    // messages from the alerts rather than by text.
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts).toEqual(
      expect.arrayContaining([
        'Add a photo of your kid',
        'First name is required',
        'Last name is required',
        'Choose a grade',
        'Choose a T-shirt size',
        'Tick all four boxes to agree to the waiver',
        'Please fix the fields marked above.',
      ]),
    );

    // Errors are danger red with a warning icon, the Sports screens' treatment,
    // so they stand out on a long form and ember keeps meaning "a score".
    for (const alert of screen.getAllByRole('alert')) {
      expect(alert).toHaveClass('text-cis-danger');
      expect(alert).not.toHaveClass('text-cis-sport-text');
      expect(alert.querySelector('svg')).not.toBeNull();
    }
    expect(field('First name')).toHaveAttribute('aria-invalid', 'true');

    // The photo is the first thing on the form, so it is the first problem.
    return waitFor(() => expect(screen.getByRole('button', { name: 'Add a photo' })).toHaveFocus());
  });

  it('will not submit without a photo, and says so beside the photo', async () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);
    fillValid();
    agreeToWaiver();

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(registerKid).not.toHaveBeenCalled();
    const group = screen.getByRole('group', { name: 'Photo' });
    expect(within(group).getByRole('alert')).toHaveTextContent('Add a photo of your kid');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add a photo' })).toHaveFocus());
  });

  it('takes the photo error away once a photo is added', async () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    const group = screen.getByRole('group', { name: 'Photo' });
    expect(within(group).getByRole('alert')).toBeInTheDocument();

    await choosePhoto();

    expect(within(group).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows what the photo step says when it fails, and nothing is sent', async () => {
    jest.mocked(preparePhoto).mockRejectedValue(new PhotoError('heic-failed', 'That photo could not be converted. Choose a JPEG instead.'));
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'IMG_1.HEIC')] } });

    expect(await screen.findByText(/Choose a JPEG instead/)).toBeInTheDocument();
    expect(registerKid).not.toHaveBeenCalled();
  });

  it('will not submit without the waiver', async () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);
    await choosePhoto();
    fillValid();

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(registerKid).not.toHaveBeenCalled();
    expect(screen.getByText('Tick all four boxes to agree to the waiver')).toBeInTheDocument();
  });

  it('will not submit with only three of the four waiver boxes ticked', async () => {
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);
    await choosePhoto();
    fillValid();
    waiverBoxes().slice(0, 3).forEach((box) => fireEvent.click(box));

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(registerKid).not.toHaveBeenCalled();
    expect(screen.getByText('Tick all four boxes to agree to the waiver')).toBeInTheDocument();

    // Ticking the last one clears the error and lets the form go.
    registerKid.mockResolvedValue({ ok: true, kidId: 'k', registrationId: 'r' });
    fireEvent.click(waiverBoxes()[3]);
    expect(screen.queryByText('Tick all four boxes to agree to the waiver')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(registerKid).toHaveBeenCalledWith(expect.objectContaining({ consent: true })));
  });

  it('sends a valid registration and shows the done screen', async () => {
    registerKid.mockResolvedValue({ ok: true, kidId: 'k', registrationId: 'r' });
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);
    await choosePhoto();
    fillValid();
    agreeToWaiver();

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(registerKid).toHaveBeenCalledTimes(1));
    const sent = registerKid.mock.calls[0][0];
    expect(sent.mode).toBe('new');
    expect(sent.photo_path).toBe(PHOTO_PATH);
    expect(sent.consent).toBe(true);
    expect(sent.kid).toMatchObject({ first_name: 'Marina', gender: 'female', dob: '2012-05-20' });
    expect(sent.registration).toMatchObject({ grade: 6, division: 'juniors', tshirt_size: 'M' });

    expect(await screen.findByText('Registered')).toBeInTheDocument();
    expect(screen.getByText('Marina Guirguis')).toBeInTheDocument();
  });

  it('shows the server\'s per-field errors and stays on the form', async () => {
    registerKid.mockResolvedValue({
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: { 'kid.guardian_email': ['Parent/guardian email is not a valid email address'] },
    });
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);
    await choosePhoto();
    fillValid();
    agreeToWaiver();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(
      await screen.findByText('Parent/guardian email is not a valid email address'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Registered')).not.toBeInTheDocument();
  });

  it('shows a whole-form error, such as a duplicate kid, without field errors', async () => {
    registerKid.mockResolvedValue({
      ok: false,
      error: 'You have already added a kid with that name and date of birth.',
    });
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);
    await choosePhoto();
    fillValid();
    agreeToWaiver();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText(/already added a kid/)).toBeInTheDocument();
    expect(screen.queryByText('Registered')).not.toBeInTheDocument();
  });

  it('shows the server\'s photo errors beside the photo', async () => {
    registerKid.mockResolvedValue({
      ok: false,
      error: 'The photo upload was not found. Choose the photo again.',
      fieldErrors: { photo_path: ['Choose the photo again'] },
    });
    render(<RegisterClient season={season} kids={[]} email={SIGNED_IN} />);
    await choosePhoto();
    fillValid();
    agreeToWaiver();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    const group = screen.getByRole('group', { name: 'Photo' });
    expect(await within(group).findByText('Choose the photo again')).toBeInTheDocument();
  });
});
