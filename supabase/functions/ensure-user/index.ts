// supabase/functions/ensure-user/index.ts
// @ts-nocheck
// Ensures a user row exists in the public.users table for the authenticated caller.
// Uses the service-role key to bypass RLS, so it can check banned/deleted status
// and create new rows atomically.
//
// Invoked from the frontend via:
//   supabase.functions.invoke('ensure-user', { body: { email } })
// The Supabase JS client automatically includes the caller's JWT in the
// Authorization header.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function toOrigin(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins() {
  return [Deno.env.get("SITE_URL"), Deno.env.get("SITE_URLS")]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => toOrigin(value.trim()))
    .filter(Boolean);
}

function corsHeaders(req: Request) {
  const requestOrigin = req.headers.get("Origin");
  const allowedOrigins = getAllowedOrigins();
  const allowedOrigin =
    requestOrigin && allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedOrigins[0] ?? "";

  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

async function writeLog(
  supabase: ReturnType<typeof createClient>,
  idUser: number | null,
  action: string,
  status: string,
  reason?: string
) {
  const { data: actionRow } = await supabase
    .from("actions")
    .select("id_action")
    .eq("name", action)
    .maybeSingle();
  const actionId = actionRow?.id_action ?? null;
  if (!actionId) return;
  await supabase
    .from("logs")
    .insert({ id_user: idUser, id_action: actionId, status, reason: reason ?? null })
    .then(({ error }) => {
      if (error) console.error("[writeLog]", error.message);
    });
}

function parseInviteCode(value: unknown) {
  const inviteCode = String(value ?? "").trim();
  return /^\d+$/.test(inviteCode) ? Number(inviteCode) : null;
}

function getInviteDisplayName(user: unknown, email: string) {
  const metadata = user?.user_metadata ?? {};
  const name =
    metadata.full_name ||
    metadata.name ||
    [metadata.given_name, metadata.family_name].filter(Boolean).join(" ");
  return String(name || email || "Someone you invited").trim();
}

async function recordPendingInvite(
  supabase: ReturnType<typeof createClient>,
  inviteCode: number | null,
  invitedUserId: number,
  invitedDisplayName: string
) {
  if (!inviteCode) return;

  const { error } = await supabase.rpc("record_draw_event_pending_invite", {
    p_invite_code: inviteCode,
    p_invited_user_id: invitedUserId,
    p_invited_display_name: invitedDisplayName,
  });

  if (error) {
    console.error("[recordPendingInvite]", error.message);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json(req, { error: "Missing authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verify the caller's JWT and extract their UID.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) {
    return json(req, { error: "Unauthorized" }, 401);
  }

  const supabaseUid = user.id;
  const email = user.email ?? "";
  let requestBody: Record<string, unknown> = {};

  try {
    requestBody = await req.json();
  } catch {
    requestBody = {};
  }

  const inviteCode = parseInviteCode(requestBody.inviteCode ?? requestBody.invite_code);
  const invitedDisplayName = getInviteDisplayName(user, email);

  // Service-role client — bypasses RLS for all subsequent operations.
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Lookup by supabase_uid (returning user).
  const { data: byUid } = await supabase
    .from("users")
    .select("id_user, is_deleted, is_banned, suspended_until")
    .eq("supabase_uid", supabaseUid)
    .maybeSingle();

  if (byUid) {
    if (byUid.is_deleted) {
      await writeLog(supabase, byUid.id_user, "LOG_IN", "Error", "Account has been deleted");
      return json(req, { error: "ACCOUNT_DELETED" });
    }
    if (byUid.is_banned) {
      await writeLog(supabase, byUid.id_user, "LOG_IN", "Error", "Account is banned");
      return json(req, { error: "ACCOUNT_BANNED" });
    }
    if (byUid.suspended_until && new Date(byUid.suspended_until).getTime() > Date.now()) {
      await writeLog(supabase, byUid.id_user, "LOG_IN", "Blocked", "Account is temporarily suspended");
      return json(req, { error: "ACCOUNT_SUSPENDED", suspendedUntil: byUid.suspended_until }, 403);
    }
    await writeLog(supabase, byUid.id_user, "LOG_IN", "Success");
    return json(req, { user: byUid, created: false });
  }

  // 2. Lookup by email — links an orphan row (e.g. seeded data) to the new UID.
  const { data: byEmail } = await supabase
    .from("users")
    .select("id_user, is_deleted, is_banned, suspended_until")
    .eq("email", email)
    .maybeSingle();

  if (byEmail) {
    if (byEmail.is_deleted) {
      await writeLog(supabase, byEmail.id_user, "LOG_IN", "Error", "Account has been deleted");
      return json(req, { error: "ACCOUNT_DELETED" });
    }
    if (byEmail.is_banned) {
      await writeLog(supabase, byEmail.id_user, "LOG_IN", "Error", "Account is banned");
      return json(req, { error: "ACCOUNT_BANNED" });
    }
    if (byEmail.suspended_until && new Date(byEmail.suspended_until).getTime() > Date.now()) {
      await writeLog(supabase, byEmail.id_user, "LOG_IN", "Blocked", "Account is temporarily suspended");
      return json(req, { error: "ACCOUNT_SUSPENDED", suspendedUntil: byEmail.suspended_until }, 403);
    }
    await supabase
      .from("users")
      .update({ supabase_uid: supabaseUid })
      .eq("id_user", byEmail.id_user);
    await writeLog(supabase, byEmail.id_user, "LOG_IN", "Success");
    return json(req, { user: byEmail, created: false });
  }

  // 3. Brand-new user — create the row.
  const { data: newUser, error: insertErr } = await supabase
    .from("users")
    .insert({ supabase_uid: supabaseUid, email, id_type: 1 })
    .select("id_user")
    .single();

  if (insertErr) {
    // Duplicate key means a concurrent request already created the row.
    if (insertErr.code === "23505") {
      const { data: existing } = await supabase
        .from("users")
        .select("id_user")
        .eq("supabase_uid", supabaseUid)
        .maybeSingle();
      if (existing) {
        await recordPendingInvite(supabase, inviteCode, existing.id_user, invitedDisplayName);
        await writeLog(supabase, existing.id_user, "CREATE_ACCOUNT", "Success");
        return json(req, { user: existing, created: true });
      }
    }
    await writeLog(supabase, null, "CREATE_ACCOUNT", "Error", insertErr.message);
    return json(req, { error: insertErr.message }, 500);
  }

  await recordPendingInvite(supabase, inviteCode, newUser.id_user, invitedDisplayName);
  await writeLog(supabase, newUser.id_user, "CREATE_ACCOUNT", "Success");
  return json(req, { user: newUser, created: true });
});
