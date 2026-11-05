/**
 * Manipal University Jaipur — Patent Application & Disclosure Portal
 * Lead Architect & Maintainer: SynthReaper <codewithaditya8002@gmail.com>
 * PostgREST Client, Database RPC Interface & Secure Storage Handlers
 */

import { supabase, isSupabaseConfigured } from './supabase';
import type {
  Application,
  ApplicationComment,
  ApplicationDocument,
  ApplicationStatus,
  ApplicationStatusHistory,
  ApplicationVersion,
  AppRole,
  CorrectionRequest,
  DocumentCategory,
  InPortalNotification,
  Inventor,
  Profile,
} from '../types/database.types';
import { canTransition } from '../features/applications/workflow';
import {
  INSTITUTION,
  SECURITY_RULES,
} from '../config/constants';

const isTestMode = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';
const STORAGE_PREFIX = 'muj_patent_portal_';

// Maximum upload file size from centralized security rules
export const MAX_DOCUMENT_SIZE_BYTES = SECURITY_RULES.MAX_FILE_SIZE_BYTES;

// Allowed MIME types
export const ALLOWED_DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'];
export const ALLOWED_DOCUMENT_MIMES = [
  ...SECURITY_RULES.ALLOWED_MIME_TYPES,
  'application/msword',
  'image/jpeg',
];

// In-memory test store helpers (active only in Vitest test runner)
function getLocalItem<T>(key: string, defaultValue: T): T {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
  if (!raw) return defaultValue;
  try {
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

function setLocalItem<T>(key: string, value: T): void {
  localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
}

const TEST_AUDIT_KEY = 'test_audit_log';
const TEST_SUSPENDED_KEY = 'test_suspended_users';

function appendTestAudit(action: string, targetEmail: string | null, details: Record<string, unknown> = {}) {
  const log = getLocalItem<AdminAuditEntry[]>(TEST_AUDIT_KEY, []);
  log.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actor_email: 'superadmin@muj.manipal.edu',
    action,
    target_email: targetEmail,
    details,
    created_at: new Date().toISOString(),
  });
  setLocalItem(TEST_AUDIT_KEY, log.slice(0, 500));
}

function ensureSupabaseOrTest(): void {
  if (!isSupabaseConfigured() && !isTestMode) {
    throw new Error('Institutional database is not configured. Live Supabase connection required.');
  }
}

// =============================================================================
// AUTHENTICATION & PROFILES API
// =============================================================================

export async function fetchCurrentProfile(userId: string): Promise<Profile | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(error.message);
    }
    return data as Profile;
  }

  ensureSupabaseOrTest();
  const profiles = getLocalItem<Profile[]>('profiles', []);
  return profiles.find((p) => p.id === userId) || null;
}

export async function upsertProfile(
  profile: Partial<Profile> & { id: string; university_email: string }
): Promise<Profile> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('profiles')
      .upsert(profile)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Profile;
  }

  ensureSupabaseOrTest();
  const profiles = getLocalItem<Profile[]>('profiles', []);
  const index = profiles.findIndex((p) => p.id === profile.id);
  const now = new Date().toISOString();

  let updatedProfile: Profile;
  if (index >= 0) {
    const existingRole = profiles[index].role;
    updatedProfile = {
      ...profiles[index],
      ...profile,
      role: existingRole,
      updated_at: now,
    };
    profiles[index] = updatedProfile;
  } else {
    updatedProfile = {
      id: profile.id,
      university_email: profile.university_email,
      full_name: profile.full_name || 'Anonymous User',
      role: profile.role || 'student',
      department: profile.department || 'Not specified',
      registration_number: profile.registration_number || null,
      phone: profile.phone || null,
      created_at: now,
      updated_at: now,
    };
    profiles.push(updatedProfile);
  }
  setLocalItem('profiles', profiles);
  return updatedProfile;
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Profile[];
  }

  ensureSupabaseOrTest();
  return getLocalItem<Profile[]>('profiles', []);
}

// =============================================================================
// SUPER ADMIN SUPERVISION & CONSOLE API
// =============================================================================

