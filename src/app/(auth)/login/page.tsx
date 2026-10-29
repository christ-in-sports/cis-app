'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import Image from 'next/image';
import { EmailCodeForm, type CodeResult } from '@/components/cis/email-code-form';
import { safeRedirect } from '@/lib/auth/safe-redirect';

/**
 * Asks for a sign-in code for someone who already has an account. `/login` never
 * creates one (`shouldCreateUser: false`): the parent join link does that, with
 * its own code check.
 *
 * An address with no account would otherwise get a different answer from one
 * with an account, which tells a stranger who is registered. So "no account"
 * reads as success here, like the forgot-password page: that person never gets an
 * email, and the code step lets them go back and retype the address.
 */
async function sendLoginCode(email: string): Promise<CodeResult> {
  const { error } = await createClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  if (!error || error.code === 'otp_disabled') return { ok: true };
  if (error.status === 429 || error.code?.startsWith('over_')) {
    return { ok: false, error: 'Too many requests. Please wait a minute and try again.' };
  }
  console.error('signInWithOtp failed:', error.code);
  return { ok: false, error: 'We could not send a code. Please try again.' };
}

async function verifyLoginCode(email: string, token: string): Promise<CodeResult> {
  const { error } = await createClient().auth.verifyOtp({ email, token, type: 'email' });
  if (!error) return { ok: true };
  return {
    ok: false,
    error:
      error.status === 429
        ? 'Too many tries. Please wait a minute and try again.'
        : 'That code did not work. It may have expired. Check it, or send a new code.',
  };
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirect = safeRedirect(searchParams.get('redirect'));
  const urlError = searchParams.get('error');
  const [mode, setMode] = useState<'password' | 'code'>('password');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    urlError === 'link_expired'
      ? 'That link has expired or was already used. Please request a new one.'
      : urlError === 'auth_failed'
      ? 'Sign-in failed. Please try again.'
      : ''
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      window.location.href = redirect;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 safe-top safe-bottom">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <Image
              src="/icons/icon-192.png"
              alt="CIS logo"
              width={150}
              height={150}
              priority
              className="rounded-2xl"
            />
          </div>
          <CardTitle className="text-2xl">Welcome Back</CardTitle>
          <CardDescription>Sign in to CIS</CardDescription>
        </CardHeader>
        <CardContent>
          {mode === 'code' ? (
            <div className="space-y-4">
              <EmailCodeForm
                sendCode={sendLoginCode}
                verifyCode={verifyLoginCode}
                onVerified={() => {
                  window.location.href = redirect;
                }}
              />
              <button
                type="button"
                onClick={() => setMode('password')}
                className="w-full text-sm text-primary hover:underline"
              >
                Use a password instead
              </button>
            </div>
          ) : (
            <>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-sm text-red-400">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-12 text-base"
                />
              </div>
              <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full h-12 text-base"
              onClick={() => setMode('code')}
            >
              Email me a code instead
            </Button>
            </>
          )}

          <div className="mt-6 pt-4 border-t border-border text-center">
            <p className="text-sm text-muted-foreground mb-3">Have the servant signup code?</p>
            <Link
              href="/signup"
              className={buttonVariants({ variant: 'outline', className: 'w-full h-12 text-base' })}
            >
              Sign Up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}