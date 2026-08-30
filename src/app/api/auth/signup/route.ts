import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

function codeMatches(input: string, expected: string) {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { email, password, displayName, adminCode } = body;

  const expected = process.env.ADMIN_SIGNUP_CODE;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!expected || !serviceKey) {
    console.error('Missing ADMIN_SIGNUP_CODE or SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json({ error: 'Signup is misconfigured.' }, { status: 500 });
  }

  // Check the code first, before touching anything else
  if (typeof adminCode !== 'string' || !codeMatches(adminCode.trim(), expected)) {
    await new Promise((r) => setTimeout(r, 700)); // slow down guessing
    return NextResponse.json({ error: 'Invalid admin code.' }, { status: 403 });
  }

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

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: false,
    user_metadata: { display_name: displayName?.trim() || null },
  });

  if (error) {
    const msg = /already|registered|exists/i.test(error.message)
      ? 'An account with that email already exists.'
      : 'Could not create account.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}