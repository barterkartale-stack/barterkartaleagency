import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function hashCode(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.trim().toUpperCase()));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientIp(request: Request): string | null {
  const direct = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip");
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = direct || forwarded || null;
  return ip && ip.length <= 64 ? ip : null;
}

function safeMetadata(value: unknown, request: Request): Record<string, string> {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const permitted = ["platform", "language", "timezone", "screen"];
  const output: Record<string, string> = {};
  for (const key of permitted) {
    const item = input[key];
    if (typeof item === "string" && item.length <= 120) output[key] = item;
  }
  const userAgent = request.headers.get("user-agent");
  if (userAgent) output.userAgent = userAgent.slice(0, 300);
  return output;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in to finish registration." }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user?.id || !authData.user.email) return json({ error: "Sign in to finish registration." }, 401);

    const body = await request.json();
    const { displayName, mobileNumber, invitationCode, deviceFingerprint, deviceMetadata, securityConsent } = body;
    if (securityConsent !== true) return json({ error: "Please accept the security review disclosure." }, 400);
    if (typeof displayName !== "string" || displayName.trim().length < 2 || displayName.trim().length > 100) return json({ error: "Enter a valid full name." }, 400);
    if (typeof mobileNumber !== "string" || !/^[0-9+() -]{10,15}$/.test(mobileNumber.trim())) return json({ error: "Enter a valid mobile number." }, 400);
    if (typeof invitationCode !== "string" || !/^BK-[A-F0-9]{32}$/i.test(invitationCode.trim())) return json({ error: "The invitation code is invalid or expired." }, 400);

    const registrationIp = clientIp(request);
    if (!registrationIp) return json({ error: "We could not verify your sign-in network. Please refresh and try again." }, 400);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error } = await admin.rpc("complete_partner_registration", {
      p_user_id: authData.user.id,
      p_invitation_code_hash: await hashCode(invitationCode),
      p_display_name: displayName.trim(),
      p_mobile_number: mobileNumber.trim(),
      p_sign_up_ip: registrationIp,
      p_device_fingerprint: typeof deviceFingerprint === "string" ? deviceFingerprint.slice(0, 128) : null,
      p_device_metadata: safeMetadata(deviceMetadata, request),
      p_security_consent: securityConsent,
    }).maybeSingle();

    if (error || !profile) {
      const message = error?.message?.toLowerCase().includes("network")
        ? "Registration is not available from this network."
        : error?.message?.toLowerCase().includes("invitation")
          ? "The invitation code is invalid or expired."
          : "We could not finish registration. Please try again.";
      return json({ error: message }, 400);
    }

    return json({
      registered: true,
      accessStatus: profile.access_status,
      registeredAt: profile.registered_at,
      role: profile.role,
    });
  } catch {
    return json({ error: "We could not finish registration. Please try again." }, 400);
  }
});