export interface ProcessSupervisionItem {
  id: string;
  reference_number: string;
  owner_id: string;
  status: ApplicationStatus;
  current_version: number;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  applicant_name: string;
  applicant_email: string;
  applicant_department: string;
}

export async function fetchProcessSupervisionOverview(): Promise<ProcessSupervisionItem[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.rpc('get_pipeline_overview');
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((item) => ({
      id: item.id,
      reference_number: item.reference_number,
      owner_id: '',
      status: item.status,
      current_version: item.current_version,
      submitted_at: item.submitted_at,
      created_at: item.created_at,
      updated_at: item.updated_at,
      applicant_name: item.applicant_name || 'Applicant',
      applicant_email: item.applicant_email || '',
      applicant_department: item.applicant_department || 'Not specified',
    }));
  }

  ensureSupabaseOrTest();
  const applications = getLocalItem<Application[]>('applications', []);
  const profiles = getLocalItem<Profile[]>('profiles', []);
  return applications.map((app) => {
    const p = profiles.find((prof) => prof.id === app.owner_id);
    return {
      id: app.id,
      reference_number: app.reference_number,
      owner_id: app.owner_id,
      status: app.status,
      current_version: app.current_version,
      submitted_at: app.submitted_at,
      created_at: app.created_at,
      updated_at: app.updated_at,
      applicant_name: p?.full_name || 'Applicant',
      applicant_email: p?.university_email || '',
      applicant_department: p?.department || 'Not specified',
    };
  });
}

export async function superAdminResetUserPassword(
  email: string,
  newPassword: string,
  fullName?: string,
  department?: string
): Promise<{ success: boolean; error?: string }> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.rpc('register_university_user', {
      p_email: email.trim().toLowerCase(),
      p_password: newPassword,
      p_full_name: fullName || email.split('@')[0],
      p_department: department || null,
    });
    if (error || !data?.success) {
      return { success: false, error: data?.error || error?.message || 'Failed to update user password.' };
    }
    return { success: true };
  }

  ensureSupabaseOrTest();
  appendTestAudit('password_reset', email.trim().toLowerCase());
  return { success: true };
}

export async function superAdminUpdateUserRole(
  userId: string,
  newRole: AppRole
): Promise<{ success: boolean; error?: string }> {
  if (isSupabaseConfigured()) {
    const { error } = await supabase.rpc('super_admin_update_user_role', {
      p_target_user_id: userId,
      p_new_role: newRole,
    });
    if (error) {
      const { error: fallbackError } = await supabase
        .from('profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (fallbackError) return { success: false, error: fallbackError.message };
    }
    return { success: true };
  }

  ensureSupabaseOrTest();
  const profiles = getLocalItem<Profile[]>('profiles', []);
  const idx = profiles.findIndex((p) => p.id === userId);
  if (idx >= 0) {
    const prev = profiles[idx].role;
    profiles[idx].role = newRole;
    profiles[idx].updated_at = new Date().toISOString();
    setLocalItem('profiles', profiles);
    appendTestAudit('role_changed', profiles[idx].university_email, { from: prev, to: newRole });
  }
  return { success: true };
}

export async function fetchSuperAdminTelemetry(): Promise<any> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.rpc('get_system_telemetry');
    if (error) throw new Error(error.message);
    return data;
  }

  ensureSupabaseOrTest();
  return {
    total_users: 0,
    total_applications: 0,
    active_sessions: 0,
    server_time: new Date().toISOString(),
  };
}

export interface DirectoryUser {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole | null;
  department: string | null;
  registration_number: string | null;
  created_at: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  has_authenticator: boolean;
  suspended: boolean;
}

export interface AdminAuditEntry {
  id: string;
  created_at: string;
  actor_email: string | null;
  action: string;
  target_email: string | null;
  details: Record<string, unknown>;
}

export interface AuthEvent {
  created_at: string;
  ip_address: string | null;
  action: string;
  actor: string | null;
}

export type AccountAction = 'reset_authenticator' | 'sign_out' | 'suspend' | 'reactivate';

