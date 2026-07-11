import { supabase } from "./supabaseClient";

export const CHAT_RETENTION_DAYS = 7;
export const CHAT_MAX_MESSAGE_LENGTH = 500;
export const CONNECTION_STREAK_MESSAGE_COUNT = 14;

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

function mapChatMessage(row) {
  return {
    id: row.id_chat_message,
    type: "global",
    userId: row.id_user,
    channelKey: row.channel_key || "international",
    body: row.body || "",
    createdAt: row.created_at,
    author: {
      firstName: row.first_name || "",
      lastName: row.last_name || "",
      email: row.email || "",
      profileUrl: row.profile_url || null,
      isOnline: !!row.is_online,
    },
  };
}

function mapDirectMessage(row) {
  return {
    id: row.id_direct_message,
    type: "direct",
    conversationId: row.id_direct_conversation,
    userId: row.id_sender,
    body: row.body || "",
    createdAt: row.created_at,
    author: {
      firstName: row.first_name || "",
      lastName: row.last_name || "",
      email: row.email || "",
      profileUrl: row.profile_url || null,
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
    lastSeenAt: row.last_seen_at || null,
    isOnline: !!row.is_online,
    lastBody: row.last_body || "",
    lastMessageAt: row.last_message_at || null,
    unreadCount: Number(row.unread_count || 0),
    totalMessages: Number(row.total_messages || 0),
    hasConnectionStreak: !!row.has_connection_streak,
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
  return row ? mapChatMessage(row) : null;
}

export async function listMyDirectChats() {
  const { data, error } = await supabase.rpc("list_my_direct_chats");
  if (error) throw new Error(error.message);
  return (data || []).map(mapDirectChat);
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
  return row ? mapDirectMessage(row) : null;
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
