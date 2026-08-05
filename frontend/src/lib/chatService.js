import { supabase } from "./supabaseClient";

export const CHAT_RETENTION_DAYS = 7;
export const CHAT_MAX_MESSAGE_LENGTH = 500;
export const CHAT_MEDIA_BUCKET = "chat-media";
export const CHAT_IMAGE_MAX_INPUT_SIZE = 8 * 1024 * 1024;
export const CHAT_IMAGE_MAX_COMPRESSED_SIZE = 900 * 1024;
export const CHAT_IMAGE_MAX_DIMENSION = 1280;

const CHAT_MEDIA_PREFIX = "lfp-media:v1:";
const CHAT_IMAGE_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const CHAT_IMAGE_ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);

export const GLOBAL_CHAT_CHANNELS = [
  {
    key: "international",
    title: "International",
    icon: "bi-globe2",
    description: "Everyone, everywhere",
  },
  {
    key: "skills-money",
    title: "Make Money",
    icon: "bi-cash-coin",
    description: "Discuss income ideas",
  },
];

function isSafeChatMediaUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function parseChatMediaPayload(body) {
  const text = String(body || "");
  if (!text.startsWith(CHAT_MEDIA_PREFIX)) return null;

  try {
    const payload = JSON.parse(text.slice(CHAT_MEDIA_PREFIX.length));
    const type = payload?.type === "gif" ? "gif" : payload?.type === "image" ? "image" : "";
    if (!type || !isSafeChatMediaUrl(payload.url)) return null;

    return {
      type,
      url: payload.url,
      title: String(payload.title || "").trim().slice(0, 80),
      width: Number(payload.width) || null,
      height: Number(payload.height) || null,
    };
  } catch {
    return null;
  }
}

export function getChatMessagePreview(body) {
  const media = parseChatMediaPayload(body);
  if (media?.type === "gif") return "GIF";
  if (media?.type === "image") return "Image";
  return String(body || "").trim();
}

function buildChatMediaBody(payload) {
  const media = {
    type: payload?.type === "gif" ? "gif" : "image",
    url: String(payload?.url || ""),
  };

  if (!isSafeChatMediaUrl(media.url)) {
    throw new Error("Media URL is invalid.");
  }

  const title = String(payload?.title || "").trim();
  if (title) media.title = title.slice(0, 80);

  const width = Number(payload?.width);
  const height = Number(payload?.height);
  if (Number.isFinite(width) && width > 0) media.width = Math.round(width);
  if (Number.isFinite(height) && height > 0) media.height = Math.round(height);

  const body = `${CHAT_MEDIA_PREFIX}${JSON.stringify(media)}`;
  if (body.length > CHAT_MAX_MESSAGE_LENGTH) {
    throw new Error("Media reference is too long to send.");
  }

  return body;
}

function mapChatMessage(row) {
  const body = row.body || "";
  return {
    id: row.id_chat_message,
    type: "global",
    userId: row.id_user,
    channelKey: row.channel_key || "international",
    body,
    media: parseChatMediaPayload(body),
    createdAt: row.created_at,
    author: {
      firstName: row.first_name || "",
      lastName: row.last_name || "",
      email: row.email || "",
      profileUrl: row.profile_url || null,
      subscriptionStatus: row.subscription_status || "free",
      isOnline: !!row.is_online,
    },
  };
}

function assertNoChatError(row) {
  if (row?.error_message) {
    throw new Error(row.error_message);
  }
}

function mapDirectMessage(row) {
  const body = row.body || "";
  return {
    id: row.id_direct_message,
    type: "direct",
    conversationId: row.id_direct_conversation,
    userId: row.id_sender,
    body,
    media: parseChatMediaPayload(body),
    createdAt: row.created_at,
    author: {
      firstName: row.first_name || "",
      lastName: row.last_name || "",
      email: row.email || "",
      profileUrl: row.profile_url || null,
      subscriptionStatus: row.subscription_status || "free",
      isOnline: !!row.is_online,
    },
  };
}