export async function fetchUserDirectory(): Promise<DirectoryUser[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.rpc('get_user_directory');
    if (error) throw new Error(error.message);
    return (data ?? []) as DirectoryUser[];
  }

  ensureSupabaseOrTest();
  const suspended = getLocalItem<string[]>(TEST_SUSPENDED_KEY, []);
  return getLocalItem<Profile[]>('profiles', []).map((p) => ({
    id: p.id,
    email: p.university_email,
    full_name: p.full_name,
    role: p.role,
    department: p.department,
    registration_number: p.registration_number,
    created_at: p.created_at,
    email_confirmed_at: p.created_at,
    last_sign_in_at: null,
    has_authenticator: false,
    suspended: suspended.includes(p.id),
  }));
}

export async function runAccountAction(
  action: AccountAction,
  user: Pick<DirectoryUser, 'id' | 'email'>,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  if (isSupabaseConfigured()) {
    const { error } =
      action === 'reset_authenticator'
        ? await supabase.rpc('admin_reset_authenticator', { p_user: user.id })
        : action === 'sign_out'
        ? await supabase.rpc('admin_sign_out_user', { p_user: user.id })
        : await supabase.rpc('admin_set_suspended', {
            p_user: user.id,
            p_suspended: action === 'suspend',
            p_reason: reason?.trim() || null,
          });
    return error ? { success: false, error: error.message } : { success: true };
  }

  ensureSupabaseOrTest();
  const suspended = new Set(getLocalItem<string[]>(TEST_SUSPENDED_KEY, []));
  if (action === 'suspend') suspended.add(user.id);
  if (action === 'reactivate') suspended.delete(user.id);
  setLocalItem(TEST_SUSPENDED_KEY, [...suspended]);
  const logged = {
    reset_authenticator: 'authenticator_reset',
    sign_out: 'signed_out_everywhere',
    suspend: 'account_suspended',
    reactivate: 'account_reactivated',
  }[action];
  appendTestAudit(logged, user.email, reason?.trim() ? { reason: reason.trim() } : {});
  return { success: true };
}

export async function fetchAdminAuditLog(limit = 200): Promise<AdminAuditEntry[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.rpc('get_admin_audit_log', { p_limit: limit });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((e) => ({
      id: e.id,
      created_at: e.created_at,
      actor_email: e.actor_email,
      action: e.action,
      target_email: e.target_email,
      details: e.details ?? {},
    }));
  }

  ensureSupabaseOrTest();
  return getLocalItem<AdminAuditEntry[]>(TEST_AUDIT_KEY, []).slice(0, limit);
}

export async function fetchAuthEvents(limit = 200): Promise<AuthEvent[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.rpc('get_auth_events', { p_limit: limit });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((e) => ({
      created_at: e.created_at,
      ip_address: e.ip_address ?? null,
      action: e.event_type || e.action || 'auth_event',
      actor: e.user_email || e.actor || null,
    }));
  }

  ensureSupabaseOrTest();
  return [];
}

export async function fetchRegistrationEnabled(): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.rpc('get_registration_switch');
    if (error) throw new Error(error.message);
    return Boolean(data);
  }

  ensureSupabaseOrTest();
  return getLocalItem<boolean>('registration_open', true);
}

