// supabase/functions/stripe-webhook/index.ts
// @ts-nocheck
// Handles incoming Stripe webhook events.  This function is NOT invoked by the
// frontend — Stripe calls it directly as a webhook endpoint.
//
// Register the webhook in the Stripe Dashboard pointing to:
//   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//
// Required Supabase secret env vars:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET  — the whsec_... value from Stripe > Webhooks

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getSupabaseUidFromSession(session: Stripe.Checkout.Session) {
  return session.metadata?.supabaseUid || session.client_reference_id || null;
}

function deriveSubscriptionStatus(sub: Stripe.Subscription) {
  return sub.cancel_at_period_end ? "canceling" : sub.status;
}

async function updateUserSubscription(
  supabase: ReturnType<typeof createClient>,
  {
    supabaseUid,
    stripeCustomerId,
    stripeSubscriptionId,
    subscriptionStatus,
  }: {
    supabaseUid?: string | null;
    stripeCustomerId: string;
    stripeSubscriptionId: string | null;
    subscriptionStatus: string;
  },
) {
  const payload = {
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    subscription_status: subscriptionStatus,
  };

  const query = supabase
    .from("users")
    .update(payload)
    .select("id_user");

  const result = supabaseUid
    ? await query.eq("supabase_uid", supabaseUid)
    : await query.eq("stripe_customer_id", stripeCustomerId);

  if (result.error) throw result.error;
  if (!result.data?.length) {
    throw new Error(
      supabaseUid
        ? `No user row matched supabase_uid=${supabaseUid}`
        : `No user row matched stripe_customer_id=${stripeCustomerId}`,
    );
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const stripeKey     = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl   = Deno.env.get("SUPABASE_URL");
  const serviceKey    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    return json({ error: "Webhook secrets are not configured" }, 500);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });

  // Stripe requires the raw body for signature verification.
  const body      = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", (err as Error).message);
    return json({ error: `Webhook Error: ${(err as Error).message}` }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const supabaseUid = getSupabaseUidFromSession(session);
        if (supabaseUid && session.customer && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          await updateUserSubscription(supabase, {
            supabaseUid,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: deriveSubscriptionStatus(subscription),
          });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await updateUserSubscription(supabase, {
          supabaseUid: sub.metadata?.supabaseUid,
          stripeCustomerId: sub.customer as string,
          stripeSubscriptionId: sub.id,
          subscriptionStatus: deriveSubscriptionStatus(sub),
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await updateUserSubscription(supabase, {
          supabaseUid: sub.metadata?.supabaseUid,
          stripeCustomerId: sub.customer as string,
          stripeSubscriptionId: null,
          subscriptionStatus: "canceled",
        });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        // Only count subscription payments (not zero-amount setup invoices).
        if (invoice.amount_paid > 0 && invoice.subscription) {
          const now       = new Date();
          const month     = now.getUTCMonth() + 1;
          const year      = now.getUTCFullYear();
          const amountEur = invoice.amount_paid / 100;

          const { data: existing } = await supabase
            .from("monthly_stats")
            .select("revenue, payments")
            .eq("year",  year)
            .eq("month", month)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("monthly_stats")
              .update({
                revenue:  existing.revenue  + amountEur,
                payments: existing.payments + 1,
              })
              .eq("year",  year)
              .eq("month", month);
          } else {
            await supabase
              .from("monthly_stats")
              .insert({ year, month, revenue: amountEur, payments: 1 });
          }
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error:", (err as Error).message);
    return json({ error: "Webhook handler failed" }, 500);
  }

  return json({ received: true });
});
