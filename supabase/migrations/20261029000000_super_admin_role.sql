-- =============================================================================
-- Migration: 20261029000000_super_admin_role.sql
-- Description: Adds the super_admin role used by the IT governance console
--              (SuperAdminDashboard). Kept in its own migration because a new
--              enum value must be committed before policies or functions use it.
-- =============================================================================

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'super_admin';
