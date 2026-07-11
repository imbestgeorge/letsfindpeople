// supabase/functions/send-bulk-email/index.ts
// @ts-nocheck

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { buildAdminBulkEmail } from "../_shared/emailTemplates.ts";
import { RESEND_BATCH_LIMIT, sendBatchEmails } from "../_shared/resend.ts";

const USERS_PAGE_SIZE = 1000;
const SUBJECT_MAX_LENGTH = 120;
const BODY_MAX_LENGTH = 5000;
const CTA_LABEL_MAX_LENGTH = 40;
const CTA_URL_MAX_LENGTH = 2048;

function isSuspended(user: unknown) {
  return user?.suspended_until && new Date(user.suspended_until).getTime() > Date.now();
}

function cleanString(value: unknown) {
  return String(value || "").trim();
}

function getRecipientLimit() {
  const raw = Number(Deno.env.get("BULK_EMAIL_MAX_RECIPIENTS") || 0);
  return Number.isInteger(raw) && raw > 0 ? raw : null;
}

function getRequestId(value: unknown) {
  const requestId = cleanString(value)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return requestId || crypto.randomUUID();
}

function validateCtaUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function loadRecipients(supabase: ReturnType<typeof createClient>) {
  const recipientLimit = getRecipientLimit();
  const recipients = [];
  const seenEmails = new Set<string>();
  let from = 0;

  while (true) {
    const to = from + USERS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("users")
      .select("id_user, email, suspended_until")
      .eq("is_deleted", false)
      .eq("is_banned", false)
      .not("email", "is", null)
      .order("id_user", { ascending: true })
      .range(from, to);

    if (error) throw error;

    for (const user of data || []) {
      const email = cleanString(user.email);
      const dedupeKey = email.toLowerCase();
      if (!email || seenEmails.has(dedupeKey) || isSuspended(user)) continue;

      seenEmails.add(dedupeKey);
      recipients.push({
        id: user.id_user,
        email,
      });
      if (recipientLimit && recipients.length >= recipientLimit) return recipients;
    }

    if (!data || data.length < USERS_PAGE_SIZE) return recipients;
    from += USERS_PAGE_SIZE;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(req, { error: "Missing authorization header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json(req, { error: "Unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const subject = cleanString(body.subject);
  const messageBody = cleanString(body.body);
  const ctaLabel = cleanString(body.ctaLabel ?? body.cta_label);
  const ctaUrl = cleanString(body.ctaUrl ?? body.cta_url);
  const requestId = getRequestId(body.requestId ?? body.request_id);

  if (!subject) return json(req, { error: "Subject is required" }, 400);
  if (!messageBody) return json(req, { error: "Message is required" }, 400);
  if (subject.length > SUBJECT_MAX_LENGTH) return json(req, { error: "Subject is too long" }, 400);
  if (messageBody.length > BODY_MAX_LENGTH) return json(req, { error: "Message is too long" }, 400);
  if (ctaLabel.length > CTA_LABEL_MAX_LENGTH) return json(req, { error: "Button label is too long" }, 400);
  if (ctaUrl.length > CTA_URL_MAX_LENGTH) return json(req, { error: "Button URL is too long" }, 400);
  if ((ctaLabel && !ctaUrl) || (!ctaLabel && ctaUrl)) {
    return json(req, { error: "Button label and URL must be filled together" }, 400);
  }
  if (!validateCtaUrl(ctaUrl)) return json(req, { error: "Button URL must be a valid HTTP or HTTPS URL" }, 400);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: adminUser, error: adminError } = await supabase
    .from("users")
    .select("id_user, id_type, is_deleted, is_banned, suspended_until")
    .eq("supabase_uid", user.id)
    .maybeSingle();

  if (adminError) return json(req, { error: adminError.message }, 500);
  if (!adminUser || adminUser.id_type !== 2 || adminUser.is_deleted || adminUser.is_banned || isSuspended(adminUser)) {
    return json(req, { error: "Admin access required" }, 403);
  }

  try {
    const recipients = await loadRecipients(supabase);
    const template = buildAdminBulkEmail({
      subject,
      body: messageBody,
      ctaLabel: ctaLabel || undefined,
      ctaUrl: ctaUrl || undefined,
    });

    let sentCount = 0;
    const batches = chunk(recipients, RESEND_BATCH_LIMIT);
    for (let i = 0; i < batches.length; i += 1) {
      const batch = batches[i];
      await sendBatchEmails(
        batch.map((recipient) => ({
          to: recipient.email,
          ...template,
          tags: [
            { name: "kind", value: "admin_bulk_email" },
            { name: "request_id", value: requestId },
          ],
        })),
        `bulk-email-${requestId}-batch-${i}`,
      );
      sentCount += batch.length;
    }

    return json(req, { ok: true, recipientCount: sentCount });
  } catch (err) {
    console.error("[send-bulk-email]", (err as Error).message);
    return json(req, { error: (err as Error).message }, 500);
  }
});
