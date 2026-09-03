import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { identityKey, type RegistrationInput } from '@/lib/registration-csv';

const MAX_ROWS = 3000;

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_staff')
    .eq('id', user.id)
    .single();

  if (!profile?.is_staff) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 });
  }

  let body: { rows?: RegistrationInput[]; mode?: 'update' | 'skip' };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const rows = body.rows ?? [];
  const mode = body.mode === 'skip' ? 'skip' : 'update';

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows to import.' }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (${rows.length}). Limit is ${MAX_ROWS}.` },
      { status: 400 }
    );
  }

  // Existing records, for match-by-identity
  const { data: existing, error: fetchErr } = await supabase
    .from('registrations')
    .select('id, first_name, last_name, dob');

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const existingByKey = new Map<string, string>();
  (existing ?? []).forEach((r) => existingByKey.set(identityKey(r), r.id));

  const toInsert: any[] = [];
  const toUpdate: { id: string; payload: any }[] = [];
  const seenInFile = new Set<string>();
  let duplicatesInFile = 0;

  for (const row of rows) {
    if (!row?.first_name || !row?.last_name) continue;

    const key = identityKey(row);
    if (seenInFile.has(key)) {
      duplicatesInFile++;
      continue;
    }
    seenInFile.add(key);

    const payload = { ...row, source: 'import' };
    const existingId = existingByKey.get(key);

    if (existingId) {
      if (mode === 'update') toUpdate.push({ id: existingId, payload });
    } else {
      toInsert.push({ ...payload, created_by: user.id });
    }
  }

  let inserted = 0;
  const errors: string[] = [];

  // Chunk inserts so one huge request doesn't time out
  for (let i = 0; i < toInsert.length; i += 400) {
    const chunk = toInsert.slice(i, i + 400);
    const { error, count } = await supabase
      .from('registrations')
      .insert(chunk, { count: 'exact' });
    if (error) errors.push(error.message);
    else inserted += count ?? chunk.length;
  }

  let updated = 0;
  for (const u of toUpdate) {
    const { error } = await supabase
      .from('registrations')
      .update(u.payload)
      .eq('id', u.id);
    if (error) errors.push(error.message);
    else updated++;
  }

  return NextResponse.json({
    ok: errors.length === 0,
    inserted,
    updated,
    skipped: mode === 'skip' ? toUpdate.length + (rows.length - seenInFile.size) : 0,
    duplicatesInFile,
    errors: errors.slice(0, 5),
  });
}