/**
 * The Registration loading screen renders inside the board layout, so it must not
 * bring a page background of its own -- that was the bug: the root loading screen
 * is cream and replaced the board and the nav while a page loaded.
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import RegistrationLoading from './loading';

describe('RegistrationLoading', () => {
  it('says it is loading, as a status a screen reader announces', () => {
    render(<RegistrationLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('keeps the section heading so the board is not blank', () => {
    render(<RegistrationLoading />);
    expect(screen.getByRole('heading', { name: 'Registration', level: 1 })).toBeInTheDocument();
  });

  it('adds no full-page background or centring of its own', () => {
    const { container } = render(<RegistrationLoading />);
    expect(container.querySelector('.min-h-screen')).toBeNull();
    expect(container.querySelector('.bg-cis-page, .bg-background')).toBeNull();
  });
});