export async function setRegistrationEnabled(enabled: boolean): Promise<{ success: boolean; error?: string }> {
  if (isSupabaseConfigured()) {
    const { error } = await supabase.rpc('super_admin_toggle_registration', { p_enabled: enabled });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  ensureSupabaseOrTest();
  setLocalItem('registration_open', enabled);
  appendTestAudit(enabled ? 'registration_opened' : 'registration_closed', null);
  return { success: true };
}

// =============================================================================
// APPLICATIONS API
// =============================================================================

export async function fetchApplications(user: { id: string; role: AppRole }): Promise<Application[]> {
  if (isSupabaseConfigured()) {
    let query = supabase
      .from('applications')
      .select('*, profiles(*)')
      .order('updated_at', { ascending: false });

    if (user.role !== 'admin') {
      query = query.eq('owner_id', user.id);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as Application[];
  }

  ensureSupabaseOrTest();
  const applications = getLocalItem<Application[]>('applications', []);
  const profiles = getLocalItem<Profile[]>('profiles', []);

  return applications
    .filter((app) => user.role === 'admin' || app.owner_id === user.id)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .map((app) => {
      const ownerProfile = profiles.find((p) => p.id === app.owner_id);
      return {
        ...app,
        profiles: ownerProfile,
      };
    });
}

export async function fetchApplicationById(
  id: string,
  user: { id: string; role: AppRole }
): Promise<Application | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('applications')
      .select(
        '*, profiles(*), inventors(*), application_documents(*), correction_requests(*), application_status_history(*)'
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(error.message);
    }

    if (user.role !== 'admin' && data.owner_id !== user.id) {
      throw new Error('Access denied: You do not have permission to view this application.');
    }
    return data as Application;
  }

  ensureSupabaseOrTest();
  const applications = getLocalItem<Application[]>('applications', []);
  const app = applications.find((a) => a.id === id);
  if (!app) return null;

  if (user.role !== 'admin' && app.owner_id !== user.id) {
    throw new Error('Access denied: You do not have permission to view this application.');
  }

  const profiles = getLocalItem<Profile[]>('profiles', []);
  const inventors = getLocalItem<Inventor[]>('inventors', []).filter((i) => i.application_id === id);
  const documents = getLocalItem<ApplicationDocument[]>('documents', []).filter((d) => d.application_id === id);
  const corrections = getLocalItem<CorrectionRequest[]>('corrections', []).filter((c) => c.application_id === id);
  const history = getLocalItem<ApplicationStatusHistory[]>('history', []).filter((h) => h.application_id === id);
  const versions = getLocalItem<ApplicationVersion[]>('versions', []).filter((v) => v.application_id === id);

  return {
    ...app,
    profiles: profiles.find((p) => p.id === app.owner_id),
    inventors,
    application_documents: documents,
    correction_requests: corrections,
    application_status_history: history.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
    application_versions: versions.sort((a, b) => a.version_number - b.version_number),
  };
}

export async function fetchApplicationVersions(applicationId: string): Promise<ApplicationVersion[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('application_versions')
      .select('*')
      .eq('application_id', applicationId)
      .order('version_number', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ApplicationVersion[];
  }

  ensureSupabaseOrTest();
  const versions = getLocalItem<ApplicationVersion[]>('versions', []);
  return versions
    .filter((v) => v.application_id === applicationId)
    .sort((a, b) => a.version_number - b.version_number);
}

