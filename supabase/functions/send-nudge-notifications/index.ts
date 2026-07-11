// supabase/functions/send-nudge-notifications/index.ts
// @ts-nocheck

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { buildNudgeEmail } from "../_shared/emailTemplates.ts";
import { RESEND_BATCH_LIMIT, sendBatchEmails } from "../_shared/resend.ts";

function cleanString(value: unknown) {
  return String(value || "").trim();
}

function isSuspended(user: unknown) {
  return user?.suspended_until && new Date(user.suspended_until).getTime() > Date.now();
}

function getSiteUrl() {
  return cleanString(Deno.env.get("SITE_URL")) || "https://letsfindpeople.com";
}

function getRecipientLimit(value: unknown) {
  const requested = Number(value);
  const envLimit = Number(Deno.env.get("NUDGE_EMAIL_MAX_RECIPIENTS") || 500);
  const limit = Number.isInteger(requested) && requested > 0 ? requested : envLimit;
  return Math.max(1, Math.min(limit, 5000));
}

function getDigestDate(value: unknown) {
  const raw = cleanString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

function plural(count: number, singular: string, pluralValue = `${singular}s`) {
  return count === 1 ? singular : pluralValue;
}

function countLabel(count: number) {
  if (count <= 1) return "Someone";
  return `${count} people`;
}

function sentenceCountLabel(count: number) {
  if (count <= 1) return "1 person";
  return `${count} people`;
}

function getDisplayName(candidate: unknown) {
  return cleanString([candidate?.first_name, candidate?.last_name].filter(Boolean).join(" ")) || "there";
}

function getCtaUrl(candidate: unknown) {
  const siteUrl = getSiteUrl().replace(/\/+$/, "");
  const sampleUserId = Number(candidate?.sample_user_id || 0);
  if (Number.isInteger(sampleUserId) && sampleUserId > 0) {
    return `${siteUrl}/?user=${encodeURIComponent(String(sampleUserId))}`;
  }
  return siteUrl;
}

function buildCopy(candidate: unknown) {
  const name = getDisplayName(candidate);
  const keyword = cleanString(candidate?.keyword_name) || "one of your interests";
  const actorCount = Math.max(1, Number(candidate?.actor_count || 1));
  const location = cleanString(candidate?.location);
  const locationText = location ? ` in ${location}` : "";
  const ctaUrl = getCtaUrl(candidate);

  if (candidate?.nudge_type === "search_interest") {
    const subject = `${sentenceCountLabel(actorCount)} searched for ${keyword}`;
    return {
      subject,
      body: `Hey ${name}, ${sentenceCountLabel(actorCount)}${locationText} searched for ${keyword} today and your profile matched their tags.\n\nTap to see who is around before the conversation gets crowded.`,
      ctaLabel: "See Matches",
      ctaUrl,
    };
  }

  if (candidate?.nudge_type === "profile_view") {
    const subject = `${sentenceCountLabel(actorCount)} viewed your ${keyword} tags`;
    return {
      subject,
      body: `Hey ${name}, ${sentenceCountLabel(actorCount)}${locationText} viewed your ${keyword} profile tags today.\n\nThat is a pretty warm signal. Tap in and say hi while it is fresh.`,
      ctaLabel: "Say Hi",
      ctaUrl,
    };
  }

  const subject = actorCount === 1
    ? `Someone else just added ${keyword}`
    : `${actorCount} people just added ${keyword}`;
  return {
    subject,
    body: `Hey ${name}, ${countLabel(actorCount)} just added ${keyword} to their profile.\n\nYou both have the same niche interest, which is exactly the kind of match LetsFindPeople is built for. Click to say hi.`,
    ctaLabel: actorCount === 1 ? "Say Hi" : `Meet ${actorCount} ${plural(actorCount, "Person", "People")}`,
    ctaUrl,
  };
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function assertAuthorized(req: Request, serviceClient: ReturnType<typeof createClient>) {
  const cronSecret = cleanString(Deno.env.get("NUDGE_CRON_SECRET"));
  const suppliedSecret = cleanString(req.headers.get("x-nudge-cron-secret"));
  if (cronSecret && suppliedSecret && suppliedSecret === cronSecret) {
    return;
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Unauthorized");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) throw new Error("Unauthorized");

  const { data: dbUser, error: dbError } = await serviceClient
    .from("users")
    .select("id_user, id_type, is_deleted, is_banned, suspended_until")
    .eq("supabase_uid", user.id)
    .maybeSingle();

  if (dbError) throw dbError;
  if (!dbUser || dbUser.id_type !== 2 || dbUser.is_deleted || dbUser.is_banned || isSuspended(dbUser)) {
    throw new Error("Admin access required");
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    await assertAuthorized(req, supabase);
  } catch (err) {
    return json(req, { error: (err as Error).message }, (err as Error).message === "Unauthorized" ? 401 : 403);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const digestDate = getDigestDate(body.digestDate ?? body.digest_date);
  const limit = getRecipientLimit(body.limit);
  const dryRun = body.dryRun === true || body.dry_run === true;

  const { data: candidates, error: candidateError } = await supabase.rpc("list_daily_nudge_email_candidates", {
    p_digest_date: digestDate,
    p_limit: limit,
  });
  if (candidateError) return json(req, { error: candidateError.message }, 500);

  const prepared = (candidates || []).map((candidate) => {
    const copy = buildCopy(candidate);
    return {
      candidate,
      copy,
      email: buildNudgeEmail(copy),
    };
  });

  if (dryRun) {
    return json(req, {
      ok: true,
      dryRun: true,
      digestDate,
      candidateCount: prepared.length,
      candidates: prepared.slice(0, 25).map(({ candidate, copy }) => ({
        userId: candidate.id_user,
        email: candidate.email,
        nudgeType: candidate.nudge_type,
        keyword: candidate.keyword_name,
        actorCount: candidate.actor_count,
        subject: copy.subject,
        body: copy.body,
        ctaUrl: copy.ctaUrl,
      })),
    });
  }

  try {
    let sentCount = 0;
    const batches = chunk(prepared, RESEND_BATCH_LIMIT);
    for (let i = 0; i < batches.length; i += 1) {
      const batch = batches[i];

      await sendBatchEmails(
        batch.map(({ candidate, email }) => ({
          to: candidate.email,
          ...email,
          tags: [
            { name: "kind", value: "daily_nudge" },
            { name: "nudge_type", value: candidate.nudge_type },
            { name: "digest_date", value: digestDate },
            { name: "keyword_id", value: String(candidate.keyword_id || "none") },
          ],
        })),
        `daily-nudge-${digestDate}-batch-${i}`,
      );

      for (const { candidate, copy } of batch) {
        const { error: recordError } = await supabase.rpc("record_daily_nudge_email_sent", {
          p_user_id: candidate.id_user,
          p_digest_date: digestDate,
          p_nudge_type: candidate.nudge_type,
          p_keyword_id: candidate.keyword_id,
          p_subject: copy.subject,
          p_body: copy.body,
          p_metadata: {
            actorCount: candidate.actor_count,
            keywordName: candidate.keyword_name,
            location: candidate.location,
            sampleUserId: candidate.sample_user_id,
            ctaUrl: copy.ctaUrl,
          },
        });
        if (recordError) throw new Error(recordError.message);
        sentCount += 1;
      }
    }

    return json(req, {
      ok: true,
      dryRun: false,
      digestDate,
      candidateCount: prepared.length,
      sentCount,
    });
  } catch (err) {
    console.error("[send-nudge-notifications]", (err as Error).message);
    return json(req, { error: (err as Error).message }, 500);
  }
});
