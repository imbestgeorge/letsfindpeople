import { supabase } from "./supabaseClient";

export const NOTIFICATION_TITLE_MAX_LENGTH = 120;
export const NOTIFICATION_BODY_MAX_LENGTH = 2000;
export const NOTIFICATION_COVER_MAX_SIZE = 3 * 1024 * 1024;
export const BULK_EMAIL_SUBJECT_MAX_LENGTH = 120;
export const BULK_EMAIL_BODY_MAX_LENGTH = 5000;
export const BULK_EMAIL_CTA_LABEL_MAX_LENGTH = 40;
export const BULK_EMAIL_CTA_URL_MAX_LENGTH = 2048;
export const OPEN_SITE_NOTIFICATION_EVENT = "lfp:open-site-notification";
export const SITE_NOTIFICATION_DELIVERY_SCOPES = {
  CURRENT_USERS: "current_users",
  CURRENT_AND_FUTURE_USERS: "current_and_future_users",
};

const NOTIFICATION_COVER_BUCKET = "notification-covers";
const ALLOWED_COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
let notificationSubscriptionId = 0;

function normalizeNotificationTitle(title) {
  switch (title) {
    case "Free Searches Now Renew Daily!":
      return "Free Searches Now Renew Daily";
    case "Someone joined with your invite":
      return "Someone Joined With Your Invite";
    default:
      return title;
  }
}

function mapNotification(row) {
  const type = row.notification_type || "general";
  const title = normalizeNotificationTitle(row.title || "");
  const body = row.body || "";
  const drawEventId = row.draw_event_id == null ? null : Number(row.draw_event_id);

  return {
    id: row.id_notification,
    title,
    body,
    coverUrl: row.cover_url || "",
    createdAt: row.created_at,
    isRead: !!row.is_read,
    isDisabled: !!row.is_disabled,
    disabledAt: row.disabled_at || null,
    deliveryScope: row.delivery_scope || SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_AND_FUTURE_USERS,
    type,
    drawEventId,
    isDrawEvent: type === "draw_event" && Number.isFinite(drawEventId),
  };
}

function cleanFileName(name) {
  const base = String(name || "cover")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "cover";
}

function resizeCoverImage(file) {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(imageUrl);

      const width = 320;
      const height = 180;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      const sourceRatio = image.naturalWidth / image.naturalHeight;
      const targetRatio = width / height;
      let sourceWidth = image.naturalWidth;
      let sourceHeight = image.naturalHeight;
      let sourceX = 0;
      let sourceY = 0;

      if (sourceRatio > targetRatio) {
        sourceWidth = image.naturalHeight * targetRatio;
        sourceX = (image.naturalWidth - sourceWidth) / 2;
      } else {
        sourceHeight = image.naturalWidth / targetRatio;
        sourceY = (image.naturalHeight - sourceHeight) / 2;
      }

      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        width,
        height
      );

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to process cover image."));
            return;
          }
          resolve(new File([blob], "cover-320x180.jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.85
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error("Invalid cover image."));
    };

    image.src = imageUrl;
  });
}

export async function listSiteNotifications(limit = 20) {
  const { data, error } = await supabase.rpc("list_site_notifications", {
    p_limit: limit,
  });
  if (error) throw new Error(error.message);

  const notifications = (data || []).map(mapNotification);

  // Push welcome / direct notifications to the bottom, preserving the rest of the order.
  return notifications.sort((a, b) => {
    const aIsDirect = a.type === "direct" ? 1 : 0;
    const bIsDirect = b.type === "direct" ? 1 : 0;
    return aIsDirect - bIsDirect;
  });
}

export async function getLatestEnabledDrawEventNotification() {
  const { data, error } = await supabase.rpc("get_latest_enabled_draw_event_notification");
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapNotification(row) : null;
}

export async function getUnreadSiteNotificationCount() {
  const { data, error } = await supabase.rpc("get_unread_site_notification_count");
  if (error) throw new Error(error.message);
  return Number(data || 0);
}

