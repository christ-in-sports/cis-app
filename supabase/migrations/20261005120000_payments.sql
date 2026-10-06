-- Recording registration payments (ENG-9).
--
-- There is no payment integration yet -- Stripe is v1.0 (project_spec.md 1.6) --
-- but families already pay by cash, Venmo or PayPal, and an Admin needs to know
-- who has. This adds the record an Admin keeps by hand: one row per payment
-- received, against the kid's registration for that season.
--
-- Why a table rather than columns on `registrations`: payments can be partial
-- (docs/decisions.md, 2026-10-05), so a registration has zero or more of them.
-- It is the spec's `Payment` entity (project_spec.md 2.4), keyed on
-- registration_id rather than kid_id, which answers the open question in 2.8:
-- a fee is paid for a season, and the kid's other seasons are not this one's
-- business. Stripe can add its own columns here later.
--
-- Why writes go only through functions, with NO write policy at all: the same
-- reason as set_registrations_consent() (20260923010000_record_consent.sql). A
-- payment record says money changed hands, so when it was recorded and by whom
-- must not be whatever the caller sent to PostgREST. Both are derived here --
-- now() and auth.uid() -- and the caller only says which registrations, how
-- much and how.
--
-- Nothing in import_commit() or register_kid() touches this table, and both
-- upsert the registration rather than replacing it, so a re-import or a parent
-- re-saving the form leaves recorded payments alone.

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  -- Integer cents, never a float: money must add up exactly. The upper bound is
  -- a typo guard ($1,000), not a policy -- well above any plausible fee.
  amount_cents integer NOT NULL,
  method text NOT NULL,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT payments_amount_range CHECK (amount_cents > 0 AND amount_cents <= 100000),
  CONSTRAINT payments_method_values CHECK (method IN ('cash', 'venmo', 'paypal'))
);

CREATE INDEX payments_registration_idx ON public.payments (registration_id);

-- ---------------------------------------------------------------------------
-- RLS
--
-- Read: Admin, and the kid's linked parent. The Role Permission Matrix gives
-- "Process payments" to Admin and Parents only (project_spec.md 1.5), so unlike
-- the rest of the kid's record this is NOT readable by Program Team or the
-- kid's coach. A parent may see their own kid's payments (2026-10-05 decision),
-- though the registration form deliberately shows none.
--
-- Write: no policy, so every direct INSERT / UPDATE / DELETE is refused --
-- including an Admin's. The functions below are the only way in.
-- ---------------------------------------------------------------------------

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read payments" ON public.payments
  FOR SELECT TO authenticated
  USING (
    public.has_role('admin')
    OR EXISTS (
      SELECT 1
        FROM public.registrations r
        JOIN public.kids k ON k.id = r.kid_id
       WHERE r.id = payments.registration_id
         AND k.parent_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- record_payments -- record the same payment against one or more registrations
--
-- An array for the same reason as set_registrations_consent(): an Admin with a
-- stack of cash envelopes records several at once, and N round trips would be
-- slow and non-atomic. One call is one statement is one transaction; a single
-- kid is an array of one.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_payments(
  p_registration_ids uuid[],
  p_amount_cents integer,
  p_method text
)
 RETURNS TABLE(
   payment_id uuid,
   registration_id uuid,
   amount_cents integer,
   method text,
   received_at timestamp with time zone
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- The RETURNS TABLE names double as plpgsql variables; prefer the column.
#variable_conflict use_column
declare
  v_wanted integer;
  v_found integer;
begin
  -- SECURITY DEFINER bypasses the caller's RLS, so the check has to be here.
  if not public.has_role('admin') then
    raise exception 'Only an Admin may record payments'
      using errcode = '42501';
  end if;

  if p_registration_ids is null or array_length(p_registration_ids, 1) is null then
    raise exception 'No registrations given'
      using errcode = '22023';
  end if;

  -- Checked before inserting rather than by comparing row counts afterwards:
  -- the FK would reject an unknown id anyway, but as a 23503 that reads like a
  -- bug. A stale screen is the realistic cause, so say that.
  select count(distinct id), (select count(distinct x) from unnest(p_registration_ids) x)
    into v_found, v_wanted
    from registrations
   where id = any(p_registration_ids);

  if v_found <> v_wanted then
    raise exception 'Some registrations no longer exist'
      using errcode = 'P0002';
  end if;

  -- The amount and method CHECKs reject bad input with 23514. Duplicate ids in
  -- the array are collapsed, so a double-tick never records a payment twice.
  return query
  insert into payments as p (registration_id, amount_cents, method, received_at, recorded_by)
  select distinct ids.id, p_amount_cents, p_method, now(), auth.uid()
    from unnest(p_registration_ids) as ids(id)
  returning p.id, p.registration_id, p.amount_cents, p.method, p.received_at;
end $function$;

REVOKE ALL ON FUNCTION public.record_payments(uuid[], integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_payments(uuid[], integer, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- delete_payment -- remove a payment recorded by mistake
--
-- A hard delete rather than a "voided" flag: these are an Admin's own notes of
-- cash in hand, not a ledger reconciled against a bank, and a mistyped amount
-- is corrected by removing it and recording the right one. Revisit when Stripe
-- arrives and payments start having an external source of truth.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_payment(p_payment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_registration_id uuid;
begin
  if not public.has_role('admin') then
    raise exception 'Only an Admin may remove payments'
      using errcode = '42501';
  end if;

  delete from payments
   where id = p_payment_id
  returning registration_id into v_registration_id;

  if v_registration_id is null then
    raise exception 'That payment no longer exists'
      using errcode = 'P0002';
  end if;

  return v_registration_id;
end $function$;

REVOKE ALL ON FUNCTION public.delete_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_payment(uuid) TO authenticated;