function mapDirectChat(row) {
  const name = `${row.first_name || ""} ${row.last_name || ""}`.trim();

  return {
    conversationId: row.id_direct_conversation,
    otherUserId: row.other_user_id,
    name: name || row.email || "Member",
    email: row.email || "",
    profilePicture: row.profile_url || null,
    subscriptionStatus: row.subscription_status || "free",
    lastSeenAt: row.last_seen_at || null,
    isOnline: !!row.is_online,
    lastBody: row.last_body || "",
    lastMessageAt: row.last_message_at || null,
    unreadCount: Number(row.unread_count || 0),
    totalMessages: Number(row.total_messages || 0),
  };
}

export async function listGlobalChatMessages(channelKey = "international") {
  const { data, error } = await supabase.rpc("list_global_chat_messages", {
    p_channel_key: channelKey,
  });
  if (error) throw new Error(error.message);
  return (data || []).map(mapChatMessage);
}

export async function getUnreadGlobalChatMessageCount(channelKey = "international") {
  const { data, error } = await supabase.rpc("get_unread_global_chat_message_count", {
    p_channel_key: channelKey,
  });
  if (error) throw new Error(error.message);
  return Number(data || 0);
}

export async function markGlobalChatMessagesRead(channelKey = "international") {
  const { error } = await supabase.rpc("mark_global_chat_messages_read", {
    p_channel_key: channelKey,
  });
  if (error) throw new Error(error.message);
}

