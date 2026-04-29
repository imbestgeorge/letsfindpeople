// supabase/functions/stripe-cancel-subscription/index.ts
// @ts-nocheck
// Immediately cancels the authenticated user's Stripe subscription
// so they can start a fresh subscription later.
//
// Required Supabase secret env vars:
//   STRIPE_SECRET_KEY
//
// Invoked from the frontend via:
//   supabase.functions.invoke('stripe-cancel-subscription', { body: {} })

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const stripeKey   = Deno.env.get("STRIPE_SECRET_KEY");

  if (!stripeKey) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);

  // Verify caller's JWT.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  // Fetch user's stripe fields using service role.
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: dbUser, error: dbErr } = await supabase
    .from("users")
    .select("stripe_subscription_id, subscription_status, is_deleted, is_banned, suspended_until")
    .eq("supabase_uid", user.id)
    .maybeSingle();

  if (dbErr) return json({ error: dbErr.message }, 500);
  if (!dbUser) return json({ error: "User not found" }, 404);
  if (dbUser.is_deleted || dbUser.is_banned) return json({ error: "Account is not active" }, 403);
  if (dbUser.suspended_until && new Date(dbUser.suspended_until).getTime() > Date.now()) {
    return json({ error: "Account is temporarily suspended" }, 403);
  }

  if (!dbUser.stripe_subscription_id) {
    return json({ error: "No active subscription found" }, 400);
  }

  if (
    dbUser.subscription_status !== "active" &&
    dbUser.subscription_status !== "trialing" &&
    dbUser.subscription_status !== "canceling"
  ) {
    return json({ error: "Subscription is not active" }, 400);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });

  try {
    const subscription = await stripe.subscriptions.cancel(dbUser.stripe_subscription_id);

    await supabase
      .from("users")
      .update({
        subscription_status: "canceled",
        stripe_subscription_id: null,
      })
      .eq("supabase_uid", user.id);

    return json({
      ok: true,
      status: subscription.status,
      canceledAt: subscription.canceled_at,
    });
  } catch (err) {
    console.error("[stripe-cancel-subscription]", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
