/**
 * A button must never turn see-through on hover or press. A secondary button can
 * sit directly on the dark board (Sign out in More); if its hover colour is
 * translucent the board shows through. Pin the hover and active colours to
 * opaque ones (`DESIGN_SYSTEM.md` §3).
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { DangerButton, PrimaryButton, SecondaryButton } from './button';

const translucent = /(?:hover|active|focus):bg-\[(?:rgba|hsla)|(?:hover|active|focus):bg-[a-z-]+\/\d/;

describe.each([
  ['PrimaryButton', PrimaryButton],
  ['SecondaryButton', SecondaryButton],
  ['DangerButton', DangerButton],
])('%s', (_name, Button) => {
  it('has no translucent hover, active or focus background', () => {
    render(<Button>Press</Button>);
    expect(screen.getByRole('button').className).not.toMatch(translucent);
  });
});

describe('SecondaryButton', () => {
  it('keeps an opaque fill and hovers to an opaque paper tone', () => {
    render(<SecondaryButton>Sign out</SecondaryButton>);
    const { className } = screen.getByRole('button');
    expect(className).toContain('bg-cis-paper-light');
    expect(className).toContain('hover:bg-cis-paper');
  });
});