export async function sendGlobalChatMessage(message, channelKey = "international") {
  const body = String(message || "").trim();
  if (!body) throw new Error("Message cannot be empty.");
  if (body.length > CHAT_MAX_MESSAGE_LENGTH) {
    throw new Error(`Message must be ${CHAT_MAX_MESSAGE_LENGTH} characters or fewer.`);
  }

  const { data, error } = await supabase.rpc("send_global_chat_message", {
    p_body: body,
    p_channel_key: channelKey,
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  assertNoChatError(row);
  return row ? mapChatMessage(row) : null;
}

export function sendGlobalChatMediaMessage(payload, channelKey = "international") {
  return sendGlobalChatMessage(buildChatMediaBody(payload), channelKey);
}

export async function listMyDirectChats() {
  const { data, error } = await supabase.rpc("list_my_direct_chats");
  if (error) throw new Error(error.message);
  return (data || []).map(mapDirectChat);
}

export async function listMyChatRelationships() {
  const { data, error } = await supabase.rpc("list_my_chat_relationships");
  if (error) throw new Error(error.message);

  const hiddenDirectChats = {};
  const blockedUserIds = new Set();
  const blockedByUserIds = new Set();
  const reportedUserIds = new Set();
  const reportedByUserIds = new Set();

  (data || []).forEach((row) => {
    const userId = Number(row.user_id);
    if (!Number.isInteger(userId) || userId <= 0) return;

    if (row.relationship_type === "hidden") {
      hiddenDirectChats[userId] = row.hidden_before || null;
    } else if (row.relationship_type === "blocked") {
      blockedUserIds.add(userId);
    } else if (row.relationship_type === "blocked_by") {
      blockedByUserIds.add(userId);
    } else if (row.relationship_type === "reported") {
      reportedUserIds.add(userId);
    } else if (row.relationship_type === "reported_by") {
      reportedByUserIds.add(userId);
    }
  });

  return {
    hiddenDirectChats,
    blockedUserIds,
    blockedByUserIds,
    reportedUserIds,
    reportedByUserIds,
  };
}

export function getBlockedRelationshipIds(relationships) {
  return new Set([
    ...Array.from(relationships?.blockedUserIds || []),
    ...Array.from(relationships?.blockedByUserIds || []),
  ]);
}

export function getMessagingRestrictedUserIds(relationships) {
  return new Set([
    ...Array.from(relationships?.blockedUserIds || []),
    ...Array.from(relationships?.blockedByUserIds || []),
    ...Array.from(relationships?.reportedUserIds || []),
    ...Array.from(relationships?.reportedByUserIds || []),
  ]);
}

export async function removeDirectChatForMe(otherUserId) {
  const { error } = await supabase.rpc("hide_direct_conversation_from_me", {
    p_other_user_id: Number(otherUserId),
  });
  if (error) throw new Error(error.message);
}

export async function unhideDirectChatForMe(otherUserId) {
  const { error } = await supabase.rpc("unhide_direct_conversation_for_me", {
    p_other_user_id: Number(otherUserId),
  });
  if (error) throw new Error(error.message);
}

export async function blockChatUser(otherUserId) {
  const { error } = await supabase.rpc("block_user_from_chat", {
    p_blocked_user_id: Number(otherUserId),
  });
  if (error) throw new Error(error.message);
}

export async function listDirectChatMessages(otherUserId) {
  const { data, error } = await supabase.rpc("list_direct_chat_messages", {
    p_other_user_id: Number(otherUserId),
  });
  if (error) throw new Error(error.message);
  return (data || []).map(mapDirectMessage);
}

export async function getUnreadDirectMessageCount() {
  const { data, error } = await supabase.rpc("get_unread_direct_message_count");
  if (error) throw new Error(error.message);
  return Number(data || 0);
}

export async function markDirectChatMessagesRead(otherUserId) {
  const { error } = await supabase.rpc("mark_direct_chat_messages_read", {
    p_other_user_id: Number(otherUserId),
  });
  if (error) throw new Error(error.message);
}

export async function sendDirectChatMessage(otherUserId, message) {
  const body = String(message || "").trim();
  if (!body) throw new Error("Message cannot be empty.");
  if (body.length > CHAT_MAX_MESSAGE_LENGTH) {
    throw new Error(`Message must be ${CHAT_MAX_MESSAGE_LENGTH} characters or fewer.`);
  }

  const { data, error } = await supabase.rpc("send_direct_chat_message", {
    p_other_user_id: Number(otherUserId),
    p_body: body,
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  assertNoChatError(row);
  return row ? mapDirectMessage(row) : null;
}

export function sendDirectChatMediaMessage(otherUserId, payload) {
  return sendDirectChatMessage(otherUserId, buildChatMediaBody(payload));
}

export async function deleteMyChatMessage(message) {
  const { data, error } = await supabase.rpc("delete_my_chat_message", {
    p_message_type: message?.type,
    p_message_id: Number(message?.id),
  });
  if (error) throw new Error(error.message);
  return !!data;
}

export async function reportChatMessage(message) {
  if (message?.media?.type === "gif") {
    throw new Error("GIFs cannot be reported.");
  }

  const { data, error } = await supabase.rpc("report_chat_content", {
    p_target_type: "message",
    p_reported_user_id: Number(message?.userId) || null,
    p_message_type: message?.type,
    p_message_id: Number(message?.id),
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function reportChatUser(userId) {
  const { data, error } = await supabase.rpc("report_chat_content", {
    p_target_type: "user",
    p_reported_user_id: Number(userId),
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function listAdminChatReports({ page = 1, perPage = 20 } = {}) {
  const limit = Math.max(1, Math.min(Number(perPage) || 20, 100));
  const offset = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * limit);
  const { data, error } = await supabase.rpc("list_admin_chat_reports", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);

  const rows = data || [];
  return {
    reports: rows.filter((row) => row.content_kind !== "gif").map((row) => ({
      id: Number(row.id_chat_report),
      reporterUserId: Number(row.reporter_user_id),
      reporterName: row.reporter_name || "Deleted Account",
      reporterEmail: row.reporter_email || "",
      reportedUserId: row.reported_user_id ? Number(row.reported_user_id) : null,
      reportedName: row.reported_name || "Deleted Account",
      reportedEmail: row.reported_email || "",
      targetType: row.target_type || "",
      messageType: row.message_type || "",
      messageId: row.message_id ? Number(row.message_id) : null,
      contentKind: row.content_kind || "text",
      body: row.body || "",
      mediaUrl: row.media_url || "",
      status: row.status || "open",
      createdAt: row.created_at || null,
    })),
    total: Number(rows[0]?.total_count || 0),
  };
}

function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        image,
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error("Invalid image file."));
    };

    image.src = imageUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to compress image."));
        return;
      }

      resolve(blob);
    }, type, quality);
  });
}

function getScaledDimensions(width, height, maxDimension) {
  if (width <= maxDimension && height <= maxDimension) return { width, height };

  const scale = Math.min(maxDimension / width, maxDimension / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function getRandomUploadId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function compressChatImage(file) {
  if (!file) throw new Error("Choose an image to send.");
  if (!CHAT_IMAGE_ALLOWED_TYPES.has(file.type)) {
    throw new Error("Chat images must be JPG, PNG, or WEBP.");
  }
  if (file.size > CHAT_IMAGE_MAX_INPUT_SIZE) {
    throw new Error("Chat images must be 8 MB or smaller before compression.");
  }

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!CHAT_IMAGE_ALLOWED_EXTS.has(ext)) {
    throw new Error("Invalid image file type.");
  }

  const { image, width: sourceWidth, height: sourceHeight } = await getImageDimensions(file);
  let { width, height } = getScaledDimensions(sourceWidth, sourceHeight, CHAT_IMAGE_MAX_DIMENSION);
  let quality = 0.82;
  let blob = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Failed to compress image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob.size <= CHAT_IMAGE_MAX_COMPRESSED_SIZE) break;

    if (quality > 0.54) {
      quality -= 0.12;
    } else {
      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
    }
  }

  if (!blob || blob.size > CHAT_IMAGE_MAX_COMPRESSED_SIZE) {
    throw new Error("Image could not be compressed enough to send.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "chat-image";
  const compressedFile = new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });

  return {
    file: compressedFile,
    width,
    height,
    originalSize: file.size,
    compressedSize: compressedFile.size,
  };
}

