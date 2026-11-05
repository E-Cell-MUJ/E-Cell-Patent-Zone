-- Migration: 20261105000000_super_admin_rpc_aliases.sql
-- Description: Expose standard RPC aliases for super admin console and registration controls
--              compatible with frontend direct PostgREST RPC invokers.

-- 1. get_registration_switch alias for registration_enabled()
CREATE OR REPLACE FUNCTION public.get_registration_switch()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT registration_enabled();
$$;
GRANT EXECUTE ON FUNCTION public.get_registration_switch() TO authenticated, anon;

-- 2. super_admin_toggle_registration alias for set_registration_enabled(boolean)
CREATE OR REPLACE FUNCTION public.super_admin_toggle_registration(p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM set_registration_enabled(p_enabled);
END;
$$;
GRANT EXECUTE ON FUNCTION public.super_admin_toggle_registration(BOOLEAN) TO authenticated;

-- 3. get_admin_audit_log for audit entries
CREATE OR REPLACE FUNCTION public.get_admin_audit_log(p_limit INTEGER DEFAULT 200)
RETURNS TABLE (
    id BIGINT,
    actor_id UUID,
    actor_email TEXT,
    action TEXT,
    target_id UUID,
    target_email TEXT,
    details JSONB,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    PERFORM require_super_admin();
    RETURN QUERY
    SELECT l.id, l.actor_id, l.actor_email, l.action, l.target_id, l.target_email, l.details, l.created_at
    FROM admin_audit_log l
    ORDER BY l.created_at DESC
    LIMIT least(greatest(p_limit, 1), 1000);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_audit_log(INTEGER) TO authenticated;

-- 4. get_auth_events alias for get_auth_audit_events
CREATE OR REPLACE FUNCTION public.get_auth_events(p_limit INTEGER DEFAULT 200)
RETURNS TABLE (
    created_at TIMESTAMPTZ,
    ip_address TEXT,
    action TEXT,
    actor TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    RETURN QUERY SELECT * FROM get_auth_audit_events(p_limit);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_auth_events(INTEGER) TO authenticated;

-- 5. get_system_telemetry alias for get_superadmin_telemetry
CREATE OR REPLACE FUNCTION public.get_system_telemetry()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT get_superadmin_telemetry();
$$;
GRANT EXECUTE ON FUNCTION public.get_system_telemetry() TO authenticated;
