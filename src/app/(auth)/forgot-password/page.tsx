'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/callback?next=/reset-password` }
    );

    setLoading(false);

    if (error) {
      // Rate limiting is the only error worth surfacing. Everything else
      // stays vague so we never reveal which emails have accounts.
      if (/rate|limit|too many/i.test(error.message)) {
        setError('Too many requests. Please wait a few minutes and try again.');
        return;
      }
    }

    // Always show success, even on failure — see note below
    setSent(true);
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 safe-top safe-bottom">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="text-4xl mb-2">✉️</div>
            <CardTitle>Check Your Email</CardTitle>
            <CardDescription>
              If an account exists for <strong>{email}</strong>, we&apos;ve sent a password
              reset link. It expires in 1 hour. Check your spam folder too.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full h-12">
              <Link href="/login">Back to Login</Link>
            </Button>
            <Button
              variant="ghost"
              className="w-full h-12"
              onClick={() => {
                setSent(false);
                setError('');
              }}
            >
              Use a different email
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 safe-top safe-bottom">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">🔑</div>
          <CardTitle className="text-2xl">Forgot Password</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a reset link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="space-y-4">
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
            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Remembered it?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}