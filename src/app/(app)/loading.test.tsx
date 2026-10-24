/**
 * The app shell's loading screen renders inside the board layout, so it must not
 * bring a page background of its own: the root loading screen is cream and would
 * replace the board and the bottom bar while a page loads.
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import AppLoading from './loading';

describe('AppLoading', () => {
  it('says it is loading, as a status a screen reader announces', () => {
    render(<AppLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('adds no full-page background or centring of its own', () => {
    const { container } = render(<AppLoading />);
    expect(container.querySelector('.min-h-screen')).toBeNull();
    expect(container.querySelector('.bg-cis-page, .bg-background')).toBeNull();
  });
});
