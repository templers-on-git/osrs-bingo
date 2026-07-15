// Dev-elevate Edge Function.
//
// Flow: the browser must already have a real (anonymous) Supabase Auth
// session (see login/index.ts for why). This function takes {password} from
// that same session, checks it against the single Dev master password, and
// — if it matches — sets is_dev:true on that session's app_metadata,
// layered on top of whatever clan_id/clan_role is already there (or absent,
// if the Dev hasn't logged into a clan at all yet).

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
  const password = body?.password;
  if (!password) {
    return new Response(JSON.stringify({ error: "password is required" }), {
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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: isValid, error: checkError } = await admin.rpc("check_dev_password", {
    p_password: password,
  });

  if (checkError) {
    console.error(checkError);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  if (!isValid) {
    return new Response(JSON.stringify({ error: "invalid password" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userData.user.id, {
    app_metadata: {
      ...userData.user.app_metadata,
      is_dev: true,
    },
  });

  if (updateError) {
    console.error(updateError);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ is_dev: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