export async function markSiteNotificationRead(notificationId) {
  const { error } = await supabase.rpc("mark_site_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) throw new Error(error.message);
}

export async function dismissSiteNotification(notificationId) {
  const { error } = await supabase.rpc("dismiss_site_notification", {
    p_notification_id: notificationId,
  });
  if (error) throw new Error(error.message);
}

export async function uploadNotificationCover(file) {
  if (!file) throw new Error("Cover image is required.");
  if (!ALLOWED_COVER_TYPES.has(file.type)) {
    throw new Error("Cover must be a JPG, PNG, WEBP, or GIF image.");
  }
  if (file.size > NOTIFICATION_COVER_MAX_SIZE) {
    throw new Error("Cover image must be 3 MB or smaller.");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const uid = sessionData?.session?.user?.id;
  if (!uid) throw new Error("You must be signed in to upload a cover.");

  const resizedFile = await resizeCoverImage(file);
  const path = `${uid}/${Date.now()}-${cleanFileName(resizedFile.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(NOTIFICATION_COVER_BUCKET)
    .upload(path, resizedFile, { contentType: resizedFile.type });
  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage
    .from(NOTIFICATION_COVER_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

function getDeliveryScope(value) {
  return Object.values(SITE_NOTIFICATION_DELIVERY_SCOPES).includes(value)
    ? value
    : SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_USERS;
}

function getRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function mapAdminDrawEvent(row) {
  if (!row) return null;

  return {
    id: Number(row.id_draw_event),
    notificationId: row.id_notification == null ? null : Number(row.id_notification),
    title: row.title || "",
    body: row.body || "",
    coverUrl: row.cover_url || "",
    createdAt: row.created_at,
    isDisabled: !!row.is_disabled,
    disabledAt: row.disabled_at || null,
    deliveryScope: row.delivery_scope || SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_USERS,
    emailSentAt: row.email_sent_at || null,
    emailRecipientCount: Number(row.email_recipient_count || 0),
  };
}

function isMissingDeliveryScopeRpcError(error) {
  const message = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
  ].filter(Boolean).join(" ").toLowerCase();

  return message.includes("p_delivery_scope") || (
    message.includes("create_site_notification") &&
    message.includes("schema cache")
  );
}

export async function createSiteNotification({
  title,
  body,
  coverUrl,
  isDrawEvent = false,
  deliveryScope = SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_USERS,
}) {
  const trimmedTitle = String(title || "").trim();
  const trimmedBody = String(body || "").trim();
  const trimmedCoverUrl = String(coverUrl || "").trim();
  const normalizedDeliveryScope = getDeliveryScope(deliveryScope);

  if (!trimmedTitle) throw new Error("Title is required.");
  if (!trimmedBody) throw new Error("Description is required.");
  if (trimmedTitle.length > NOTIFICATION_TITLE_MAX_LENGTH) {
    throw new Error(`Title must be ${NOTIFICATION_TITLE_MAX_LENGTH} characters or fewer.`);
  }
  if (trimmedBody.length > NOTIFICATION_BODY_MAX_LENGTH) {
    throw new Error(`Description must be ${NOTIFICATION_BODY_MAX_LENGTH} characters or fewer.`);
  }

  let { data, error } = await supabase.rpc("create_site_notification", {
    p_title: trimmedTitle,
    p_body: trimmedBody,
    p_cover_url: trimmedCoverUrl || null,
    p_is_draw_event: !!isDrawEvent,
    p_delivery_scope: normalizedDeliveryScope,
  });

  if (error && isMissingDeliveryScopeRpcError(error)) {
    ({ data, error } = await supabase.rpc("create_site_notification", {
      p_title: trimmedTitle,
      p_body: trimmedBody,
      p_cover_url: trimmedCoverUrl || null,
      p_is_draw_event: !!isDrawEvent,
    }));
  }

  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapNotification(row) : null;
}

export async function editDrawEvent({
  drawEventId,
  title,
  body,
  coverUrl,
  deliveryScope = SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_USERS,
}) {
  const id = Number(drawEventId);
  const trimmedTitle = String(title || "").trim();
  const trimmedBody = String(body || "").trim();
  const trimmedCoverUrl = String(coverUrl || "").trim();
  const normalizedDeliveryScope = getDeliveryScope(deliveryScope);

  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid draw event.");
  if (!trimmedTitle) throw new Error("Title is required.");
  if (!trimmedBody) throw new Error("Description is required.");
  if (trimmedTitle.length > NOTIFICATION_TITLE_MAX_LENGTH) {
    throw new Error(`Title must be ${NOTIFICATION_TITLE_MAX_LENGTH} characters or fewer.`);
  }
  if (trimmedBody.length > NOTIFICATION_BODY_MAX_LENGTH) {
    throw new Error(`Description must be ${NOTIFICATION_BODY_MAX_LENGTH} characters or fewer.`);
  }

  const { data, error } = await supabase.rpc("edit_draw_event", {
    p_draw_event_id: id,
    p_title: trimmedTitle,
    p_body: trimmedBody,
    p_cover_url: trimmedCoverUrl || null,
    p_delivery_scope: normalizedDeliveryScope,
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  return mapAdminDrawEvent(row);
}

export async function sendDrawEventEmail(drawEventId) {
  const id = Number(drawEventId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid draw event.");

  const { data, error } = await supabase.functions.invoke("send-draw-event-email", {
    body: { drawEventId: id },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function sendBulkUserEmail({
  subject,
  body,
  ctaLabel = "",
  ctaUrl = "",
}) {
  const trimmedSubject = String(subject || "").trim();
  const trimmedBody = String(body || "").trim();
  const trimmedCtaLabel = String(ctaLabel || "").trim();
  const trimmedCtaUrl = String(ctaUrl || "").trim();

  if (!trimmedSubject) throw new Error("Subject is required.");
  if (!trimmedBody) throw new Error("Message is required.");
  if (trimmedSubject.length > BULK_EMAIL_SUBJECT_MAX_LENGTH) {
    throw new Error(`Subject must be ${BULK_EMAIL_SUBJECT_MAX_LENGTH} characters or fewer.`);
  }
  if (trimmedBody.length > BULK_EMAIL_BODY_MAX_LENGTH) {
    throw new Error(`Message must be ${BULK_EMAIL_BODY_MAX_LENGTH} characters or fewer.`);
  }
  if (trimmedCtaLabel.length > BULK_EMAIL_CTA_LABEL_MAX_LENGTH) {
    throw new Error(`Button label must be ${BULK_EMAIL_CTA_LABEL_MAX_LENGTH} characters or fewer.`);
  }
  if (trimmedCtaUrl.length > BULK_EMAIL_CTA_URL_MAX_LENGTH) {
    throw new Error(`Button URL must be ${BULK_EMAIL_CTA_URL_MAX_LENGTH} characters or fewer.`);
  }
  if ((trimmedCtaLabel && !trimmedCtaUrl) || (!trimmedCtaLabel && trimmedCtaUrl)) {
    throw new Error("Button label and URL must be filled together.");
  }

  const { data, error } = await supabase.functions.invoke("send-bulk-email", {
    body: {
      subject: trimmedSubject,
      body: trimmedBody,
      ctaLabel: trimmedCtaLabel || null,
      ctaUrl: trimmedCtaUrl || null,
      requestId: getRequestId(),
    },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getOrCreateDrawEventInvite(drawEventId) {
  const id = Number(drawEventId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid draw event.");

  const { data, error } = await supabase.rpc("get_or_create_draw_event_invite", {
    p_draw_event_id: id,
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id_draw_event_invite) throw new Error("Failed to create invite link.");

  return {
    inviteCode: String(row.id_draw_event_invite),
    drawEventId: Number(row.draw_event_id ?? row.id_draw_event),
    hasCompletedSignup: !!row.has_completed_signup,
  };
}

export function subscribeToSiteNotifications(onChange) {
  notificationSubscriptionId += 1;

  return supabase
    .channel(`site-notifications-${notificationSubscriptionId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "site_notifications" },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "site_notifications" },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "draw_events" },
      onChange
    )
    .subscribe();
}

export function removeSiteNotificationSubscription(channel) {
  if (!channel) return Promise.resolve();
  return supabase.removeChannel(channel);
}

export function openSiteNotificationModal(notification) {
  if (typeof window === "undefined" || !notification) return;
  window.dispatchEvent(new CustomEvent(OPEN_SITE_NOTIFICATION_EVENT, { detail: notification }));
}
