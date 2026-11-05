-- The authenticator (TOTP) step at sign-in is removed for every role: a password session (aal1)
-- now has the same access an aal2 session had. Every aal2 check (is_admin, is_super_admin, the
-- "Patent records need an authenticator session" policies, require_authenticator_session) goes
-- through is_aal2(), so redefining it here switches them all off in one place.
-- To turn the step back on, restore the original body: auth.jwt() ->> 'aal' = 'aal2'.
CREATE OR REPLACE FUNCTION is_aal2()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT true;
$$;
