import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { codeMatches } from '@/lib/auth/join-code';

/**
 * Servant signup. One shared code (SERVANT_SIGNUP_CODE, passed around the
 * servants' group chat) creates an account with NO role. An Admin grants roles
 * afterwards; the code never decides what someone can do.
 */
export async function POST(request: Request) {
  let body: {
    email?: unknown;
    password?: unknown;
    displayName?: unknown;
    signupCode?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { email, password, displayName, signupCode } = body;

  const expectedCode = process.env.SERVANT_SIGNUP_CODE;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!expectedCode || !serviceKey || !supabaseUrl) {
    console.error('Missing env: SERVANT_SIGNUP_CODE / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL');
    return NextResponse.json({ error: 'Signup is misconfigured.' }, { status: 500 });
  }

  if (typeof signupCode !== 'string' || !codeMatches(signupCode.trim(), expectedCode)) {
    await new Promise((r) => setTimeout(r, 700)); // slow down guessing
    return NextResponse.json({ error: 'Invalid signup code.' }, { status: 403 });
  }

  // Validate — never trust the client's own checks
  if (
    typeof email !== 'string' ||
    !email.includes('@') ||
    typeof password !== 'string' ||
    password.length < 10
  ) {
    return NextResponse.json(
      { error: 'Valid email and a password of at least 10 characters are required.' },
      { status: 400 }
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const cleanName =
    typeof displayName === 'string' && displayName.trim() ? displayName.trim() : null;

  const { error } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { display_name: cleanName },
  });

  if (error) {
    console.error('createUser failed:', error.message);
    const msg = /already|registered|exists/i.test(error.message)
      ? 'An account with that email already exists.'
      : 'Could not create account.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
