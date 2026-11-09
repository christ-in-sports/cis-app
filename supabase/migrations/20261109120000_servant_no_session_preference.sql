-- A serving servant may answer "No preference" to which session they would like.
-- Stored as the single value 'no_preference' in `sessions`, so the existing
-- exactly-one-choice rule (servant_registrations_single_session) still holds.
--
-- They are still asked which teams, once. The form keeps that one set in the
-- Juniors columns and the Server Action copies it to the Ambassadors columns, so
-- either session's list shows what they would serve on. No new columns: the
-- shape check below requires the two copies to match and a team or Other.
ALTER TABLE public.servant_registrations
  DROP CONSTRAINT servant_registrations_sessions_values,
  ADD CONSTRAINT servant_registrations_sessions_values
    CHECK (sessions <@ ARRAY['juniors', 'ambassadors', 'no_preference']);

ALTER TABLE public.servant_registrations
  DROP CONSTRAINT servant_registrations_serving_shape,
  ADD CONSTRAINT servant_registrations_serving_shape CHECK (
    CASE WHEN is_serving THEN
      cardinality(sessions) > 0
      AND (
        CASE WHEN 'no_preference' = ANY (sessions) THEN
          (cardinality(juniors_subteams) > 0 OR juniors_other IS NOT NULL)
          AND juniors_subteams = ambassadors_subteams
          AND juniors_other IS NOT DISTINCT FROM ambassadors_other
        ELSE
          (NOT ('juniors' = ANY (sessions)) OR cardinality(juniors_subteams) > 0 OR juniors_other IS NOT NULL)
          AND (NOT ('ambassadors' = ANY (sessions)) OR cardinality(ambassadors_subteams) > 0 OR ambassadors_other IS NOT NULL)
          AND ('juniors' = ANY (sessions) OR (cardinality(juniors_subteams) = 0 AND juniors_other IS NULL))
          AND ('ambassadors' = ANY (sessions) OR (cardinality(ambassadors_subteams) = 0 AND ambassadors_other IS NULL))
        END
      )
    ELSE
      cardinality(sessions) = 0
      AND cardinality(juniors_subteams) = 0
      AND cardinality(ambassadors_subteams) = 0
      AND juniors_other IS NULL
      AND ambassadors_other IS NULL
    END
  );
