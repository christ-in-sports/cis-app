import { fireEvent, render } from '@testing-library/react';

import { KidAvatar, initialsOf } from './kid-avatar';

const photo = (path: string, url: string | null) => ({ photoPath: path, signedUrl: url });
const img = (container: HTMLElement) => container.querySelector('img');

describe('initialsOf', () => {
  it('takes the first letter of each name, in capitals', () => {
    expect(initialsOf('mina', 'hanna')).toBe('MH');
  });

  it('copes with a missing or blank name, and never comes back empty', () => {
    expect(initialsOf('Mina', '')).toBe('M');
    expect(initialsOf('  ', '')).toBe('—');
  });
});

describe('KidAvatar -- what it shows', () => {
  it('shows the initials for a kid with no photo', () => {
    const { container, getByText } = render(<KidAvatar firstName="Mina" lastName="Hanna" />);

    expect(getByText('MH')).toBeInTheDocument();
    expect(img(container)).toBeNull();
  });

  it('shows the initials when the photo has no link, because signing failed', () => {
    const { container, getByText } = render(
      <KidAvatar firstName="Mina" lastName="Hanna" photo={photo('a.webp', null)} />
    );

    expect(getByText('MH')).toBeInTheDocument();
    expect(img(container)).toBeNull();
  });

  it('shows the photo, as decoration, because the name is beside it', () => {
    const { container, queryByText } = render(
      <KidAvatar firstName="Mina" lastName="Hanna" photo={photo('a.webp', 'https://signed/a?t=1')} />
    );

    expect(img(container)).toHaveAttribute('src', 'https://signed/a?t=1');
    expect(img(container)).toHaveAttribute('alt', '');
    expect(queryByText('MH')).toBeNull();
  });

  it('is a square with the chip radius, never a circle', () => {
    const { container } = render(<KidAvatar firstName="Mina" lastName="Hanna" size="lg" />);

    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toContain('rounded-cis-chip');
    expect(box.className).not.toMatch(/rounded-full|rounded-cis-pill/);
    expect(box.className).toMatch(/\bh-28\b/);
    expect(box.className).toMatch(/\bw-28\b/);
  });
});

describe('KidAvatar -- keeping the link steady across refreshes', () => {
  it('ignores a fresh link for the same photo, so the browser keeps its cached image', () => {
    const { container, rerender } = render(
      <KidAvatar firstName="Mina" lastName="Hanna" photo={photo('a.webp', 'https://signed/a?t=1')} />
    );

    // The attendance page re-reads the roster every 10 seconds, signing again.
    rerender(<KidAvatar firstName="Mina" lastName="Hanna" photo={photo('a.webp', 'https://signed/a?t=2')} />);
    rerender(<KidAvatar firstName="Mina" lastName="Hanna" photo={photo('a.webp', 'https://signed/a?t=3')} />);

    expect(img(container)).toHaveAttribute('src', 'https://signed/a?t=1');
  });

  it('switches when the photo itself is replaced', () => {
    const { container, rerender } = render(
      <KidAvatar firstName="Mina" lastName="Hanna" photo={photo('a.webp', 'https://signed/a?t=1')} />
    );

    rerender(<KidAvatar firstName="Mina" lastName="Hanna" photo={photo('b.webp', 'https://signed/b?t=2')} />);

    expect(img(container)).toHaveAttribute('src', 'https://signed/b?t=2');
  });

  it('takes the newest link when the kept one stops working because it expired', () => {
    const { container, rerender } = render(
      <KidAvatar firstName="Mina" lastName="Hanna" photo={photo('a.webp', 'https://signed/a?t=1')} />
    );
    rerender(<KidAvatar firstName="Mina" lastName="Hanna" photo={photo('a.webp', 'https://signed/a?t=2')} />);
    expect(img(container)).toHaveAttribute('src', 'https://signed/a?t=1');

    fireEvent.error(img(container)!);

    expect(img(container)).toHaveAttribute('src', 'https://signed/a?t=2');
  });

  it('falls back to the initials when the newest link fails too', () => {
    const { container, getByText, rerender } = render(
      <KidAvatar firstName="Mina" lastName="Hanna" photo={photo('a.webp', 'https://signed/a?t=1')} />
    );
    rerender(<KidAvatar firstName="Mina" lastName="Hanna" photo={photo('a.webp', 'https://signed/a?t=2')} />);

    fireEvent.error(img(container)!);
    fireEvent.error(img(container)!);

    expect(img(container)).toBeNull();
    expect(getByText('MH')).toBeInTheDocument();
  });

  it('falls back to the initials when the only link fails', () => {
    const { container, getByText } = render(
      <KidAvatar firstName="Mina" lastName="Hanna" photo={photo('a.webp', 'https://signed/a?t=1')} />
    );

    fireEvent.error(img(container)!);

    expect(img(container)).toBeNull();
    expect(getByText('MH')).toBeInTheDocument();
  });

  it('shows the new photo again after a failure, once the kid has a different one', () => {
    const { container, rerender } = render(
      <KidAvatar firstName="Mina" lastName="Hanna" photo={photo('a.webp', 'https://signed/a?t=1')} />
    );
    fireEvent.error(img(container)!);
    expect(img(container)).toBeNull();

    rerender(<KidAvatar firstName="Mina" lastName="Hanna" photo={photo('b.webp', 'https://signed/b?t=2')} />);

    expect(img(container)).toHaveAttribute('src', 'https://signed/b?t=2');
  });

  it('goes back to the initials when the photo is taken away', () => {
    const { container, getByText, rerender } = render(
      <KidAvatar firstName="Mina" lastName="Hanna" photo={photo('a.webp', 'https://signed/a?t=1')} />
    );

    rerender(<KidAvatar firstName="Mina" lastName="Hanna" photo={null} />);

    expect(img(container)).toBeNull();
    expect(getByText('MH')).toBeInTheDocument();
  });
});
