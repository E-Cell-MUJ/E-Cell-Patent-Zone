import { createContext } from 'react';
import type { Profile, AppRole } from '../../types/database.types';

export interface AuthResult {
  error?: string;
  // The account exists but its mailbox is not verified yet: show the code step
  needsVerification?: boolean;
  // Password reset: this account has an authenticator, so its code is needed too
  needsTotp?: boolean;
  // Rate limited: seconds before the same action is worth trying again
  retryAfter?: number;
}

// 'enroll' / 'challenge': every signed-in user must pass TOTP before portal pages load
export type MfaStatus = 'not_required' | 'enroll' | 'challenge' | 'verified';

export interface AuthContextType {
  currentUser: Profile | null;
  isLoading: boolean;
  signInWithEmail: (email: string, password?: string, captchaToken?: string) => Promise<AuthResult>;
  registerUniversityAccount: (details: {
    email: string;
    password: string;
    fullName: string;
    department?: string;
    registrationNumber?: string;
    phone?: string;
    captchaToken?: string;
  }) => Promise<AuthResult>;
  verifyEmailCode: (email: string, code: string, captchaToken?: string) => Promise<AuthResult>;
  resendEmailCode: (email: string, captchaToken?: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  switchUserRoleForTesting: (role: AppRole) => Promise<void>;
  isAal2: boolean;
  mfaStatus: MfaStatus;
  enrollTotp: () => Promise<{ qrCode: string; secret: string; otpauthUri?: string } | { error: string }>;
  verifyTotpMfa: (code: string) => Promise<boolean>;
  // Forgot password via a 6-digit recovery code from Supabase Auth
  passwordRecovery: boolean;
  requestPasswordReset: (email: string, captchaToken?: string) => Promise<AuthResult>;
  verifyPasswordResetCode: (email: string, code: string, captchaToken?: string) => Promise<AuthResult>;
  completePasswordReset: (newPassword: string, totpCode?: string) => Promise<AuthResult>;
  cancelPasswordReset: () => Promise<void>;
  // Lost authenticator (students): password session + emailed code, then a new authenticator
  sendAuthenticatorResetCode: (captchaToken?: string) => Promise<AuthResult>;
  confirmAuthenticatorReset: (code: string, captchaToken?: string) => Promise<AuthResult>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
