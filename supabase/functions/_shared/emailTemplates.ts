// @ts-nocheck

export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

const BRAND_NAME = "LetsFindPeople";
const BRAND_PURPLE = "#6D28D9";
const BRAND_PURPLE_DARK = "#4C1D95";
const TEXT_COLOR = "#1F2937";
const MUTED_COLOR = "#6B7280";

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getSiteUrl() {
  return trimSlash(Deno.env.get("SITE_URL") || "https://letsfindpeople.com");
}

function getLogoUrl() {
  const configuredLogoUrl = Deno.env.get("EMAIL_LOGO_URL");
  if (configuredLogoUrl) return configuredLogoUrl;
  return `${getSiteUrl()}/logo.png`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeName(value: unknown) {
  const name = String(value || "").trim();
  return name || "there";
}

function splitParagraphs(value: unknown) {
  return String(value || "")
    .split(/\n{2,}|\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function paragraphsHtml(value: unknown) {
  return splitParagraphs(value)
    .map((paragraph) => (
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${TEXT_COLOR};">${escapeHtml(paragraph)}</p>`
    ))
    .join("");
}

function truncateSubject(value: string) {
  return value.length > 120 ? `${value.slice(0, 117).trim()}...` : value;
}

function makePreview(value: unknown) {
  const text = splitParagraphs(value).join(" ").replace(/\s+/g, " ").trim();
  if (!text) return BRAND_NAME;
  return text.length > 180 ? `${text.slice(0, 177).trim()}...` : text;
}

function buildLayout({
  subject,
  heading,
  body,
  ctaLabel,
  ctaUrl,
  coverUrl,
}: {
  subject: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  coverUrl?: string;
}): EmailTemplate {
  const logoUrl = getLogoUrl();
  const displayBody = [String(heading || "").trim(), String(body || "").trim()]
    .filter(Boolean)
    .join("\n\n");
  const safePreview = escapeHtml(makePreview(displayBody));
  const safeCtaLabel = escapeHtml(ctaLabel || "");
  const safeCtaUrl = escapeHtml(ctaUrl || "");
  const safeCoverUrl = escapeHtml(coverUrl || "");
  const bodyHtml = paragraphsHtml(displayBody);
  const ctaHtml = ctaLabel && ctaUrl
    ? `
      <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0 4px;">
        <tr>
          <td style="border-radius:6px;background:${BRAND_PURPLE};">
            <a href="${safeCtaUrl}" style="display:inline-block;padding:13px 18px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">${safeCtaLabel}</a>
          </td>
        </tr>
      </table>
    `
    : "";
  const coverHtml = coverUrl
    ? `<img src="${safeCoverUrl}" alt="" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;margin:0 0 22px;border-radius:8px;" />`
    : "";

  const textParts = [displayBody];
  if (ctaLabel && ctaUrl) textParts.push("", `${ctaLabel}: ${ctaUrl}`);

  return {
    subject: truncateSubject(subject),
    text: textParts.join("\n"),
    html: `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${safePreview}</div>
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background:#F3F4F6;margin:0;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #E5E7EB;">
            <tr>
              <td style="background:${BRAND_PURPLE};background:linear-gradient(135deg,${BRAND_PURPLE} 0%,${BRAND_PURPLE_DARK} 100%);padding:30px 28px;text-align:center;">
                <img src="${escapeHtml(logoUrl)}" alt="${BRAND_NAME}" width="76" style="display:inline-block;width:76px;max-width:70%;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 30px;">
                ${coverHtml}
                ${bodyHtml}
                ${ctaHtml}
                <p style="margin:26px 0 0;font-size:13px;line-height:1.5;color:${MUTED_COLOR};">You are receiving this because you use ${BRAND_NAME}.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

export function buildSignupEmail({ displayName }: { displayName?: string }): EmailTemplate {
  const siteUrl = getSiteUrl();
  const name = normalizeName(displayName);

  return buildLayout({
    subject: `Welcome to ${BRAND_NAME}!`,
    heading: `Welcome, ${name}!`,
    body: "Thanks for joining LetsFindPeople. Set up your profile so you can start searching.",
    ctaLabel: "Set Up Profile",
    ctaUrl: siteUrl,
  });
}

export function buildProfileCompletedEmail({ displayName }: { displayName?: string }): EmailTemplate {
  const siteUrl = getSiteUrl();
  const name = normalizeName(displayName);

  return buildLayout({
    subject: "Your profile is live!",
    heading: "Your Profile Is Set Up",
    body: `Nice work, ${name}. Your profile is complete. You can now start searching.`,
    ctaLabel: "Start Searching",
    ctaUrl: siteUrl,
  });
}

export function buildDrawEventStartedEmail({
  title,
  body,
  coverUrl,
}: {
  title: string;
  body: string;
  coverUrl?: string;
}): EmailTemplate {
  const safeTitle = String(title || "Giveaway").trim() || "Giveaway";

  return buildLayout({
    subject: `New giveaway: ${safeTitle}`,
    heading: safeTitle,
    body: String(body || "A new giveaway just started. Open the site's notifications to join. Prizes range from money to premium subscriptions like Crunchyroll Mega Fan, ChatGPT Plus, NordVPN Premium, and much more!"),
    ctaLabel: "Join Giveaway",
    ctaUrl: getSiteUrl(),
    coverUrl,
  });
}

export function buildAdminBulkEmail({
  subject,
  body,
  ctaLabel,
  ctaUrl,
}: {
  subject: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): EmailTemplate {
  const safeSubject = String(subject || BRAND_NAME).trim() || BRAND_NAME;

  return buildLayout({
    subject: safeSubject,
    heading: "",
    body: String(body || ""),
    ctaLabel,
    ctaUrl,
  });
}

export function buildNudgeEmail({
  subject,
  body,
  ctaLabel,
  ctaUrl,
}: {
  subject: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): EmailTemplate {
  const safeSubject = String(subject || "New people to meet on LetsFindPeople").trim();

  return buildLayout({
    subject: safeSubject,
    heading: "",
    body: String(body || ""),
    ctaLabel,
    ctaUrl,
  });
}
