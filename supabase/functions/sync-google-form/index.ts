import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type Field = { key: string; label: string; entryId: string; suggestedKey: string | null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

function googleFormsUrl(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 2048) throw new Error("Enter a Google Forms URL.");
  const url = new URL(raw);
  const isPublishedGoogleForm = url.hostname === "docs.google.com" && url.pathname.toLowerCase().includes("/forms/");
  const isShortGoogleForm = url.hostname === "forms.gle" && url.pathname.length > 1;
  if (url.protocol !== "https:" || url.username || url.password || (!isPublishedGoogleForm && !isShortGoogleForm)) {
    throw new Error("Only HTTPS Google Forms links are supported.");
  }
  return url;
}

function mapLabel(label: string, formType: "order" | "refund"): string | null {
  const normalized = label.toLowerCase();
  const candidates = formType === "order"
    ? [["name", /full.?name|customer.?name|your.?name/], ["delivery_address", /address|delivery/], ["platform", /platform|marketplace/], ["campaign_type", /campaign|deal|offer|type/], ["tracking_order_id", /order.?id|tracking|reference/]] as const
    : [["name", /full.?name|customer.?name|your.?name/], ["platform", /platform|marketplace/], ["campaign_type", /campaign|deal|offer|type/], ["upi_id", /upi/], ["proof_filename", /proof|screenshot|image|file/], ["enrollment_id", /enrollment|order.?id|reference/]] as const;
  return candidates.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

function extractFields(html: string, formType: "order" | "refund"): Field[] {
  const found = new Map<string, Field>();
  const pattern = /entry\.(\d{1,20})/g;
  for (const match of html.matchAll(pattern)) {
    const entryId = match[1];
    if (found.has(entryId)) continue;
    const index = match.index ?? 0;
    const snippet = html.slice(Math.max(0, index - 320), Math.min(html.length, index + 160));
    const text = snippet
      .replace(/\\u003c/gi, "<")
      .replace(/\\u003e/gi, ">")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#39;|&quot;|&amp;/g, " ")
      .replace(/["{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const label = text.slice(-140) || `Form field ${found.size + 1}`;
    found.set(entryId, { key: entryId, label, entryId, suggestedKey: mapLabel(label, formType) });
  }
  return Array.from(found.values()).slice(0, 40);
}

async function resolveForm(raw: unknown): Promise<{ pageUrl: URL; responseUrl: URL; html: string }> {
  const inputUrl = googleFormsUrl(raw);
  const response = await fetch(inputUrl, { redirect: "follow", signal: AbortSignal.timeout(9000) });
  const pageUrl = new URL(response.url);
  if (!response.ok || pageUrl.protocol !== "https:" || pageUrl.hostname !== "docs.google.com") {
    throw new Error("Could not read that published Google Form. Check its sharing settings and URL.");
  }
  const html = await response.text();
  if (html.length > 5_000_000) throw new Error("This Google Form page is too large to inspect.");
  const responseUrl = new URL(pageUrl);
  responseUrl.pathname = responseUrl.pathname.replace(/\/viewform\/?$/i, "/formResponse");
  if (!responseUrl.pathname.endsWith("/formResponse")) responseUrl.pathname = `${responseUrl.pathname.replace(/\/$/, "")}/formResponse`;
  responseUrl.search = "";
  return { pageUrl, responseUrl, html };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in required." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sign in required." }, 401);

    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile } = await service.from("profiles").select("role, access_status").eq("id", authData.user.id).maybeSingle();
    if (!profile || profile.access_status !== "active") return json({ error: "Active account required." }, 403);

    const body = await request.json();
    if (body.action === "discover") {
      if (profile.role !== "Super_Admin") return json({ error: "Administrator access required." }, 403);
      const formType = body.formType === "refund" ? "refund" : "order";
      const resolved = await resolveForm(body.url);
      const fields = extractFields(resolved.html, formType);
      return json({
        resolvedUrl: resolved.pageUrl.toString(),
        fields,
        suggestedMap: Object.fromEntries(fields.filter((field) => field.suggestedKey).map((field) => [field.suggestedKey!, field.entryId])),
      });
    }

    if (body.action !== "sync-enrollment" && body.action !== "sync-refund") return json({ error: "Unsupported action." }, 400);
    const refund = body.action === "sync-refund";
    const rowId = typeof body.recordId === "string" ? body.recordId : "";
    if (!rowId || rowId.length > 64) return json({ error: "Record not found." }, 404);
    const table = refund ? "refunds" : "campaign_enrollments";
    const { data: row, error: rowError } = await service.from(table).select("*").eq("id", rowId).eq("user_id", authData.user.id).maybeSingle();
    if (rowError || !row) return json({ error: "Record not found." }, 404);

    const { data: settings } = await service.from("google_form_sync_settings").select("order_form_url, refund_form_url, order_field_map, refund_field_map").eq("id", true).maybeSingle();
    const formUrl = refund ? settings?.refund_form_url : settings?.order_form_url;
    const fieldMap = (refund ? settings?.refund_field_map : settings?.order_field_map) as Record<string, string> | undefined;
    if (!formUrl || !fieldMap || Object.keys(fieldMap).length === 0) {
      return json({ synced: false, status: "not_configured" });
    }

    try {
      const { responseUrl } = await resolveForm(formUrl);
      const fields = new URLSearchParams();
      for (const [key, entryId] of Object.entries(fieldMap)) {
        if (!/^\d{1,20}$/.test(entryId)) continue;
        const value = row[key];
        if (value !== null && value !== undefined && String(value).length > 0) fields.set(`entry.${entryId}`, String(value));
      }
      if (Object.keys(fieldMap).length && fields.size === 0) throw new Error("No mapped form values were available to submit.");
      const response = await fetch(responseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "BarterKartale Form Sync" },
        body: fields,
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      });
      const finalUrl = new URL(response.url);
      if (!response.ok || finalUrl.hostname !== "docs.google.com") throw new Error("Google Forms did not accept the submission.");

      const update = await service.from(table).update({
        google_form_sync_status: "synced",
        google_form_sync_error: null,
        google_form_synced_at: new Date().toISOString(),
      }).eq("id", rowId).eq("user_id", authData.user.id);
      if (update.error) throw new Error("Submission saved, but sync status could not be updated.");
      return json({ synced: true, status: "synced" });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Form sync failed.";
      await service.from(table).update({
        google_form_sync_status: "failed",
        google_form_sync_error: message.slice(0, 220),
      }).eq("id", rowId).eq("user_id", authData.user.id);
      return json({ error: message.slice(0, 220), synced: false, status: "failed" }, 502);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Form sync failed.";
    return json({ error: message.slice(0, 220), synced: false }, 400);
  }
});
