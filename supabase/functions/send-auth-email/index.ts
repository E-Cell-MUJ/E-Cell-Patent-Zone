// ==============================================================================
// Supabase Edge Function: send-auth-email (Auth "Send Email" hook)
// Sends sign-up / verification codes from a university Microsoft 365 (Outlook)
// mailbox through Microsoft Graph with OAuth. Supabase's SMTP settings only take a
// password, and Exchange Online turns password (Basic) SMTP sign-in off by default
// from end of December 2026.
// Setup: docs/security/email-otp-and-2fa.md, section 10.
// ==============================================================================

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { buildCodeEmail } from "./email.ts";

const HOOK_SECRET = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
const TENANT_ID = Deno.env.get("MS_TENANT_ID") ?? "";
const CLIENT_ID = Deno.env.get("MS_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET") ?? "";
// The only mailbox Exchange lets this app send as, e.g. patent-portal@muj.manipal.edu
const SENDER_MAILBOX = Deno.env.get("MS_SENDER_MAILBOX") ?? "";

interface HookPayload {
  user: { email: string };
  email_data: { token: string; email_action_type: string };
}

// Supabase Auth shows this message to the user and logs it
const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function graphAccessToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!res.ok) throw new Error(`Microsoft sign-in failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail(405, "Method not allowed");

  // Only Supabase Auth holds the hook secret; this check replaces JWT verification
  let payload: HookPayload;
  try {
    payload = new Webhook(HOOK_SECRET).verify(await req.text(), Object.fromEntries(req.headers)) as HookPayload;
  } catch {
    return fail(401, "Invalid hook signature");
  }

  const { user, email_data } = payload;
  // Never email outside the university, even if the database domain check were bypassed
  if (!/^[a-z0-9._-]+@muj\.manipal\.edu$/i.test(user.email)) {
    return fail(400, "Recipient must be an @muj.manipal.edu address");
  }
  const message = buildCodeEmail(email_data.email_action_type, email_data.token);
  if (!message) return fail(400, `Unsupported auth email type: ${email_data.email_action_type}`);

  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER_MAILBOX)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await graphAccessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: { contentType: "HTML", content: message.html },
          toRecipients: [{ emailAddress: { address: user.email } }],
        },
        saveToSentItems: false,
      }),
    });
    // Graph answers 202 Accepted on success
    if (res.status !== 202) throw new Error(`Graph sendMail failed (${res.status}): ${await res.text()}`);
  } catch (err) {
    // Logs the failure reason only; never the code
    console.error(err instanceof Error ? err.message : err);
    return fail(502, "The verification email could not be sent. Please try again shortly.");
  }

  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
});
