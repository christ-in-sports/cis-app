import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

import { KID_PHOTO_BUCKET } from '@/lib/validation/photo';

/** Objects per Storage delete call. */
const REMOVE_BATCH = 100;

function tokenMatches(input: string, expected: string) {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Daily cleanup of kid photo uploads that no kid uses (ENG-21 / ENG-23): an
 * abandoned registration form, or a photo a parent replaced that an Admin had
 * uploaded and so could not delete themselves. See
 * `20261023010000_kid_photo_orphans.sql` for which objects count.
 *
 * Called by Vercel Cron (`vercel.json`), which sends `CRON_SECRET` as a bearer
 * token when that environment variable is set. It uses the service role, so it
 * is server-side only and refuses anything without the secret. It never reads
 * or logs a photo, only object names it is deleting.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!cronSecret || !serviceKey || !supabaseUrl) {
    console.error('Missing env: CRON_SECRET / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL');
    return NextResponse.json({ error: 'Cleanup is misconfigured.' }, { status: 500 });
  }

  if (!tokenMatches(request.headers.get('authorization') ?? '', `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.rpc('kid_photo_orphans');
  if (error) {
    console.error('kid_photo_orphans failed:', error.code);
    return NextResponse.json({ error: 'Cleanup failed.' }, { status: 500 });
  }

  const names = ((data ?? []) as { name: string }[]).map((row) => row.name);
  let removed = 0;

  for (let i = 0; i < names.length; i += REMOVE_BATCH) {
    const batch = names.slice(i, i + REMOVE_BATCH);
    const { data: deleted, error: removeError } = await supabase.storage
      .from(KID_PHOTO_BUCKET)
      .remove(batch);
    if (removeError) {
      console.error('Removing orphaned kid photos failed');
      return NextResponse.json({ error: 'Cleanup failed.', removed }, { status: 500 });
    }
    removed += deleted?.length ?? 0;
  }

  return NextResponse.json({ removed });
}
