// Super admin console in demo mode (browser storage stand-ins for the database functions)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextType } from '../features/auth/authContextDef';
import { SuperAdminDashboard } from '../pages/SuperAdminDashboard';
import { upsertProfile, fetchAdminAuditLog } from '../lib/api';

const superAdmin = { id: 'sa-1', university_email: 'it.admin@muj.manipal.edu', full_name: 'IT Admin', role: 'super_admin' } as AuthContextType['currentUser'];

let root: Root;
let container: HTMLDivElement;

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const click = (el: Element) => act(async () => (el as HTMLElement).click());
const byText = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
const typeInto = async (el: Element, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(async () => {
  localStorage.clear();
  await upsertProfile({ id: 'sa-1', university_email: 'it.admin@muj.manipal.edu', full_name: 'IT Admin', role: 'super_admin' });
  await upsertProfile({ id: 'st-1', university_email: 'riya.k@muj.manipal.edu', full_name: 'Riya K', role: 'student', department: 'CSE' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const value = { currentUser: superAdmin, isLoading: false } as AuthContextType;
  await act(async () =>
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={value}>
          <SuperAdminDashboard />
        </AuthContext.Provider>
      </MemoryRouter>
    )
  );
  await flush();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('super admin console', () => {
  it('summarises accounts without nagging about authenticators', () => {
    expect(container.querySelector('h1')!.textContent).toBe('Administration');
    expect(container.textContent).not.toContain('authenticator');
    expect(container.textContent).not.toMatch(/PostgreSQL Live|RLS Enforced/);
  });

  it('suspends a student with a reason, logs it, and shows it in Activity', async () => {
    await click(container.querySelector('#ac-tab-people')!);
    await click(container.querySelector('button[aria-label="Manage Riya K"]')!);
    await typeInto(document.querySelector('#ac-reason')!, 'Shared password');
    await click(byText('Suspend'));
    await click(byText('Suspend account'));
    await flush();
    expect(document.querySelector('[role="status"]')!.textContent).toContain('Account suspended');

    const log = await fetchAdminAuditLog();
    expect(log[0]).toMatchObject({ action: 'account_suspended', target_email: 'riya.k@muj.manipal.edu', details: { reason: 'Shared password' } });

    await click(document.querySelector('button[aria-label="Close"]')!);
    await click(byText('Activity'));
    expect(container.textContent).toContain('Suspended account');
    expect(container.textContent).toContain('Reason: Shared password');
  });

  it('does not let a super admin change their own role or suspend themselves', async () => {
    await click(container.querySelector('#ac-tab-people')!);
    await click(container.querySelector('button[aria-label="Manage IT Admin"]')!);
    expect(document.querySelector<HTMLSelectElement>('#ac-role')!.disabled).toBe(true);
    expect(byText('Suspend').disabled).toBe(true);
  });

  it('asks before closing registration', async () => {
    await click(container.querySelector('#ac-tab-settings')!);
    const toggle = container.querySelector('[role="switch"]')!;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await click(toggle);
    await click(byText('Close registration'));
    await flush();
    expect(container.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('false');
    expect((await fetchAdminAuditLog())[0].action).toBe('registration_closed');
  });
});

vi.setConfig({ testTimeout: 10_000 });