export async function saveDraftApplication(
  data: Partial<Application>,
  inventorsList: Partial<Inventor>[],
  userId: string
): Promise<Application> {
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    let effectiveUserId = userId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isUuid) {
      const { data: authUser } = await supabase.auth.getUser();
      if (authUser.user?.id) {
        effectiveUserId = authUser.user.id;
      }
    }

    const {
      inventors: _inv,
      profiles: _prof,
      application_documents: _docs,
      correction_requests: _cr,
      application_status_history: _hist,
      application_versions: _ver,
      ...cleanData
    } = data as any;

    let appId = cleanData.id;
    if (!appId) {
      const { data: newApp, error: appError } = await supabase
        .from('applications')
        .insert({
          ...cleanData,
          owner_id: effectiveUserId,
          status: 'draft',
          current_version: 1,
        })
        .select()
        .single();
      if (appError) throw new Error(appError.message);
      appId = newApp.id;
    } else {
      const { error: updateError } = await supabase
        .from('applications')
        .update({
          ...cleanData,
          updated_at: now,
        })
        .eq('id', appId);
      if (updateError) throw new Error(updateError.message);
    }

    if (inventorsList.length > 0 && appId) {
      await supabase.from('inventors').delete().eq('application_id', appId);
      const inventorsToInsert = inventorsList.map((inv, idx) => ({
        application_id: appId,
        full_name: inv.full_name || '',
        email: inv.email || '',
        phone: inv.phone || null,
        affiliation_type: inv.affiliation_type || 'student',
        department: inv.department || null,
        is_primary: idx === 0 || inv.is_primary === true,
        order_index: idx,
      }));
      const { error: invError } = await supabase.from('inventors').insert(inventorsToInsert);
      if (invError) throw new Error(invError.message);
    }

    const result = await fetchApplicationById(appId, { id: effectiveUserId, role: 'student' });
    if (!result) throw new Error('Failed to retrieve saved draft application');
    return result;
  }

  ensureSupabaseOrTest();
  const applications = getLocalItem<Application[]>('applications', []);
  const allInventors = getLocalItem<Inventor[]>('inventors', []);
  const counter = parseInt(localStorage.getItem(`${STORAGE_PREFIX}ref_counter`) || '1', 10);

  let targetApp: Application;

  if (data.id) {
    const index = applications.findIndex((a) => a.id === data.id);
    if (index === -1) throw new Error('Application not found');
    if (applications[index].owner_id !== userId) throw new Error('Access denied');

    targetApp = {
      ...applications[index],
      ...data,
      updated_at: now,
    };
    applications[index] = targetApp;
  } else {
    const nextRef = `${INSTITUTION.SHORT_NAME}-PAT-${new Date().getFullYear()}-${String(counter + 1).padStart(4, '0')}`;
    localStorage.setItem(`${STORAGE_PREFIX}ref_counter`, String(counter + 1));

    targetApp = {
      id: `app-${Date.now()}`,
      reference_number: nextRef,
      owner_id: userId,
      title: data.title || 'Untitled Draft Invention',
      technical_field: data.technical_field || '',
      background_problem: data.background_problem || '',
      description: data.description || '',
      novelty_features: data.novelty_features || '',
      practical_applications: data.practical_applications || '',
      status: 'draft',
      current_version: 1,
      submitted_at: null,
      created_at: now,
      updated_at: now,
    };
    applications.push(targetApp);

    const history = getLocalItem<ApplicationStatusHistory[]>('history', []);
    history.push({
      id: `hist-${Date.now()}`,
      application_id: targetApp.id,
      from_status: null,
      to_status: 'draft',
      changed_by: userId,
      reason: 'Draft created by applicant.',
      created_at: now,
    });
    setLocalItem('history', history);
  }

  const filteredInventors = allInventors.filter((i) => i.application_id !== targetApp.id);
  const newInventors: Inventor[] = inventorsList.map((inv, idx) => ({
    id: inv.id || `inv-${Date.now()}-${idx}`,
    application_id: targetApp.id,
    full_name: inv.full_name || '',
    email: inv.email || '',
    phone: inv.phone || null,
    affiliation_type: inv.affiliation_type || 'student',
    department: inv.department || '',
    is_primary: idx === 0 || inv.is_primary === true,
    order_index: idx,
    created_at: now,
  }));

  setLocalItem('applications', applications);
  setLocalItem('inventors', [...filteredInventors, ...newInventors]);

  return { ...targetApp, inventors: newInventors };
}

export async function submitApplication(
  applicationId: string,
  userId: string,
  notes?: string
): Promise<Application> {
  if (isSupabaseConfigured()) {
    const { error: rpcError } = await supabase.rpc('submit_application_atomic', {
      p_application_id: applicationId,
    });
    if (rpcError) throw new Error(rpcError.message);

    const updated = await fetchApplicationById(applicationId, { id: userId, role: 'student' });
    if (!updated) throw new Error('Failed to reload submitted application');
    return updated;
  }

  ensureSupabaseOrTest();
  const applications = getLocalItem<Application[]>('applications', []);
  const index = applications.findIndex((a) => a.id === applicationId);
  if (index === -1) throw new Error('Application not found');

  const app = applications[index];
  if (app.owner_id !== userId) throw new Error('Access denied');
  if (app.status !== 'draft') throw new Error(`Cannot submit application in status: ${app.status}`);

  const now = new Date().toISOString();
  app.status = 'submitted';
  app.submitted_at = now;
  app.updated_at = now;
  applications[index] = app;

  const history = getLocalItem<ApplicationStatusHistory[]>('history', []);
  history.push({
    id: `hist-${Date.now()}`,
    application_id: applicationId,
    from_status: 'draft',
    to_status: 'submitted',
    changed_by: userId,
    reason: notes || 'Formal submission by student.',
    created_at: now,
  });

  const inventors = getLocalItem<Inventor[]>('inventors', []).filter((i) => i.application_id === applicationId);
  const versions = getLocalItem<ApplicationVersion[]>('versions', []);
  versions.push({
    id: `ver-${Date.now()}`,
    application_id: applicationId,
    version_number: 1,
    snapshot_data: { ...app, inventors },
    submitted_by: userId,
    submitted_at: now,
    submission_notes: notes || 'Initial formal submission.',
  });

  setLocalItem('applications', applications);
  setLocalItem('history', history);
  setLocalItem('versions', versions);

  return { ...app, inventors };
}

