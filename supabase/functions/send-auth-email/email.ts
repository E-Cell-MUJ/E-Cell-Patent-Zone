// Code emails for the Send Email hook. Same content as supabase/templates/*.html (used when
// the hook is off); keep them in sync.

// Auth emails that carry a 6-digit code, with the wording for each. Anything else (links, email change) is refused.
const COPY: Record<string, { subject: string; heading: string; intro: string; outro: string }> = {
  signup: {
    subject: 'Your MUJ Patent Portal verification code',
    heading: 'Your verification code',
    intro: 'Enter this code on the portal page where you signed up or signed in:',
    outro: 'If you did not request this, ignore this email. No account is activated without this code.',
  },
  recovery: {
    subject: 'Your MUJ Patent Portal password reset code',
    heading: 'Your password reset code',
    intro: 'Enter this code on the portal page where you asked to reset your password:',
    outro: 'If you did not request this, ignore this email. Your password stays the same without this code.',
  },
  magiclink: {
    subject: 'Your MUJ Patent Portal sign-in code',
    heading: 'Your sign-in code',
    intro: 'Enter this code on the portal page that asked for it, for example to reset a lost authenticator app:',
    outro: 'If you did not request this, ignore this email and consider changing your password.',
  },
};
COPY.email = COPY.signup;
COPY.reauthentication = COPY.signup;

export function buildCodeEmail(actionType: string, token: string): { subject: string; html: string } | null {
  const copy = COPY[actionType];
  // The token goes into HTML, so accept nothing but the expected 6 digits
  if (!copy || !/^\d{6}$/.test(token)) return null;
  return {
    subject: copy.subject,
    html: `<html lang="en">
  <body style="margin:0;padding:24px;background:#FAF7EE;font-family:Arial,Helvetica,sans-serif;color:#152E5A;">
    <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #EBE5D5;border-radius:16px;padding:28px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#204E96;">E-CELL MUJ · Patent Portal</p>
      <h1 style="margin:0 0 16px;font-size:20px;">${copy.heading}</h1>
      <p style="margin:0 0 8px;font-size:14px;">${copy.intro}</p>
      <p style="margin:0 0 16px;font-size:30px;font-weight:700;letter-spacing:8px;font-family:Consolas,monospace;">${token}</p>
      <p style="margin:0 0 8px;font-size:14px;">It expires in 10 minutes and works once. A newer code replaces this one.</p>
      <p style="margin:0;font-size:14px;">${copy.outro}</p>
      <p style="margin:24px 0 0;font-size:12px;color:#354F77;">Directorate of Research &amp; IPR Cell, Manipal University Jaipur</p>
    </div>
  </body>
</html>`,
  };
}
