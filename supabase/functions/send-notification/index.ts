// ==============================================================================
// Supabase Edge Function: send-notification
// Rule: Zero confidential invention text in email payloads (DPDP & IPR Safe)
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface NotificationPayload {
  recipient_email: string;
  recipient_name: string;
  event_type: 
    | "SUBMITTED" 
    | "CORRECTIONS_REQUESTED" 
    | "RESUBMITTED" 
    | "STATUS_CHANGED" 
    | "APPROVED_NEXT_STAGE" 
    | "REJECTED";
  reference_no: string;
  action_url?: string;
}

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const PORTAL_BASE_URL = Deno.env.get("PORTAL_BASE_URL") || "https://patents.muj.manipal.edu";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req: Request) => {
  // 1. Verify Request Method & Auth
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": PORTAL_BASE_URL,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");
  const isServiceRole = SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY;

  if (!isServiceRole) {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: { user }, error: userError } = await authClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else if (token.length < 20) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid token format" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  try {
    const payload: NotificationPayload = await req.json();

    // 2. Validate Domain of Recipient
    if (!payload.recipient_email || !payload.recipient_email.toLowerCase().endsWith("@muj.manipal.edu")) {
      return new Response(JSON.stringify({ error: "Recipient email must be @muj.manipal.edu" }), { status: 400 });
    }

    // 3. Construct Safe, Non-Confidential Copy
    let subject = `[MUJ IPR Portal] Update on Application ${payload.reference_no}`;
    let bodyHeadline = `Application Update: ${payload.reference_no}`;
    let bodyMessage = `There is a new update regarding your patent application in the official Manipal University Jaipur Patent Portal.`;

    switch (payload.event_type) {
      case "SUBMITTED":
        subject = `[MUJ IPR Portal] Application Submitted: ${payload.reference_no}`;
        bodyHeadline = `Application Successfully Received`;
        bodyMessage = `Your patent application has been registered under reference number ${payload.reference_no} and forwarded to the Patent Coordinator for initial review.`;
        break;
      case "CORRECTIONS_REQUESTED":
        subject = `[MUJ IPR Portal] Action Required: Corrections Requested on ${payload.reference_no}`;
        bodyHeadline = `Itemized Corrections Requested`;
        bodyMessage = `The Patent Coordinator has reviewed application ${payload.reference_no} and requested specific corrections. Please access your student correction workspace to review the itemized comments and resubmit.`;
        break;
      case "RESUBMITTED":
        subject = `[MUJ IPR Portal] Revision Received: ${payload.reference_no}`;
        bodyHeadline = `Updated Revision Submitted`;
        bodyMessage = `A revised snapshot has been submitted for application ${payload.reference_no} and is awaiting secondary review.`;
        break;
      case "APPROVED_NEXT_STAGE":
        subject = `[MUJ IPR Portal] Approved for Next Stage: ${payload.reference_no}`;
        bodyHeadline = `Application Approved for Next Stage`;
        bodyMessage = `Congratulations! Application ${payload.reference_no} has been approved by the Patent Coordinator to proceed to formal drafting / attorney review.`;
        break;
      case "REJECTED":
        subject = `[MUJ IPR Portal] Status Update on ${payload.reference_no}`;
        bodyHeadline = `Decision Recorded`;
        bodyMessage = `A formal decision has been recorded on application ${payload.reference_no}. Please log in to the portal to view the coordinator's written remarks.`;
        break;
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
            .container { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; }
            .header { background: #0a192f; color: #ffffff; padding: 20px 24px; border-bottom: 3px solid #d97706; }
            .header h1 { font-size: 16px; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
            .header p { font-size: 12px; margin: 4px 0 0 0; color: #94a3b8; }
            .content { padding: 24px; }
            .content h2 { font-size: 18px; margin: 0 0 12px 0; color: #0a192f; }
            .content p { font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0; }
            .badge { display: inline-block; padding: 4px 10px; background: #f1f5f9; border: 1px solid #cbd5e1; font-family: monospace; font-size: 13px; font-weight: 600; color: #0a192f; margin-bottom: 16px; border-radius: 3px; }
            .btn { display: inline-block; padding: 10px 20px; background: #0a192f; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 500; border-radius: 4px; }
            .footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Manipal University Jaipur</h1>
              <p>Directorate of Research & Intellectual Property Rights (IPR) Cell</p>
            </div>
            <div class="content">
              <div class="badge">${payload.reference_no}</div>
              <h2>${bodyHeadline}</h2>
              <p>Dear ${payload.recipient_name},</p>
              <p>${bodyMessage}</p>
              <p><a href="${payload.action_url || PORTAL_BASE_URL}" class="btn">Log In to Portal</a></p>
            </div>
            <div class="footer">
              <p><strong>Confidentiality Notice:</strong> In accordance with university IPR governance and Section 39 compliance, invention details and technical documentation are never transmitted via email. All actions must be conducted inside the secure portal.</p>
              <p>&copy; ${new Date().getFullYear()} Manipal University Jaipur. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // 4. Send via Resend API (if configured) or Mock Log in Dev
    if (RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "MUJ IPR Portal <notifications@muj.manipal.edu>",
          to: [payload.recipient_email],
          subject: subject,
          html: emailHtml,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Resend delivery failed:", errorText);
        return new Response(JSON.stringify({ error: "Failed to dispatch email", details: errorText }), { status: 502 });
      }
    } else {
      console.log(`[DEV EMAIL MOCK] Dispatched to ${payload.recipient_email} | Subject: ${subject}`);
    }

    return new Response(JSON.stringify({ success: true, reference_no: payload.reference_no }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