export async function resubmitApplication(
  applicationId: string,
  userId: string,
  notes?: string
): Promise<Application> {
  if (isSupabaseConfigured()) {
    const { error: rpcError } = await supabase.rpc('applicant_resubmit_atomic', {
      p_application_id: applicationId,
      p_resubmission_notes: notes || 'Applicant resubmitted disclosure addressing required corrections.',
    });
    if (rpcError) throw new Error(rpcError.message);

    const updated = await fetchApplicationById(applicationId, { id: userId, role: 'student' });
    if (!updated) throw new Error('Failed to reload resubmitted application');
    return updated;
  }

  ensureSupabaseOrTest();
  const applications = getLocalItem<Application[]>('applications', []);
  const index = applications.findIndex((a) => a.id === applicationId);
  if (index === -1) throw new Error('Application not found');

  const app = applications[index];
  if (app.owner_id !== userId) throw new Error('Access denied');
  if (app.status !== 'corrections_required') {
    throw new Error('Only applications in corrections_required status can be resubmitted.');
  }

  const now = new Date().toISOString();
  const newVersion = app.current_version + 1;

  app.status = 'resubmitted';
  app.current_version = newVersion;
  app.updated_at = now;
  applications[index] = app;

  const corrections = getLocalItem<CorrectionRequest[]>('corrections', []);
  const updatedCorrections = corrections.map((c) =>
    c.application_id === applicationId && c.status === 'pending'
      ? { ...c, status: 'resolved' as const, resolved_at: now }
      : c
  );

  const history = getLocalItem<ApplicationStatusHistory[]>('history', []);
  history.push({
    id: `hist-${Date.now()}`,
    application_id: applicationId,
    from_status: 'corrections_required',
    to_status: 'resubmitted',
    changed_by: userId,
    reason: notes || `Applicant submitted corrections for Version ${newVersion}.`,
    created_at: now,
  });

  const allInventors = getLocalItem<Inventor[]>('inventors', []);
  const inventors = allInventors.filter((i) => i.application_id === applicationId);

  const versions = getLocalItem<ApplicationVersion[]>('versions', []);
  versions.push({
    id: `ver-${Date.now()}`,
    application_id: applicationId,
    version_number: newVersion,
    snapshot_data: { ...app, inventors },
    submitted_by: userId,
    submitted_at: now,
    submission_notes: notes || `Resubmitted as Version ${newVersion} with corrections.`,
  });

  setLocalItem('applications', applications);
  setLocalItem('corrections', updatedCorrections);
  setLocalItem('history', history);
  setLocalItem('versions', versions);

  return { ...app, inventors };
}

export async function transitionApplicationStatus(
  applicationId: string,
  newStatus: ApplicationStatus,
  reviewer: { id: string; role: AppRole },
  reason?: string
): Promise<Application> {
  if (reviewer.role !== 'admin') {
    throw new Error('Unauthorized transition: Only Patent Coordinators may transition application statuses.');
  }

  if (isSupabaseConfigured()) {
    const { error: rpcError } = await supabase.rpc('coordinator_transition_status', {
      p_application_id: applicationId,
      p_new_status: newStatus,
      p_reason: reason || null,
    });
    if (rpcError) throw new Error(rpcError.message);

    const updated = await fetchApplicationById(applicationId, reviewer);
    if (!updated) throw new Error('Failed to reload application after status transition');
    return updated;
  }

  ensureSupabaseOrTest();
  const applications = getLocalItem<Application[]>('applications', []);
  const index = applications.findIndex((a) => a.id === applicationId);
  if (index === -1) throw new Error('Application not found');

  const app = applications[index];
  if (!canTransition(app.status, newStatus, reviewer.role)) {
    throw new Error(`Invalid status transition from '${app.status}' to '${newStatus}' for role '${reviewer.role}'.`);
  }

  const now = new Date().toISOString();
  const fromStatus = app.status;
  app.status = newStatus;
  app.updated_at = now;
  applications[index] = app;

  const history = getLocalItem<ApplicationStatusHistory[]>('history', []);
  history.push({
    id: `hist-${Date.now()}`,
    application_id: applicationId,
    from_status: fromStatus,
    to_status: newStatus,
    changed_by: reviewer.id,
    reason: reason || `Status changed from ${fromStatus} to ${newStatus}.`,
    created_at: now,
  });

  setLocalItem('applications', applications);
  setLocalItem('history', history);

  const inventors = getLocalItem<Inventor[]>('inventors', []).filter((i) => i.application_id === applicationId);
  return { ...app, inventors };
}

