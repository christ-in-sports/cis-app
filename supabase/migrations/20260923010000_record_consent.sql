-- Recording parental consent against existing registrations (ENG-5).
--
-- CSV-imported registrations leave `consent_given_at` null on purpose: the
-- CSV's consent question asks whether a paper form was handed in months
-- earlier, so the only timestamp the export carries is not when consent was
-- given (docs/decisions.md, 2026-09-22). Nothing could set it afterwards
-- either -- the parent form creates *new* registrations rather than attaching
-- consent to existing ones -- which left the whole imported roster permanently
-- at null, while project_spec.md 1.8 requires parental consent for minors.
--
-- This adds the missing step: an Admin records that the forms arrived.
--
-- Why a function rather than letting the client UPDATE the columns directly:
-- the `admin manage registrations` policy already permits an Admin to write
-- any column, so a plain update would let the timestamp and the attributed
-- user be *supplied* by whoever calls PostgREST. For a consent record about a
-- minor that is the one thing that must not be forgeable, so both values are
-- derived inside the database -- now() and auth.uid() -- and the caller only
-- gets to say which registrations, and whether consent was received.
--
-- Why an array rather than one id: an Admin collecting paper forms at a session
-- marks a handful at a time, and doing that as N round trips would be both slow
-- and non-atomic -- a half-applied batch would leave them unsure what landed.
-- One call is one statement is one transaction. A single row is an array of one.

CREATE OR REPLACE FUNCTION public.set_registrations_consent(
  p_registration_ids uuid[],
  p_received boolean
)
 RETURNS TABLE(
   registration_id uuid,
   consent_given_at timestamp with time zone,
   consent_by_user_id uuid
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_updated integer;
begin
  -- SECURITY DEFINER bypasses the caller's RLS, so the check has to be here.
  if not public.has_role('admin') then
    raise exception 'Only an Admin may record consent'
      using errcode = '42501';
  end if;

  if p_registration_ids is null or array_length(p_registration_ids, 1) is null then
    raise exception 'No registrations given'
      using errcode = '22023';
  end if;

  return query
  update registrations r
     set consent_given_at   = case when p_received then now() else null end,
         consent_by_user_id = case when p_received then auth.uid() else null end
   where r.id = any(p_registration_ids)
  returning r.id, r.consent_given_at, r.consent_by_user_id;

  get diagnostics v_updated = row_count;

  -- Fewer rows than ids means at least one no longer exists -- a stale screen,
  -- or a registration removed between render and click. Raised rather than
  -- quietly succeeding, because the whole statement rolls back and the Admin
  -- would otherwise believe every form they just ticked had been recorded.
  if v_updated <> array_length(p_registration_ids, 1) then
    raise exception 'Some registrations no longer exist'
      using errcode = 'P0002';
  end if;
end $function$;

-- PostgREST exposes everything in `public`; be explicit about who may call it.
-- The has_role('admin') check above is the real gate.
REVOKE ALL ON FUNCTION public.set_registrations_consent(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_registrations_consent(uuid[], boolean) TO authenticated;
