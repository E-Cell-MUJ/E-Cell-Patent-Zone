-- Sign-up failed with "permission denied for schema public": GoTrue inserts into auth.users as
-- supabase_auth_admin, which has no USAGE on public, so the domain trigger could not reach
-- registration_enabled(). Run the trigger as its owner, like handle_new_user() already does.
ALTER FUNCTION public.enforce_university_email_domain() SECURITY DEFINER;
