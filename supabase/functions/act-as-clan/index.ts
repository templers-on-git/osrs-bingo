// act-as-clan Edge Function.
//
// Flow: a Dev-elevated tab (dev.html) opens login.html?actAsClan=<id>&
// actAsEvent=<id> in a new browser tab. That new tab creates its OWN
// independent anonymous session (signInAnonymously, stored in
// sessionStorage rather than the shared localStorage session every other
// tab uses) — otherwise a real clan login/logout in any tab would clobber
// what every tab resolves to, since Supabase persists one session per
// browser by default, not per tab. This function stamps THAT new session's
// app_metadata with the chosen clan's admin identity, after verifying the
// caller (proven separately, via X-Dev-Authorization) really is an
// elevated Dev.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Browsers send a CORS preflight (OPTIONS) before the real POST when calling
// a different origin — without these headers on every response, the
// preflight is rejected and the browser never even attempts the POST.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dev-authorization",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  // This tab's own brand-new anonymous session — the one whose
  // app_metadata we're about to set. Sent automatically by
  // supabase.functions.invoke() as the primary Authorization header.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "sign in anonymously first" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // The *caller's* separate, already-elevated Dev session — proof this
  // request really comes from a Dev, not just any anonymous visitor
  // minting themselves an admin identity.
  const devAuthHeader = req.headers.get("X-Dev-Authorization");
  if (!devAuthHeader) {
    return new Response(JSON.stringify({ error: "dev session required" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => null);
  const clanId = body?.clanId;
  const eventId = body?.eventId;
  if (!clanId || !eventId) {
    return new Response(JSON.stringify({ error: "clanId and eventId are required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const newSessionClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: newUserData, error: newUserError } = await newSessionClient.auth.getUser();
  if (newUserError || !newUserData?.user) {
    return new Response(JSON.stringify({ error: "invalid session" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const devClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: devAuthHeader } },
  });
  const { data: devUserData, error: devUserError } = await devClient.auth.getUser();
  if (devUserError || !devUserData?.user?.app_metadata?.is_dev) {
    return new Response(JSON.stringify({ error: "dev session required" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: clan, error: clanError } = await admin
    .from("clans")
    .select("id, display_name, event_id")
    .eq("id", clanId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (clanError) {
    console.error(clanError);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  if (!clan) {
    return new Response(JSON.stringify({ error: "clan not found in that event" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(newUserData.user.id, {
    app_metadata: {
      clan_id: clan.id,
      event_id: clan.event_id,
      clan_role: "admin",
      is_dev: true,
      ign: "The Dev",
    },
  });

  if (updateError) {
    console.error(updateError);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ clanDisplayName: clan.display_name }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
