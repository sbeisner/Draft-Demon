// delete-account — removes the caller's Supabase identity (KAN-18).
//
// The service_role key (full admin access) lives ONLY in this Edge Function's
// environment, never on the client or the locally-run FastAPI backend. The
// function identifies the caller from their own JWT, then deletes that — and
// only that — user. The app deletes its local data separately via
// DELETE /api/account/me before invoking this.
//
// Deploy:  supabase functions deploy delete-account
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing token" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve the caller from their JWT so we can only ever delete themselves.
  const { data: { user }, error: who } = await admin.auth.getUser(token);
  if (who || !user) return json({ error: "invalid token" }, 401);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
});
