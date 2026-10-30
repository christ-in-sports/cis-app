/**
 * The "Attach to parent" control: that the Admin sees who they are about to give
 * a kid's records to before anything is written, that a wrong email or a failed
 * attach is explained, and that a kid who already has a parent offers nothing.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { AttachParent } from './attach-parent';
import type { AttachKidResult, FindParentResult } from './actions';

const onFind = jest.fn<Promise<FindParentResult>, [string]>();
const onAttach = jest.fn<Promise<AttachKidResult>, [string]>();

const mariam = { name: 'Mariam Guirguis', email: 'mariam@example.com' };

function renderPanel(props: { hasParent?: boolean } = {}) {
  return render(
    <AttachParent
      kidName="Mina Guirguis"
      hasParent={props.hasParent ?? false}
      suggestedEmail="mariam@example.com"
      onFind={onFind}
      onAttach={onAttach}
    />,
  );
}

const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

beforeEach(() => {
  onFind.mockReset().mockResolvedValue({ ok: true, parent: mariam });
  onAttach.mockReset().mockResolvedValue({ ok: true, parent: mariam });
});

describe('a kid with no parent account', () => {
  it('says so and offers to attach', () => {
    renderPanel();

    expect(screen.getByText('Not attached')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attach to parent' })).toBeInTheDocument();
  });

  it('suggests the guardian email from the form, but does not use it on its own', async () => {
    renderPanel();
    await click('Attach to parent');

    expect(screen.getByLabelText(/Parent's email/)).toHaveValue('mariam@example.com');
    expect(onFind).not.toHaveBeenCalled();
    expect(onAttach).not.toHaveBeenCalled();
  });

  it('reads the parent back and writes nothing until the Admin confirms', async () => {
    renderPanel();
    await click('Attach to parent');
    await click('Find parent');

    expect(onFind).toHaveBeenCalledWith('mariam@example.com');
    expect(screen.getByText('Mariam Guirguis')).toBeInTheDocument();
    expect(screen.getByText(/address, emergency contact, photo and payments/)).toBeInTheDocument();
    expect(onAttach).not.toHaveBeenCalled();
  });

  it('attaches the email that was confirmed, not whatever is typed later', async () => {
    renderPanel();
    await click('Attach to parent');
    fireEvent.change(screen.getByLabelText(/Parent's email/), { target: { value: 'other@example.com' } });
    onFind.mockResolvedValue({ ok: true, parent: { name: 'Other Parent', email: 'other@example.com' } });
    await click('Find parent');
    await click('Attach');

    expect(onAttach).toHaveBeenCalledTimes(1);
    expect(onAttach).toHaveBeenCalledWith('other@example.com');
  });

  it('goes back to change the email', async () => {
    renderPanel();
    await click('Attach to parent');
    await click('Find parent');
    await click('Back');

    expect(screen.getByLabelText(/Parent's email/)).toBeInTheDocument();
    expect(onAttach).not.toHaveBeenCalled();
  });

  it('explains an email that matches no parent, and stays on the email step', async () => {
    onFind.mockResolvedValue({ ok: false, error: 'No account has that email. The parent needs to join first.' });
    renderPanel();
    await click('Attach to parent');
    await click('Find parent');

    expect(screen.getByRole('alert')).toHaveTextContent('No account has that email');
    expect(screen.getByLabelText(/Parent's email/)).toBeInTheDocument();
  });

  it('keeps the confirmation and says why when the attach fails', async () => {
    onAttach.mockResolvedValue({ ok: false, error: 'That kid already has a parent, or no longer exists.' });
    renderPanel();
    await click('Attach to parent');
    await click('Find parent');
    await click('Attach');

    expect(screen.getByRole('alert')).toHaveTextContent('already has a parent');
    expect(screen.getByRole('button', { name: 'Attach' })).toBeEnabled();
  });

  it('cancels without asking anything', async () => {
    renderPanel();
    await click('Attach to parent');
    await click('Cancel');

    expect(screen.getByRole('button', { name: 'Attach to parent' })).toBeInTheDocument();
    expect(onFind).not.toHaveBeenCalled();
  });

  it('attaches once even if Attach is pressed twice', async () => {
    let finish: (r: AttachKidResult) => void = () => {};
    onAttach.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderPanel();
    await click('Attach to parent');
    await click('Find parent');
    const attach = screen.getByRole('button', { name: 'Attach' });
    await act(async () => {
      fireEvent.click(attach);
      fireEvent.click(attach);
    });
    await act(async () => finish({ ok: true, parent: mariam }));

    expect(onAttach).toHaveBeenCalledTimes(1);
  });
});

describe('a kid who already has a parent account', () => {
  it('says attached and offers no way to move them', () => {
    renderPanel({ hasParent: true });

    expect(screen.getByText('Attached')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach to parent' })).not.toBeInTheDocument();
  });
});
