import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

function codeMatches(input: string, expected: string) {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type Role = 'staff' | 'coach';

export async function POST(request: Request) {
  let body: {
    email?: unknown;
    password?: unknown;
    displayName?: unknown;
    adminCode?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { email, password, displayName, adminCode } = body;

  const staffCode = process.env.STAFF_SIGNUP_CODE ?? process.env.ADMIN_SIGNUP_CODE;
  const coachCode = process.env.COACH_SIGNUP_CODE;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!staffCode || !coachCode || !serviceKey || !supabaseUrl) {
    console.error('Missing env: STAFF_SIGNUP_CODE / COACH_SIGNUP_CODE / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL');
    return NextResponse.json({ error: 'Signup is misconfigured.' }, { status: 500 });
  }

  // Guard against the two codes being identical — coach would silently win
  if (staffCode === coachCode) {
    console.error('STAFF_SIGNUP_CODE and COACH_SIGNUP_CODE must differ.');
    return NextResponse.json({ error: 'Signup is misconfigured.' }, { status: 500 });
  }

  // 1. Which code was used? Check staff first.
  let role: Role | null = null;
  if (typeof adminCode === 'string') {
    const trimmed = adminCode.trim();
    if (codeMatches(trimmed, staffCode)) role = 'staff';
    else if (codeMatches(trimmed, coachCode)) role = 'coach';
  }

  if (!role) {
    await new Promise((r) => setTimeout(r, 700)); // slow down guessing
    return NextResponse.json({ error: 'Invalid signup code.' }, { status: 403 });
  }

  // 2. Validate — never trust the client's own checks
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
    // signup_role is read by handle_new_user(). Server-set only.
    user_metadata: { display_name: cleanName, signup_role: role },
  });

  if (error) {
    console.error('createUser failed:', error.message);
    const msg = /already|registered|exists/i.test(error.message)
      ? 'An account with that email already exists.'
      : 'Could not create account.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true, role });
}