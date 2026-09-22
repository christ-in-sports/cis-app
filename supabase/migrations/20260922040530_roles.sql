-- Six-role model foundation (ENG-5 PR 2 of N).
--
-- Context: project_spec.md 1.4/1.5 defines six roles (Admin/Director, Program Team,
-- Coaches, Prayer Team, Parents, Kids), and a person may hold more than one at once.
-- The live schema only has two booleans on `profiles` (is_staff, is_coach), which
-- cannot express "Admin only, not Program Team" -- a requirement of ENG-5's CSV
-- import (only Admin may run it). This migration adds a real role model underneath
-- the existing booleans without changing any currently-live RLS behavior.
--
-- Design notes:
--   * `user_roles` is a join table, not a column on `profiles`, because a person can
--     hold multiple roles simultaneously (project_spec.md 1.4).
--   * `has_role()` mirrors the SECURITY DEFINER / STABLE / pinned search_path style of
--     the existing is_staff()/is_coach() helpers, for the same reason: it is called
--     from inside RLS policies on user_roles itself, and SECURITY DEFINER lets it read
--     user_roles without recursing back through the RLS it is being used to enforce.
--   * is_staff() is redefined as has_role('admin') ONLY -- not admin-or-program --
--     because this migration does not backfill anyone into the 'program' role (no
--     data indicates who that should be yet). Redefining is_staff() as admin-only
--     keeps every existing RLS policy that calls is_staff() behaviorally IDENTICAL
--     to before this migration. Widening it to include 'program' is a deliberate
--     follow-up decision for whoever populates that role, not a side effect of this
--     migration.
--   * is_coach() keeps its original shape (is_staff() OR the coach flag), now backed
--     by has_role('coach') instead of profiles.is_coach.
--   * The `is_staff` / `is_coach` booleans on `profiles` are left in place (not
--     dropped) -- `handle_new_user()` still writes them from the signup flow, and
--     removing them is a separate follow-up once signup itself is migrated to grant
--     roles directly.

-- ---------------------------------------------------------------------------
-- Role enum + user_roles table
-- ---------------------------------------------------------------------------

CREATE TYPE public.app_role AS ENUM (
  'admin', 'program', 'coach', 'prayer', 'parent', 'kid'
);

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_at timestamp with time zone NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES public.profiles(id),
  PRIMARY KEY (user_id, role)
);

CREATE INDEX user_roles_user_idx ON public.user_roles USING btree (user_id);

-- ---------------------------------------------------------------------------
-- has_role() -- the new primitive every future RLS policy should call
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_role(p_role public.app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_roles
     where user_id = auth.uid()
       and role = p_role
  );
$function$;

-- ---------------------------------------------------------------------------
-- Redefine is_staff() / is_coach() on top of has_role().
-- Behavior-preserving today: see design notes above.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_role('admin');
$function$;

CREATE OR REPLACE FUNCTION public.is_coach()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_staff() or public.has_role('coach');
$function$;

-- ---------------------------------------------------------------------------
-- RLS on user_roles itself
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role('admin'));

CREATE POLICY "admin manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Backfill from the existing profiles.is_staff / is_coach booleans.
--
-- Data-driven (not hardcoded ids), so this is a no-op on a fresh local
-- database and only affects rows that actually exist on the target database.
-- ---------------------------------------------------------------------------

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM public.profiles WHERE is_staff
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'coach'::public.app_role FROM public.profiles WHERE is_coach
ON CONFLICT DO NOTHING;

-- joseph.nabil07@gmail.com is the project's Director/Admin and needs access to the
-- Admin-only screens this role model gates (notably the ENG-5 CSV importer), but
-- profiles.is_staff is false for this account, so the backfill above would not cover
-- it. Granted explicitly per 2026-09-22 product decision.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM public.profiles WHERE email = 'joseph.nabil07@gmail.com'
ON CONFLICT DO NOTHING;