export async function createCorrectionRequest(
  applicationId: string,
  reviewerId: string,
  comment: string,
  fieldName?: string,
  documentId?: string
): Promise<CorrectionRequest> {
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    let effectiveReviewerId = reviewerId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewerId);
    if (!isUuid) {
      const { data: authUser } = await supabase.auth.getUser();
      if (authUser.user?.id) effectiveReviewerId = authUser.user.id;
    }

    const { data, error } = await supabase
      .from('correction_requests')
      .insert({
        application_id: applicationId,
        reviewer_id: effectiveReviewerId,
        comment,
        field_name: fieldName || null,
        document_id: documentId || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as CorrectionRequest;
  }

  ensureSupabaseOrTest();
  const corrections = getLocalItem<CorrectionRequest[]>('corrections', []);
  const newRequest: CorrectionRequest = {
    id: `corr-${Date.now()}`,
    application_id: applicationId,
    reviewer_id: reviewerId,
    field_name: fieldName || null,
    document_id: documentId || null,
    comment,
    status: 'pending',
    created_at: now,
    resolved_at: null,
  };

  corrections.push(newRequest);
  setLocalItem('corrections', corrections);
  return newRequest;
}

// =============================================================================
// APPLICATION COMMENTS API
// =============================================================================

export async function addApplicationComment(
  applicationId: string,
  authorId: string,
  content: string,
  commentType: 'general' | 'internal_admin'
): Promise<void> {
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    let effectiveAuthorId = authorId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authorId);
    if (!isUuid) {
      const { data: authUser } = await supabase.auth.getUser();
      if (authUser.user?.id) effectiveAuthorId = authUser.user.id;
    }

    const { error } = await supabase.from('application_comments').insert({
      application_id: applicationId,
      author_id: effectiveAuthorId,
      comment_type: commentType,
      content,
    });
    if (error) throw new Error(error.message);
    return;
  }

  ensureSupabaseOrTest();
  const comments = getLocalItem<ApplicationComment[]>('comments', []);
  comments.push({
    id: `comm-${Date.now()}`,
    application_id: applicationId,
    author_id: authorId,
    comment_type: commentType,
    content,
    created_at: now,
  });
  setLocalItem('comments', comments);
}