export async function uploadChatImage(supabaseUid, file) {
  if (!/^[0-9a-f-]{36}$/i.test(String(supabaseUid || ""))) {
    throw new Error("Invalid user.");
  }

  const compressed = await compressChatImage(file);
  const storagePath = `${supabaseUid}/${Date.now()}-${getRandomUploadId()}.jpg`;

  const { error: uploadErr } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(storagePath, compressed.file, {
      cacheControl: "31536000",
      contentType: compressed.file.type,
      upsert: false,
    });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: urlData } = supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .getPublicUrl(storagePath);

  const cleanUrl = urlData.publicUrl;

  Promise.resolve(supabase
    .rpc("write_log", {
      p_action: "UPLOAD_CHAT_IMAGE",
      p_status: "Success",
      p_metadata: {
        bucket: CHAT_MEDIA_BUCKET,
        fileSize: compressed.compressedSize,
        originalFileSize: compressed.originalSize,
        mimeType: compressed.file.type,
      },
    })
  ).catch(() => {});

  return {
    type: "image",
    url: cleanUrl,
    title: file.name,
    width: compressed.width,
    height: compressed.height,
  };
}

export function subscribeToGlobalChatMessages(onChange) {
  return supabase
    .channel("global-chat-messages")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "global_chat_messages" },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "global_chat_messages" },
      onChange
    )
    .subscribe();
}

export function subscribeToDirectChatMessages(onChange) {
  return supabase
    .channel("direct-chat-messages")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "direct_chat_messages" },
      onChange
    )
    .subscribe();
}

export function removeGlobalChatSubscription(channel) {
  if (!channel) return Promise.resolve();
  return supabase.removeChannel(channel);
}
