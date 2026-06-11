// supabase/functions/stripe-get-subscription/index.ts
// @ts-nocheck
// Returns the authenticated user's current Stripe subscription details.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(req, { error: "Missing authorization header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const stripeKey   = Deno.env.get("STRIPE_SECRET_KEY");

  if (!stripeKey) return json(req, { error: "STRIPE_SECRET_KEY not configured" }, 500);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json(req, { error: "Unauthorized" }, 401);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: dbUser, error: dbErr } = await supabase
    .from("users")
    .select("stripe_subscription_id, subscription_status, is_deleted, is_banned, suspended_until")
    .eq("supabase_uid", user.id)
    .maybeSingle();

  if (dbErr) return json(req, { error: dbErr.message }, 500);
  if (!dbUser) return json(req, { error: "User not found" }, 404);
  if (dbUser.is_deleted || dbUser.is_banned) return json(req, { error: "Account is not active" }, 403);
  if (dbUser.suspended_until && new Date(dbUser.suspended_until).getTime() > Date.now()) {
    return json(req, { error: "Account is temporarily suspended" }, 403);
  }
  if (!dbUser.stripe_subscription_id) {
    return json(req, { error: "No active subscription found" }, 404);
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });
    const subscription = await stripe.subscriptions.retrieve(dbUser.stripe_subscription_id);

    return json(req, {
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: subscription.current_period_end,
      subscriptionStatus: dbUser.subscription_status,
    });
  } catch (err) {
    console.error("[stripe-get-subscription]", (err as Error).message);
    return json(req, { error: (err as Error).message }, 500);
  }
});
