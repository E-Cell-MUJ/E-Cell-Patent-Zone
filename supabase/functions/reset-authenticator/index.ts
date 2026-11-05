// ==============================================================================
// Supabase Edge Function: reset-authenticator
// A student who lost their authenticator app removes it with two factors:
//   1. the access token of a session signed in with their password (body), and
//   2. the access token of a session opened with a fresh emailed code (Authorization header).
// The function then deletes the account's TOTP factors; the portal asks for a new one.
// Coordinators and super admins are refused: a super admin resets them.
// ==============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { checkResetTokens, decodeJwtPayload } from "./checks.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PORTAL_BASE_URL = Deno.env.get("PORTAL_BASE_URL") ?? "https://patents.muj.manipal.edu";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  const isAllowed =
    origin === PORTAL_BASE_URL ||
    origin === "http://localhost:5173" ||
    origin === "http://localhost:3000" ||
    (origin && origin.endsWith(".manipal.edu"));

  return {
    "Access-Control-Allow-Origin": isAllowed && origin ? origin : PORTAL_BASE_URL,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const emailCodeToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  let passwordToken: unknown;
  try {
    passwordToken = (await req.json())?.password_access_token;
  } catch {
    return json(400, { error: "Invalid request" });
  }
  if (typeof passwordToken !== "string" || !emailCodeToken) return json(400, { error: "Invalid request" });

  // getUser checks each token's signature, expiry and session with Supabase Auth
  const [byPassword, byEmailCode] = await Promise.all([admin.auth.getUser(passwordToken), admin.auth.getUser(emailCodeToken)]);
  if (byPassword.error || byEmailCode.error || !byEmailCode.data.user) {
    return json(401, { error: "Your sign-in expired. Sign in again and retry." });
  }
  const refused = checkResetTokens(decodeJwtPayload(passwordToken), decodeJwtPayload(emailCodeToken), Date.now() / 1000);
  if (refused) return json(403, { error: refused });

  const userId = byEmailCode.data.user.id;
  const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).single();
  if (profile?.role !== "student") return json(403, { error: "Ask a super admin to reset your authenticator." });

  const { data: listed, error: listError } = await admin.auth.admin.mfa.listFactors({ userId });
  if (listError) return json(500, { error: "The authenticator could not be reset." });
  for (const factor of listed.factors) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    if (error) return json(500, { error: "The authenticator could not be reset." });
  }
  // End the password session; the emailed-code session goes on to set up the new app
  await admin.auth.admin.signOut(passwordToken, "local");
  console.log(JSON.stringify({ event: "authenticator_reset", user_id: userId, factors_removed: listed.factors.length }));
  return json(200, { removed: listed.factors.length });
});
