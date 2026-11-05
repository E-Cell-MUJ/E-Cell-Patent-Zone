import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../App';

describe('App Root and Routing Verification', () => {
  it('renders student workspace immediately on root route without marketing landing fluff', async () => {
    localStorage.clear();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    // Wait for microtasks
    await new Promise((r) => setTimeout(r, 100));

    expect(document.body.textContent).toContain('Manipal University Jaipur');
    expect(document.body.textContent).toContain('Directorate of Research & IPR Cell');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
