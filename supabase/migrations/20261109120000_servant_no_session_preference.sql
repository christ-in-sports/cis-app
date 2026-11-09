-- A serving servant may answer "No preference" to which session they would like.
-- Stored as the single value 'no_preference' in `sessions`, so the existing
-- exactly-one-choice rule (servant_registrations_single_session) still holds.
-- servant_registrations_serving_shape needs no change: it already requires a
-- session's teams only when that session is chosen, and empty teams otherwise,
-- so a no-preference row carries no sub-team answers.
ALTER TABLE public.servant_registrations
  DROP CONSTRAINT servant_registrations_sessions_values,
  ADD CONSTRAINT servant_registrations_sessions_values
    CHECK (sessions <@ ARRAY['juniors', 'ambassadors', 'no_preference']);
