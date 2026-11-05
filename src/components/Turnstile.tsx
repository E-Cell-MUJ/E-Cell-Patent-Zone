import React, { useEffect, useRef } from 'react';
import { ENV } from '../config/env';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptLoad: Promise<void> | null = null;

function loadScript(): Promise<void> {
  scriptLoad ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoad = null;
      reject(new Error('Security check failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

/**
 * Cloudflare Turnstile check required by Supabase Auth before sign-up, sign-in and code emails.
 * Renders nothing when VITE_TURNSTILE_SITE_KEY is unset. Tokens are single-use: change resetKey after each request.
 */
export const Turnstile: React.FC<{ onToken: (token: string | null) => void; resetKey: number }> = ({ onToken, resetKey }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ENV.TURNSTILE_SITE_KEY) return;
    let widgetId: string | undefined;
    let cancelled = false;
    onToken(null);
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: ENV.TURNSTILE_SITE_KEY,
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      })
      .catch(() => onToken(null));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
    // onToken is a state setter; only resetKey should re-render the widget
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  return ENV.TURNSTILE_SITE_KEY ? <div ref={ref} style={{ margin: '4px 0 16px', minHeight: 65 }} /> : null;
};
