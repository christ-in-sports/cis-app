-- Commit the enum value before policies/functions use it in the next migration.
ALTER TYPE public.app_role ADD VALUE 'director' BEFORE 'admin';
