import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextType } from '../features/auth/authContextDef';
import { LoginPage } from '../pages/LoginPage';
import { MfaGate } from '../components/MfaGate';

function authValue(overrides: Partial<AuthContextType>): AuthContextType {
  return {
    currentUser: null,
    isLoading: false,
    signInWithEmail: vi.fn(async () => ({})),
    registerUniversityAccount: vi.fn(async () => ({})),
    verifyEmailCode: vi.fn(async () => ({})),
    resendEmailCode: vi.fn(async () => ({})),
    signOut: vi.fn(async () => {}),
    switchUserRoleForTesting: vi.fn(async () => {}),
    isAal2: true,
    mfaStatus: 'not_required',
    enrollTotp: vi.fn(async () => ({ error: 'unused' })),
    verifyTotpMfa: vi.fn(async () => false),
    passwordRecovery: false,
    requestPasswordReset: vi.fn(async () => ({})),
    verifyPasswordResetCode: vi.fn(async () => ({})),
    completePasswordReset: vi.fn(async () => ({})),
    cancelPasswordReset: vi.fn(async () => {}),
    sendAuthenticatorResetCode: vi.fn(async () => ({})),
    confirmAuthenticatorReset: vi.fn(async () => ({})),
    ...overrides,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(ui: React.ReactNode, value: AuthContextType) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <AuthContext.Provider value={value}>{ui}</AuthContext.Provider>
      </MemoryRouter>
    );
  });
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

