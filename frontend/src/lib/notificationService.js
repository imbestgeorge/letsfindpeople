import { supabase } from "./supabaseClient";

export const NOTIFICATION_TITLE_MAX_LENGTH = 120;
export const NOTIFICATION_BODY_MAX_LENGTH = 2000;
export const NOTIFICATION_COVER_MAX_SIZE = 3 * 1024 * 1024;

const NOTIFICATION_COVER_BUCKET = "notification-covers";
const ALLOWED_COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function mapNotification(row) {
  return {
    id: row.id_notification,
    title: row.title || "",
    body: row.body || "",
    coverUrl: row.cover_url || "",
    createdAt: row.created_at,
    isRead: !!row.is_read,
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
  return (data || []).map(mapNotification);
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

export async function createSiteNotification({ title, body, coverUrl }) {
  const trimmedTitle = String(title || "").trim();
  const trimmedBody = String(body || "").trim();
  const trimmedCoverUrl = String(coverUrl || "").trim();

  if (!trimmedTitle) throw new Error("Title is required.");
  if (!trimmedBody) throw new Error("Description is required.");
  if (trimmedTitle.length > NOTIFICATION_TITLE_MAX_LENGTH) {
    throw new Error(`Title must be ${NOTIFICATION_TITLE_MAX_LENGTH} characters or fewer.`);
  }
  if (trimmedBody.length > NOTIFICATION_BODY_MAX_LENGTH) {
    throw new Error(`Description must be ${NOTIFICATION_BODY_MAX_LENGTH} characters or fewer.`);
  }

  const { data, error } = await supabase.rpc("create_site_notification", {
    p_title: trimmedTitle,
    p_body: trimmedBody,
    p_cover_url: trimmedCoverUrl || null,
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapNotification(row) : null;
}

export function subscribeToSiteNotifications(onChange) {
  return supabase
    .channel("site-notifications")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "site_notifications" },
      onChange
    )
    .subscribe();
}

export function removeSiteNotificationSubscription(channel) {
  if (!channel) return Promise.resolve();
  return supabase.removeChannel(channel);
}
