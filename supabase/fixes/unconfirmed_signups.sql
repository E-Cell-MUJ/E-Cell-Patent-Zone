-- =============================================================================
-- Accounts created while Supabase "Confirm email" was still on
-- Run in the Supabase SQL Editor, one step at a time.
--
-- Symptom: sign-up says the account cannot be activated (older builds said
-- "may already be registered"), sign-in fails, GET /rest/v1/profiles returns 406.
-- Cause: GoTrue stored the user with email_confirmed_at = NULL and no session, and
-- handle_new_user only creates a profile for a confirmed account.
--
-- Do step 0 first, or new sign-ups keep landing in the same state.
-- =============================================================================

-- 0. Dashboard: Authentication -> Sign In / Providers -> Email -> turn OFF "Confirm email".

-- 1. Diagnose: unconfirmed university accounts and whether each has a profile
SELECT u.id, u.email, u.created_at, u.email_confirmed_at, (p.id IS NOT NULL) AS has_profile
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email_confirmed_at IS NULL
ORDER BY u.created_at DESC;

-- 2. Diagnose duplicates. auth.users enforces one row per email, so both should return no rows.
SELECT lower(email) AS email, count(*) FROM auth.users GROUP BY 1 HAVING count(*) > 1;
SELECT lower(university_email) AS email, count(*) FROM public.profiles GROUP BY 1 HAVING count(*) > 1;

-- 3. Fix: confirm the stuck @muj.manipal.edu sign-ups. Changes only email_confirmed_at;
--    the on_auth_user_confirmed trigger then creates each missing profile.
UPDATE auth.users
SET email_confirmed_at = now()
WHERE email_confirmed_at IS NULL
  AND lower(email) LIKE '%@muj.manipal.edu';

-- 4. Accounts still without a profile (e.g. migration 20261029000200 not applied yet):
--    create them from the sign-up metadata, as handle_new_user does.
INSERT INTO public.profiles (id, university_email, full_name, role, department, registration_number, phone)
SELECT u.id,
       lower(u.email),
       COALESCE(NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1)),
       'student',
       NULLIF(trim(u.raw_user_meta_data->>'department'), ''),
       NULLIF(trim(u.raw_user_meta_data->>'registration_number'), ''),
       NULLIF(trim(u.raw_user_meta_data->>'phone'), '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
  AND u.email_confirmed_at IS NOT NULL
  AND lower(u.email) LIKE '%@muj.manipal.edu'
ON CONFLICT (id) DO NOTHING;

-- 5. Verify: should return no rows
SELECT u.email FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL OR u.email_confirmed_at IS NULL;
