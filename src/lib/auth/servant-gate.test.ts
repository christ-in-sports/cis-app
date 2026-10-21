import { redirectIfRoleless } from './servant-gate';

const redirect = jest.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
jest.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }));

const hasAnyRole = jest.fn();
jest.mock('./roles', () => ({ hasAnyRole: () => hasAnyRole() }));

beforeEach(() => {
  redirect.mockClear();
  hasAnyRole.mockReset();
});

describe('redirectIfRoleless', () => {
  it('sends a signed-in user with no role to the servant form', async () => {
    hasAnyRole.mockResolvedValue({ userId: 'u1', hasRole: false });
    await expect(redirectIfRoleless()).rejects.toThrow('NEXT_REDIRECT /servant-registration');
  });

  it('lets a user with a role through', async () => {
    hasAnyRole.mockResolvedValue({ userId: 'u1', hasRole: true });
    await expect(redirectIfRoleless()).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('leaves a signed-out visitor to the login redirects', async () => {
    hasAnyRole.mockResolvedValue({ userId: null, hasRole: false });
    await expect(redirectIfRoleless()).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});
