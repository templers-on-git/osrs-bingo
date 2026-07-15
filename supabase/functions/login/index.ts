// Login Edge Function.
//
// Flow: the browser first calls supabase.auth.signInAnonymously() itself,
// getting a real (anonymous) Supabase Auth session — that's what gives us
// automatic "remember me" persistence and token refresh for free. This
// function then takes {ign, password} from that same session, checks the
// password against the currently published event's clans, and — if it
// matches — attaches {clan_id, event_id, clan_role, is_dev} to that
// session's app_metadata, which only the service role can write.
//
// No secrets to configure here beyond what Supabase injects automatically
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Browsers send a CORS preflight (OPTIONS) before the real POST when calling
// a different origin — without these headers on every response, the
// preflight is rejected and the browser never even attempts the POST.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "sign in anonymously first" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => null);
  const ign = body?.ign?.trim();
  const password = body?.password;
  if (!ign || !password) {
    return new Response(JSON.stringify({ error: "ign and password are required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Identify which anonymous session is calling us.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "invalid session" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Check the password against the live event's clans.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: match, error: matchError } = await admin
    .rpc("login_with_password", { p_password: password })
    .maybeSingle();

  if (matchError) {
    console.error(matchError);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  if (!match) {
    return new Response(JSON.stringify({ error: "invalid password" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userData.user.id, {
    app_metadata: {
      clan_id: match.clan_id,
      event_id: match.event_id,
      clan_role: match.role,
      is_dev: false,
      ign,
    },
  });

  if (updateError) {
    console.error(updateError);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ clan_role: match.role }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
