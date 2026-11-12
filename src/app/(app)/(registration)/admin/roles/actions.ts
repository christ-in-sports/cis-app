'use server';

/**
 * Grants and revokes roles. Director only.
 *
 * Thin, like the other Server Actions: authenticate, validate, write, and turn a
 * Postgres error into a readable one. The Director check here is UX. The boundary is
 * the `"admin manage roles"` policy on `user_roles`, and the trigger that stops a
 * Director removing their own Director role (`20261021025909_user_roles_guards.sql`).
 */

import { checkRole } from '@/lib/auth/roles';
import { roleChangeSchema } from '@/lib/validation/roles';

export interface RoleResult {
  ok: boolean;
  error?: string;
}

const UNIQUE_VIOLATION = '23505';
const RESTRICT_VIOLATION = '23001';
const FORBIDDEN = '42501';
const FOREIGN_KEY_VIOLATION = '23503';

export async function grantRole(userId: string, role: string): Promise<RoleResult> {
  const { supabase, userId: callerId, hasRole } = await checkRole('director');
  if (callerId === null) return { ok: false, error: 'You are no longer signed in.' };
  if (!hasRole) return { ok: false, error: 'Only Directors can change roles.' };

  const parsed = roleChangeSchema.safeParse({ userId, role });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.' };

  const { error } = await supabase
    .from('user_roles')
    .insert({ user_id: parsed.data.userId, role: parsed.data.role });

  // Already granted (a double click, or two Directors at once): the end state is the
  // one that was asked for.
  if (error && error.code !== UNIQUE_VIOLATION) {
    if (error.code === FORBIDDEN) return { ok: false, error: 'Only Directors can change roles.' };
    if (error.code === FOREIGN_KEY_VIOLATION) return { ok: false, error: 'That user no longer exists.' };
    console.error('grantRole failed:', error.code);
    return { ok: false, error: 'Could not change the role.' };
  }

  return { ok: true };
}

export async function revokeRole(userId: string, role: string): Promise<RoleResult> {
  const { supabase, userId: callerId, hasRole } = await checkRole('director');
  if (callerId === null) return { ok: false, error: 'You are no longer signed in.' };
  if (!hasRole) return { ok: false, error: 'Only Directors can change roles.' };

  const parsed = roleChangeSchema.safeParse({ userId, role });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.' };

  const { error } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', parsed.data.userId)
    .eq('role', parsed.data.role);

  if (error) {
    if (error.code === RESTRICT_VIOLATION) {
      return { ok: false, error: 'You cannot remove your own Director role. Ask another Director.' };
    }
    if (error.code === FORBIDDEN) return { ok: false, error: 'Only Directors can change roles.' };
    console.error('revokeRole failed:', error.code);
    return { ok: false, error: 'Could not change the role.' };
  }

  // A delete that matches nothing is not an error: the role was already gone.
  return { ok: true };
}
