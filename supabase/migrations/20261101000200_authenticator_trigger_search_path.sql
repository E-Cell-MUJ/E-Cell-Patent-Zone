-- Deleting a user from the dashboard failed with "function is_aal2() does not exist": GoTrue runs
-- with search_path = auth, and the cascade into applications fires this trigger, which calls
-- is_aal2() unqualified. Pin the search path like the other trigger functions.
ALTER FUNCTION public.require_authenticator_session() SET search_path = public;
ALTER FUNCTION public.guard_application_workflow_columns() SET search_path = public;
ALTER FUNCTION public.limit_daily_drafts() SET search_path = public;
ALTER FUNCTION public.set_application_reference_number() SET search_path = public;
ALTER FUNCTION public.check_profile_role_update() SET search_path = public;