const typeInto = async (el: Element, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const click = (el: Element) => act(async () => (el as HTMLElement).click());
const submit = (form: Element) =>
  act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
const buttonByText = (c: Element, text: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;

describe('registration email verification step', () => {
  it('asks for the emailed code after sign-up and verifies it', async () => {
    const verifyEmailCode = vi.fn(async () => ({ error: 'That code is invalid or has expired. Request a new code and try again.' }));
    const c = await render(
      <LoginPage />,
      authValue({ registerUniversityAccount: vi.fn(async () => ({ needsVerification: true })), verifyEmailCode })
    );

    await click(buttonByText(c, 'Register Account'));
    const inputs = c.querySelectorAll('form input');
    await typeInto(inputs[0], 'new.student');
    await typeInto(inputs[1], 'New Student');
    await typeInto(c.querySelector('input[placeholder="Min 6 characters"]')!, 'secret12');
    await typeInto(c.querySelector('input[placeholder="Re-enter password"]')!, 'secret12');
    await submit(c.querySelector('form')!);

    const codeInput = c.querySelector<HTMLInputElement>('#email-code')!;
    expect(codeInput).not.toBeNull();
    expect(codeInput.getAttribute('autocomplete')).toBe('one-time-code');
    expect(codeInput.getAttribute('inputmode')).toBe('numeric');
    expect(c.querySelector('label[for="email-code"]')!.textContent).toContain('n***@muj.manipal.edu');
    expect(c.textContent).not.toContain('new.student@');
    const resend = buttonByText(c, 'Send a new code');
    expect(resend.disabled).toBe(true);
    expect(resend.textContent).toContain('60s');

    await typeInto(codeInput, '12 3456');
    expect(codeInput.value).toBe('123456');
    await submit(c.querySelector('form')!);
    expect(verifyEmailCode).toHaveBeenCalledWith('new.student@muj.manipal.edu', '123456', undefined);
    expect(c.querySelector('[role="alert"]')!.textContent).toContain('invalid or has expired');

    await click(buttonByText(c, 'Wrong email? Go back'));
    expect(c.querySelector('#email-code')).toBeNull();
    expect(c.querySelector<HTMLInputElement>('form input')!.value).toBe('new.student');
  });

  it('sends unverified sign-ins to the code step without auto-sending a code', async () => {
    const resendEmailCode = vi.fn(async () => ({}));
    const c = await render(
      <LoginPage />,
      authValue({ signInWithEmail: vi.fn(async () => ({ needsVerification: true, error: 'x' })), resendEmailCode })
    );
    await typeInto(c.querySelector('input[autocomplete="username"]')!, 'legacy.user');
    await typeInto(c.querySelector('input[autocomplete="current-password"]')!, 'secret12');
    await submit(c.querySelector('form')!);

    const resend = buttonByText(c, 'Send a new code');
    expect(resend.disabled).toBe(false);
    await click(resend);
    expect(resendEmailCode).toHaveBeenCalledWith('legacy.user@muj.manipal.edu', undefined);
    expect(buttonByText(c, 'Send a new code').disabled).toBe(true);
  });

  it('holds the sign-in button for the rate-limit wait, so repeat clicks send nothing', async () => {
    const signInWithEmail = vi.fn(async () => ({ error: 'Too many attempts from this network.', retryAfter: 30 }));
    const c = await render(<LoginPage />, authValue({ signInWithEmail }));
    await typeInto(c.querySelector('input[autocomplete="username"]')!, 'aditya.sharma');
    await typeInto(c.querySelector('input[autocomplete="current-password"]')!, 'secret12');
    await submit(c.querySelector('form')!);

    const button = c.querySelector<HTMLButtonElement>('form button[type="submit"]')!;
    expect(button.textContent).toContain('Try again in 30s');
    expect(button.disabled).toBe(true);
    expect(c.querySelector('[role="alert"]')!.textContent).toContain('Too many attempts');
  });
});

describe('coordinator TOTP gate', () => {
  it('enrolls an authenticator app, then rejects a wrong code', async () => {
    const verifyTotpMfa = vi.fn(async () => false);
    const c = await render(
      <MfaGate />,
      authValue({
        mfaStatus: 'enroll',
        enrollTotp: vi.fn(async () => ({ qrCode: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>', secret: 'JBSWY3DPEHPK3PXP' })),
        verifyTotpMfa,
      })
    );
    expect(c.querySelector('#totp-code')).toBeNull();
    await click(buttonByText(c, 'Set up authenticator app'));
    expect(c.querySelector('img')!.getAttribute('alt')).toContain('authenticator app');
    expect(c.textContent).toContain('JBSWY3DPEHPK3PXP');

    await typeInto(c.querySelector('#totp-code')!, '000000');
    await submit(c.querySelector('form')!);
    expect(verifyTotpMfa).toHaveBeenCalledWith('000000');
    expect(c.querySelector('[role="alert"]')!.textContent).toContain('did not match');
  });

  it('asks enrolled coordinators for their current code only', async () => {
    const c = await render(<MfaGate />, authValue({ mfaStatus: 'challenge' }));
    expect(c.querySelector('#totp-code')).not.toBeNull();
    expect(buttonByText(c, 'Set up authenticator app')).toBeUndefined();
  });
});

const student = {
  id: 'st1',
  university_email: 'aditya.sharma@muj.manipal.edu',
  full_name: 'Aditya Sharma',
  role: 'student',
} as AuthContextType['currentUser'];

describe('login page', () => {
  it('offers no credential quick-fill', async () => {
    const c = await render(<LoginPage />, authValue({}));
    expect(c.textContent).not.toContain('Quick-Fill');
    expect(c.querySelector<HTMLInputElement>('input[autocomplete="username"]')!.value).toBe('');
  });
});

describe('forgot password', () => {
  it('emails a code, checks it, then sets a new password with the authenticator code', async () => {
    const requestPasswordReset = vi.fn(async () => ({}));
    const verifyPasswordResetCode = vi.fn(async () => ({ needsTotp: true }));
    const completePasswordReset = vi.fn(async () => ({}));
    const c = await render(<LoginPage />, authValue({ requestPasswordReset, verifyPasswordResetCode, completePasswordReset }));

    await click(buttonByText(c, 'Forgot Password?'));
    await typeInto(c.querySelector('#reset-username')!, 'aditya.sharma');
    await submit(c.querySelector('form')!);
    expect(requestPasswordReset).toHaveBeenCalledWith('aditya.sharma@muj.manipal.edu', undefined);
    expect(c.querySelector('[role="status"]')!.textContent).toContain('a***@muj.manipal.edu');

    await typeInto(c.querySelector('#reset-code')!, '123 456');
    await submit(c.querySelector('form')!);
    expect(verifyPasswordResetCode).toHaveBeenCalledWith('aditya.sharma@muj.manipal.edu', '123456', undefined);

    await typeInto(c.querySelector('#new-password')!, 'newpass1');
    await typeInto(c.querySelector('#new-password-2')!, 'newpass1');
    await submit(c.querySelector('form')!);
    expect(completePasswordReset).not.toHaveBeenCalled();
    expect(c.querySelector('[role="alert"]')!.textContent).toContain('authenticator app');

    await typeInto(c.querySelector('#reset-totp')!, '654321');
    await submit(c.querySelector('form')!);
    expect(completePasswordReset).toHaveBeenCalledWith('newpass1', '654321');
    expect(c.querySelector('[role="status"]')!.textContent).toContain('Password changed');
    expect(c.querySelector<HTMLInputElement>('input[autocomplete="username"]')!.value).toBe('aditya.sharma');
  });

  it('rejects a wrong code without moving on', async () => {
    const c = await render(
      <LoginPage />,
      authValue({ verifyPasswordResetCode: vi.fn(async () => ({ error: 'That code is invalid or has expired.' })) })
    );
    await click(buttonByText(c, 'Forgot Password?'));
    await typeInto(c.querySelector('#reset-username')!, 'aditya.sharma');
    await submit(c.querySelector('form')!);
    await typeInto(c.querySelector('#reset-code')!, '000000');
    await submit(c.querySelector('form')!);
    expect(c.querySelector('#new-password')).toBeNull();
    expect(c.querySelector('[role="alert"]')!.textContent).toContain('invalid or has expired');
  });
});

describe('student authenticator', () => {
  it('asks students for an authenticator code too', async () => {
    const c = await render(<MfaGate />, authValue({ currentUser: student, mfaStatus: 'challenge' }));
    expect(c.querySelector('#totp-code')).not.toBeNull();
    expect(c.textContent).toContain('Portal access');
  });

  it('resets a lost authenticator with an emailed code', async () => {
    const sendAuthenticatorResetCode = vi.fn(async () => ({}));
    const confirmAuthenticatorReset = vi.fn(async () => ({}));
    const c = await render(
      <MfaGate />,
      authValue({ currentUser: student, mfaStatus: 'challenge', sendAuthenticatorResetCode, confirmAuthenticatorReset })
    );
    await click(buttonByText(c, 'Lost your authenticator app?'));
    await click(buttonByText(c, 'Email me a code'));
    expect(sendAuthenticatorResetCode).toHaveBeenCalled();

    await typeInto(c.querySelector('#lost-code')!, '112233');
    await submit(c.querySelector('form')!);
    expect(confirmAuthenticatorReset).toHaveBeenCalledWith('112233', undefined);
    expect(c.querySelector('[role="status"]')!.textContent).toContain('Set up the new one');
  });

  it('does not offer self-service reset to coordinators', async () => {
    const c = await render(
      <MfaGate />,
      authValue({ currentUser: { ...student!, role: 'admin' }, mfaStatus: 'challenge' })
    );
    expect(buttonByText(c, 'Lost your authenticator app?')).toBeUndefined();
  });
});