export async function fetchApplicationComments(applicationId: string, role: AppRole) {
  if (isSupabaseConfigured()) {
    let query = supabase
      .from('application_comments')
      .select('*, author:profiles(*)')
      .eq('application_id', applicationId);

    if (role !== 'admin') {
      query = query.eq('comment_type', 'general');
    }

    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  }

  ensureSupabaseOrTest();
  const comments = getLocalItem<any[]>('comments', []).filter((c) => c.application_id === applicationId);
  const profiles = getLocalItem<Profile[]>('profiles', []);

  return comments
    .filter((c) => role === 'admin' || c.comment_type === 'general')
    .map((c) => ({
      ...c,
      author: profiles.find((p) => p.id === c.author_id),
    }))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

// =============================================================================
// PRIVATE DOCUMENT STORAGE API
// =============================================================================

export async function uploadDocument(
  applicationId: string,
  file: File,
  category: DocumentCategory,
  uploaderId: string
): Promise<ApplicationDocument> {
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error(
      `File exceeds maximum permitted size of 25 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB provided)`
    );
  }

  if (!ALLOWED_DOCUMENT_MIMES.includes(file.type)) {
    throw new Error(
      `Unsupported file type (${file.type}). Permitted types: PDF, DOC, DOCX, PNG, JPEG.`
    );
  }

  const ext = ('.' + (file.name.split('.').pop() || '')).toLowerCase();
  if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Unsupported file extension (${ext}). Permitted extensions: ${ALLOWED_DOCUMENT_EXTENSIONS.join(', ')}`
    );
  }

  const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'doc';
  const safeBase = baseName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  const safeFilename = `${safeBase}${ext}`;
  const storagePath = `${applicationId}/${Date.now()}_${safeFilename}`;
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const { error: uploadError } = await supabase.storage
      .from('patent-documents')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) throw new Error(uploadError.message);

    let effectiveUploaderId = uploaderId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploaderId);
    if (!isUuid) {
      const { data: authUser } = await supabase.auth.getUser();
      if (authUser.user?.id) effectiveUploaderId = authUser.user.id;
    }

    const { data: docRecord, error: docError } = await supabase
      .from('application_documents')
      .insert({
        application_id: applicationId,
        storage_path: storagePath,
        document_category: category,
        original_filename: file.name,
        mime_type: file.type,
        file_size_bytes: file.size,
        version_number: 1,
        uploaded_by: effectiveUploaderId,
      })
      .select()
      .single();

    if (docError) throw new Error(docError.message);
    return docRecord as ApplicationDocument;
  }

  ensureSupabaseOrTest();
  const documents = getLocalItem<ApplicationDocument[]>('documents', []);
  const docRecord: ApplicationDocument = {
    id: `doc-${Date.now()}`,
    application_id: applicationId,
    storage_path: storagePath,
    document_category: category,
    original_filename: file.name,
    mime_type: file.type,
    file_size_bytes: file.size,
    version_number: 1,
    uploaded_by: uploaderId,
    created_at: now,
  };

  documents.push(docRecord);
  setLocalItem('documents', documents);
  return docRecord;
}

export async function downloadSecureDocument(storagePath: string, filename: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { data: signedData, error: signError } = await supabase.storage
      .from('patent-documents')
      .createSignedUrl(storagePath, 60);

    if (signError || !signedData?.signedUrl) {
      throw new Error(signError?.message || 'Could not generate download URL for document.');
    }

    const response = await fetch(signedData.signedUrl);
    if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
    const blob = await response.blob();

    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
    return;
  }

  ensureSupabaseOrTest();
  const mockBlob = new Blob(
    [`%PDF-1.4 Institutional Confidential Patent Document Archive: ${filename}`],
    { type: 'application/pdf' }
  );
  const blobUrl = window.URL.createObjectURL(mockBlob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
}

export async function getDocumentSignedUrl(documentPath: string): Promise<string> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.storage
      .from('patent-documents')
      .createSignedUrl(documentPath, 900);
    if (error || !data?.signedUrl) throw new Error(error?.message || 'Failed to generate signed document URL');
    return data.signedUrl;
  }

  ensureSupabaseOrTest();
  return `data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og...`;
}

export const getSignedDocumentUrl = getDocumentSignedUrl;

export async function deleteDocument(documentId: string, _userId?: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await supabase.from('application_documents').delete().eq('id', documentId);
    if (error) throw new Error(error.message);
    return;
  }

  ensureSupabaseOrTest();
  const documents = getLocalItem<ApplicationDocument[]>('documents', []);
  setLocalItem('documents', documents.filter((d) => d.id !== documentId));
}

// =============================================================================
// IN-PORTAL NOTIFICATIONS API
// =============================================================================

export async function fetchNotifications(userId: string): Promise<InPortalNotification[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as InPortalNotification[];
  }

  ensureSupabaseOrTest();
  const notifications = getLocalItem<InPortalNotification[]>('notifications', []);
  return notifications
    .filter((n) => n.user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function markNotificationAsRead(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }

  ensureSupabaseOrTest();
  const notifications = getLocalItem<InPortalNotification[]>('notifications', []);
  const notif = notifications.find((n) => n.id === id);
  if (notif) {
    notif.is_read = true;
    setLocalItem('notifications', notifications);
  }
}
