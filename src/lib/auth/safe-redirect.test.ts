import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it('follows a path on this site, query and all', () => {
    expect(safeRedirect('/register')).toBe('/register');
    expect(safeRedirect('/sports?division=juniors')).toBe('/sports?division=juniors');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'register',
    '',
    null,
    undefined,
  ])('falls back to home for %p', (target) => {
    expect(safeRedirect(target)).toBe('/');
  });
});
