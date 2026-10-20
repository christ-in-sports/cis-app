/**
 * The six roles as plain data, with no server imports, so a client component can
 * list them. `AppRole` mirrors the database enum `app_role`; keep the two in
 * step (the generated `types/supabase.ts` is the check).
 */

export const APP_ROLES = ['admin', 'program', 'coach', 'prayer', 'parent', 'kid'] as const;

export type AppRole = (typeof APP_ROLES)[number];

/**
 * The roles an Admin can grant or remove on the roles screen. `kid` is left out
 * on purpose: that screen is for servants, and a kid's account gets the role
 * automatically when they register, never from an Admin's tick box.
 */
export const ASSIGNABLE_ROLES = ['admin', 'program', 'coach', 'prayer', 'parent'] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** How each role is named on screen (`project_spec.md` §1.4). */
export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  program: 'Program Team',
  coach: 'Coach',
  prayer: 'Prayer Team',
  parent: 'Parent',
  kid: 'Kid',
};
