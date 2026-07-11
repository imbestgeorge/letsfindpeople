// supabase/functions/stripe-create-checkout/index.ts
// @ts-nocheck
// Creates a Stripe Checkout session for the Pro Plan subscription.
//
// Required Supabase secret env vars (set via `supabase secrets set`):
//   STRIPE_SECRET_KEY  — from Stripe Dashboard > Developers > API keys
//   STRIPE_PRICE_ID    — the recurring price ID for the subscription plan
//
// Invoked from the frontend via:
//   supabase.functions.invoke('stripe-create-checkout', {
//     body: { successUrl, cancelUrl }
//   })

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

function isAllowedRedirect(url: string) {
  const redirectOrigin = toOrigin(url);
  return !!redirectOrigin && getAllowedOrigins().includes(redirectOrigin);
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
  const priceId     = Deno.env.get("STRIPE_PRICE_ID");

  if (!stripeKey) return json(req, { error: "STRIPE_SECRET_KEY not configured" }, 500);
  if (!priceId)   return json(req, { error: "STRIPE_PRICE_ID not configured" }, 500);

  // Verify caller's JWT.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json(req, { error: "Unauthorized" }, 401);

  // Parse body.
  let successUrl: string, cancelUrl: string;
  try {
    ({ successUrl, cancelUrl } = await req.json());
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (!successUrl || !cancelUrl)
    return json(req, { error: "successUrl and cancelUrl are required" }, 400);
  if (!isAllowedRedirect(successUrl) || !isAllowedRedirect(cancelUrl)) {
    return json(req, { error: "Redirect URLs are not allowed" }, 400);
  }

  // Fetch the user's stripe fields using service role.
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: dbUser, error: dbErr } = await supabase
    .from("users")
    .select("id_user, email, stripe_customer_id, subscription_status, is_deleted, is_banned, suspended_until")
    .eq("supabase_uid", user.id)
    .maybeSingle();

  if (dbErr) return json(req, { error: dbErr.message }, 500);
  if (!dbUser) return json(req, { error: "User not found" }, 404);
  if (dbUser.is_deleted || dbUser.is_banned) return json(req, { error: "Account is not active" }, 403);
  if (dbUser.suspended_until && new Date(dbUser.suspended_until).getTime() > Date.now()) {
    return json(req, { error: "Account is temporarily suspended" }, 403);
  }

  if (["active", "trialing", "canceling"].includes(dbUser.subscription_status)) {
    return json(req, { error: "User already has an active subscription" });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url:  cancelUrl,
    client_reference_id: user.id,
    metadata:    { supabaseUid: user.id },
    subscription_data: {
      metadata: { supabaseUid: user.id },
    },
  };

  if (dbUser.stripe_customer_id) {
    sessionParams.customer = dbUser.stripe_customer_id;
  } else if (dbUser.email ?? user.email) {
    sessionParams.customer_email = dbUser.email ?? user.email;
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    return json(req, { url: session.url });
  } catch (err) {
    console.error("[stripe-create-checkout]", (err as Error).message);
    return json(req, { error: (err as Error).message }, 500);
  }
});
