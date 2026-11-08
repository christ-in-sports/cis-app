-- Sessions overlap, so a serving servant must choose exactly one preference.
-- Keep the existing array shape, RPC and owner/Admin RLS read policies.
-- NOT VALID preserves historical registrations that selected both; Postgres
-- still enforces the constraint for every new or updated row, including RPC
-- submissions. The form asks these returning servants to choose on their next
-- save rather than inventing a preference or discarding their saved answers.
ALTER TABLE public.servant_registrations
  ADD CONSTRAINT servant_registrations_single_session
  CHECK (NOT is_serving OR cardinality(sessions) = 1) NOT VALID;
