/**
 * Where to send someone after they sign in.
 *
 * `/login?redirect=` comes from the address bar, so it can hold anything. Only a
 * path on this site is followed; `https://evil.example` and `//evil.example`
 * (which a browser reads as another host) fall back to home. The callback route
 * applies the same rule to `next`.
 */
export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
    return fallback;
  }
  return target;
}
