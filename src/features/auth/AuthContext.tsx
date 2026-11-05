/**
 * Manipal University Jaipur — Patent Application & Disclosure Portal
 * Lead Architect & Maintainer: SynthReaper <codewithaditya8002@gmail.com>
 * Institutional Authentication Context & Session Security Layer
 */

import React, { useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import type { Profile, AppRole } from '../../types/database.types';
import { fetchCurrentProfile } from '../../lib/api';
import { isAllowedUniversityEmail } from './authUtils';
import { isOtpCode } from './otp';
import { SECURITY_RULES } from '../../config/constants';
import { AuthContext, type AuthContextType, type AuthResult, type MfaStatus } from './authContextDef';

export { AuthContext, type AuthContextType };

const GENERIC_CODE_ERROR = 'That code is invalid or has expired. Request a new code and try again.';

// Supabase Auth failures the user can act on (rate limits, captcha, email delivery)
function authErrorResult(error?: { code?: string; message?: string } | null): AuthResult | null {
  if (!error) return null;
  const message = error.message ?? '';
  const seconds = Number(/after (\d+) seconds?/i.exec(message)?.[1]);
  if (seconds) return { error: `For security, wait ${seconds} seconds before trying again.`, retryAfter: seconds };
  if (error.code === 'over_email_send_rate_limit') {
    return { error: 'The portal has reached its email limit for now. Please try again in a few minutes.', retryAfter: 60 };
  }
  if (error.code === 'over_request_rate_limit') {
    return { error: 'Too many attempts from this network. Please wait a minute and try again.', retryAfter: 60 };
  }
  if (error.code === 'captcha_failed') return { error: 'Please complete the security check and try again.' };
  if (/error sending .*email/i.test(message)) {
    return { error: 'The code email could not be sent right now. Please try again later or contact the IPR cell.' };
  }
  return null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>('not_required');
  // Set while a forgot-password reset holds a recovery session, so the login page does not redirect
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const recoveryEmail = useRef<string | null>(null);
  // Lost authenticator: the password session's token, kept while the emailed code replaces the session
  const passwordSessionToken = useRef<string | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);

  const isAal2 = mfaStatus === 'verified' || mfaStatus === 'not_required';

  const refreshMfa = async (_profile: Profile | null) => {
    setMfaStatus('not_required');
  };

  const loadProfile = async (userId: string) => {
    try {
      const profile = await fetchCurrentProfile(userId);
      setCurrentUser(profile);
      await refreshMfa(profile);
      return profile;
    } catch (err) {
      console.error('Failed to load profile for user:', userId, err);
      setCurrentUser(null);
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;
    let authSubscription: { unsubscribe: () => void } | null = null;

    async function initAuth() {
      try {
        if (!isSupabaseConfigured()) {
          console.warn('[PORTAL] Supabase is not configured.');
          if (isMounted) setIsLoading(false);
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (session?.user) {
          await loadProfile(session.user.id);
        }

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
          setTimeout(() => {
            if (!isMounted) return;
            if (session?.user) {
              void loadProfile(session.user.id);
            } else {
              setCurrentUser(null);
              setMfaStatus('not_required');
            }
          }, 0);
        });
        authSubscription = authListener.subscription;
      } catch (err) {
        console.error('Error initializing authentication:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();

    return () => {
      isMounted = false;
      authSubscription?.unsubscribe();
    };
  }, []);

  const signInWithEmail = async (email: string, password?: string, captchaToken?: string): Promise<AuthResult> => {
    setIsLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!isAllowedUniversityEmail(normalizedEmail)) {
        return { error: SECURITY_RULES.RESTRICTED_EMAIL_ERROR };
      }
      if (!password) {
        return { error: 'Please enter your account password to verify identity.' };
      }

      if (!isSupabaseConfigured()) {
        return { error: 'Database service is unavailable. Please verify connection.' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
        options: { captchaToken },
      });

      if (error) {
        if (error.code === 'email_not_confirmed') {
          return {
            needsVerification: true,
            error: 'Your university email is not verified yet. Send yourself a code and enter it below.',
          };
        }
        return authErrorResult(error) ?? { error: 'Invalid email or password.' };
      }

      const profile = await loadProfile(data.user.id);
      if (!profile) {
        return { error: 'Your account is authenticated, but no institutional profile exists. Please contact the IPR cell.' };
      }
      return {};
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : 'Authentication failed' };
    } finally {
      setIsLoading(false);
    }
  };

  const registerUniversityAccount: AuthContextType['registerUniversityAccount'] = async (details) => {
    setIsLoading(true);
    try {
      const normalizedEmail = details.email.trim().toLowerCase();
      if (!isAllowedUniversityEmail(normalizedEmail)) {
        return { error: SECURITY_RULES.RESTRICTED_EMAIL_ERROR };
      }
      if (!details.password || details.password.length < 8) {
        return { error: 'Password must be at least 8 characters in length.' };
      }
      if (!/[a-zA-Z]/.test(details.password) || !/[0-9]/.test(details.password)) {
        return { error: 'Password must include both letters and numbers.' };
      }
      if (!details.fullName || details.fullName.trim().length < 2) {
        return { error: 'Please enter your full legal name as registered in university records.' };
      }

      if (!isSupabaseConfigured()) {
        return { error: 'Database service is unavailable. Please verify connection.' };
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: details.password,
        options: {
          captchaToken: details.captchaToken,
          data: {
            full_name: details.fullName.trim(),
            department: details.department?.trim() || null,
            registration_number: details.registrationNumber?.trim() || null,
            phone: details.phone?.trim() || null,
          },
        },
      });

      if (error) {
        const known = authErrorResult(error);
        if (known) return known;
        if (error.code === 'weak_password' || error.code === 'validation_failed') return { error: error.message };
        return { error: 'Registration could not be completed. Please try again in a minute; if it keeps failing, contact the IPR cell.' };
      }

      if (data.session) {
        await loadProfile(data.session.user.id);
        return {};
      }
      return { needsVerification: true };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : 'Registration failed' };
    } finally {
      setIsLoading(false);
    }
  };

  const verifyEmailCode = async (email: string, code: string, captchaToken?: string): Promise<AuthResult> => {
    if (!isOtpCode(code)) return { error: 'Enter the 6-digit code from the email.' };
    if (!isSupabaseConfigured()) {
      return { error: 'Database service is unavailable.' };
    }
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type: 'email',
      options: { captchaToken },
    });
    if (error || !data.user) return authErrorResult(error) ?? { error: GENERIC_CODE_ERROR };
    const profile = await loadProfile(data.user.id);
    return profile ? {} : { error: 'Your email is verified, but the account is not active yet. Please contact the IPR cell.' };
  };

  const resendEmailCode = async (email: string, captchaToken?: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured()) {
      return { error: 'Database service is unavailable.' };
    }
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: { captchaToken },
    });
    return authErrorResult(error) ?? {};
  };

  const enrollTotp: AuthContextType['enrollTotp'] = async () => {
    if (!isSupabaseConfigured()) {
      return { error: 'Database service is unavailable.' };
    }
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const factor of factors?.all ?? []) {
      if (factor.factor_type === 'totp' && factor.status === 'unverified') {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'MUJ Patent Portal' });
    if (error || !data) return { error: error?.message || 'Could not start authenticator setup.' };
    setPendingFactorId(data.id);
    return { qrCode: data.totp.qr_code, secret: data.totp.secret };
  };

  const verifyTotpMfa = async (code: string): Promise<boolean> => {
    const trimmed = code.trim();
    if (!isOtpCode(trimmed)) return false;
    if (!isSupabaseConfigured()) return false;
    let factorId = pendingFactorId;
    if (!factorId) {
      const { data } = await supabase.auth.mfa.listFactors();
      factorId = data?.totp[0]?.id ?? null;
    }
    if (!factorId) return false;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: trimmed });
    if (error) return false;
    setPendingFactorId(null);
    await refreshMfa(currentUser);
    return true;
  };

  const requestPasswordReset: AuthContextType['requestPasswordReset'] = async (email, captchaToken) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isAllowedUniversityEmail(normalizedEmail)) return { error: SECURITY_RULES.RESTRICTED_EMAIL_ERROR };
    if (!isSupabaseConfigured()) return { error: 'Database service is unavailable.' };
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { captchaToken });
    return authErrorResult(error) ?? {};
  };

  const verifyPasswordResetCode: AuthContextType['verifyPasswordResetCode'] = async (email, code, captchaToken) => {
    if (!isOtpCode(code)) return { error: 'Enter the 6-digit code from the email.' };
    const normalizedEmail = email.trim().toLowerCase();
    setPasswordRecovery(true);
    if (!isSupabaseConfigured()) {
      setPasswordRecovery(false);
      return { error: 'Database service is unavailable.' };
    }
    const { error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: code,
      type: 'recovery',
      options: { captchaToken },
    });
    if (error) {
      setPasswordRecovery(false);
      return authErrorResult(error) ?? { error: GENERIC_CODE_ERROR };
    }
    recoveryEmail.current = normalizedEmail;
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return { needsTotp: data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2' };
  };

  const completePasswordReset: AuthContextType['completePasswordReset'] = async (newPassword, totp) => {
    if (newPassword.length < 8) return { error: 'Password must be at least 8 characters in length.' };
    if (!isSupabaseConfigured()) return { error: 'Database service is unavailable.' };
    if (totp) {
      const { data } = await supabase.auth.mfa.listFactors();
      const factorId = data?.totp[0]?.id;
      if (!factorId || (await supabase.auth.mfa.challengeAndVerify({ factorId, code: totp.trim() })).error) {
        return { error: 'That authenticator code did not match. Try the current code.', needsTotp: true };
      }
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      if (error.code === 'insufficient_aal') {
        return { error: 'Enter the code from your authenticator app to change the password.', needsTotp: true };
      }
      if (error.code === 'same_password') return { error: 'Choose a password you have not used for this account.' };
      if (error.code === 'weak_password') return { error: error.message };
      return { error: 'The password could not be changed. Request a new code and try again.' };
    }
    await supabase.auth.signOut();
    setCurrentUser(null);
    setMfaStatus('not_required');
    setPasswordRecovery(false);
    recoveryEmail.current = null;
    return {};
  };

  const cancelPasswordReset = async () => {
    if (passwordRecovery && isSupabaseConfigured()) {
      await supabase.auth.signOut();
      setCurrentUser(null);
      setMfaStatus('not_required');
    }
    setPasswordRecovery(false);
    recoveryEmail.current = null;
  };

  const sendAuthenticatorResetCode: AuthContextType['sendAuthenticatorResetCode'] = async (captchaToken) => {
    if (!currentUser) return { error: 'Please sign in again.' };
    if (currentUser.role !== 'student') return { error: 'Coordinators and super admins: ask a super admin to reset your authenticator.' };
    if (!isSupabaseConfigured()) return { error: 'Database service is unavailable.' };
    const { data } = await supabase.auth.getSession();
    passwordSessionToken.current = data.session?.access_token ?? null;
    const { error } = await supabase.auth.signInWithOtp({
      email: currentUser.university_email,
      options: { shouldCreateUser: false, captchaToken },
    });
    if (!error) return {};
    return authErrorResult(error) ?? { error: 'The code could not be sent. Please try again shortly.' };
  };

  const confirmAuthenticatorReset: AuthContextType['confirmAuthenticatorReset'] = async (code, captchaToken) => {
    if (!currentUser) return { error: 'Please sign in again.' };
    if (!isOtpCode(code)) return { error: 'Enter the 6-digit code from the email.' };
    if (!isSupabaseConfigured()) return { error: 'Database service is unavailable.' };
    const passwordToken = passwordSessionToken.current;
    if (!passwordToken) return { error: 'Please send a new code first.' };
    const { error } = await supabase.auth.verifyOtp({
      email: currentUser.university_email,
      token: code,
      type: 'email',
      options: { captchaToken },
    });
    if (error) return authErrorResult(error) ?? { error: GENERIC_CODE_ERROR };
    const { error: resetError } = await supabase.functions.invoke('reset-authenticator', {
      body: { password_access_token: passwordToken },
    });
    passwordSessionToken.current = null;
    if (resetError) return { error: 'The authenticator could not be reset. Sign out, sign in again and retry.' };
    await supabase.auth.refreshSession();
    await refreshMfa(currentUser);
    return {};
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      }
      setCurrentUser(null);
      setMfaStatus('not_required');
    } finally {
      setIsLoading(false);
    }
  };

  const switchUserRoleForTesting = async (_role: AppRole) => {
    // In production live mode, roles are governed strictly by Supabase auth and profiles
    console.warn('[PORTAL] switchUserRoleForTesting is disabled in live testing mode.');
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoading,
        signInWithEmail,
        registerUniversityAccount,
        verifyEmailCode,
        resendEmailCode,
        signOut,
        switchUserRoleForTesting,
        isAal2,
        mfaStatus,
        enrollTotp,
        verifyTotpMfa,
        passwordRecovery,
        requestPasswordReset,
        verifyPasswordResetCode,
        completePasswordReset,
        cancelPasswordReset,
        sendAuthenticatorResetCode,
        confirmAuthenticatorReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export { useAuth } from './useAuth';
