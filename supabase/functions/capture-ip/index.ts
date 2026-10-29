import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const clientIp = forwarded?.split(",")[0]?.trim() || realIp || null;

    return new Response(
      JSON.stringify({ ip: clientIp }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Unable to determine client IP" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
