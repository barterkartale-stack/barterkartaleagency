import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function hashCode(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ valid: false }, 405);

  try {
    const { invitationCode } = await request.json();
    if (typeof invitationCode !== "string" || !/^BK-[A-F0-9]{32}$/i.test(invitationCode.trim())) {
      return json({ valid: false });
    }

    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client
      .from("agency_invitation_codes")
      .select("id, used_count, max_uses, expires_at")
      .eq("code_hash", await hashCode(invitationCode))
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) return json({ valid: false }, 503);
    const valid = Boolean(data && data.used_count < data.max_uses && new Date(data.expires_at).getTime() > Date.now());
    return json({ valid });
  } catch {
    return json({ valid: false }, 400);
  }
});
