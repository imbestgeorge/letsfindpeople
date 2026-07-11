// ── userService.js ─────────────────────────────────────────────────────────────
// All user-profile operations now go directly to Supabase (database + storage).
// Sensitive operations that require the service-role key (ensure-user) or
// Stripe secrets (checkout / portal) are delegated to Supabase Edge Functions.

import { supabase } from "./supabaseClient";
import { clearPendingInviteCode, getPendingInviteCode } from "./inviteService";

// ── Column mappings (mirror the server-side constants) ────────────────────────
const YES_NO_COLS = {
  visualArt:       "q_visual_art",
  digitalArt:      "q_digital_art",
  listenMusic:     "q_listen_music",
  produceMusic:    "q_produce_music",
  playInstruments: "q_play_instruments",
  likePerforming:  "q_like_performing",
  likeWriting:     "q_like_writing",
  likeAnime:       "q_like_anime",
  likeGames:       "q_like_games",
  likeMemes:       "q_like_memes",
  likeTech:        "q_like_tech",
  likeProgramming: "q_like_programming",
  likeAI:          "q_like_ai",
  attendEducation: "q_attend_education",
  goGym:           "q_go_gym",
  practiceSports:  "q_practice_sports",
  likeOutdoor:     "q_like_outdoor",
  likeCars:        "q_like_cars",
};

const SKIP_COLS = {
  movies:      "skip_movies",
  tvShows:     "skip_tv_shows",
  apps:        "skip_apps",
  careers:     "skip_careers",
  personality: "skip_personality",
  hobbies:     "skip_hobbies",
  sexuality:   "skip_sexuality",
  food:        "skip_food",
  places:      "skip_places",
  animals:     "skip_animals",
  roleModels:  "skip_role_models",
  other:       "skip_other",
};

const YES_NO_COLS_SQL = Object.values(YES_NO_COLS).join(", ");
const SKIP_COLS_SQL   = Object.values(SKIP_COLS).join(", ");
const PROFILE_PICTURE_MAX_SIZE = 3 * 1024 * 1024;
const PROFILE_PICTURE_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const PROFILE_PICTURE_ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const PROFILE_PICTURE_PUBLIC_PATH = "/storage/v1/object/public/profile-pictures/";

function normalizeProfilePictureUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const supabaseOrigin = new URL(import.meta.env.VITE_SUPABASE_URL).origin;
    if (url.origin !== supabaseOrigin) return null;
    if (!url.pathname.startsWith(PROFILE_PICTURE_PUBLIC_PATH)) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

function normalizeProfileGalleryUrls(value) {
  return (Array.isArray(value) ? value : [])
    .map(normalizeProfilePictureUrl)
    .filter(Boolean)
    .slice(0, 3);
}

function isOnlineFromLastSeen(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) && Date.now() - time < 5 * 60 * 1000;
}

export async function touchMyPresence() {
  const { error } = await supabase.rpc("touch_my_presence");
  if (error) throw new Error(error.message);
}

// ── ensureUser ────────────────────────────────────────────────────────────────
/**
 * Ensures a user row exists in the DB for the given Supabase auth user.
 * Delegates to the ensure-user Edge Function which uses the service-role key
 * to check banned/deleted status and create the row atomically.
 *
 * The Edge Function extracts the UID and email from the caller's JWT, so the
 */
export async function ensureUser() {
  const inviteCode = getPendingInviteCode();
  const { data, error } = await supabase.functions.invoke("ensure-user", {
    body: inviteCode ? { inviteCode } : {},
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  clearPendingInviteCode();
  return data;
}

export async function completeDrawEventPendingInviteSignup() {
  const { data, error } = await supabase.rpc("complete_draw_event_pending_invite_signup");
  if (error) throw new Error(error.message);
  return !!data;
}

export async function sendProfileCompletedEmail() {
  const { data, error } = await supabase.functions.invoke("send-profile-completed-email", {
    body: {},
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

// ── getUserProfile ────────────────────────────────────────────────────────────
/**
 * Fetches the full profile + keyword IDs for the currently authenticated user.
 * Returns { profile, answers, skipped, keywordIds }.
 * @param {string} supabaseUid
 */
export async function getUserProfile(supabaseUid) {
  const { data: user, error: findErr } = await supabase
    .from("users")
    .select(
      `id_user, first_name, last_name, date_of_birth, location,
       phone_number, show_phone_number,
       instagram, show_instagram,
       tiktok, show_tiktok,
       snapchat, show_snapchat,
       discord, show_discord,
       profile_url, profile_gallery_urls, last_seen_at,
       is_deleted, is_banned, suspended_until, subscription_status, free_searches_remaining, free_searches_reset_at, id_type,
       ${YES_NO_COLS_SQL}, ${SKIP_COLS_SQL}`
    )
    .eq("supabase_uid", supabaseUid)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (!user)          throw new Error("User not found.");
  if (user.is_deleted) throw new Error("ACCOUNT_DELETED");
  if (user.is_banned) throw new Error("ACCOUNT_BANNED");
  if (user.suspended_until && new Date(user.suspended_until).getTime() > Date.now()) {
    throw new Error("ACCOUNT_SUSPENDED");
  }

  const { data: uk, error: ukErr } = await supabase
    .from("user_keywords")
    .select("id_keyword")
    .eq("id_user", user.id_user);
  if (ukErr) throw new Error(ukErr.message);

  // Reconstruct yes/no answers: DB TRUE → "yes", FALSE → "no", NULL → null.
  const answers = {};
  for (const [key, col] of Object.entries(YES_NO_COLS)) {
    const val = user[col];
    answers[key] = val === true ? "yes" : val === false ? "no" : null;
  }

  // Reconstruct skip flags: TRUE → true, FALSE/NULL → false.
  const skipped = {};
  for (const [key, col] of Object.entries(SKIP_COLS)) {
    skipped[key] = !!user[col];
  }

  return {
    profile: {
      id:                 user.id_user,
      firstName:          user.first_name          || "",
      lastName:           user.last_name           || "",
      dateOfBirth:        user.date_of_birth       || null,
      location:           user.location            || "",
      phoneNumber:        user.phone_number        || "",
      showPhone:          !!user.show_phone_number,
      instagram:          user.instagram           || "",
      showInstagram:      !!user.show_instagram,
      tiktok:             user.tiktok              || "",
      showTiktok:         !!user.show_tiktok,
      snapchat:           user.snapchat            || "",
      showSnapchat:       !!user.show_snapchat,
      discord:            user.discord             || "",
      showDiscord:        !!user.show_discord,
      // Append a fresh cache-busting timestamp so the browser always fetches
      // the latest image on each session load (same storage path is reused).
      profileUrl: user.profile_url
        ? `${user.profile_url.split("?")[0]}?t=${Date.now()}`
        : null,
      profileGalleryUrls: normalizeProfileGalleryUrls(user.profile_gallery_urls)
        .map((url) => `${url}?t=${Date.now()}`),
      lastSeenAt:         user.last_seen_at || null,
      isOnline:           isOnlineFromLastSeen(user.last_seen_at),
      subscriptionStatus: user.subscription_status || "free",
      freeSearchesRemaining: user.free_searches_remaining ?? 3,
      freeSearchesResetAt: user.free_searches_reset_at || null,
      idType:             user.id_type || 1,
    },
    answers,
    skipped,
    keywordIds: (uk || []).map((row) => row.id_keyword),
  };
}

// ── updateUserProfile ─────────────────────────────────────────────────────────
/**
 * Persists profile fields and keyword IDs to the DB.
 * @param {string}   supabaseUid
 * @param {object}   profile     — flat profile fields (same shape as Navbar passes)
 * @param {number[]} keywordIds  — replaces existing keyword associations
 */
export async function updateUserProfile(supabaseUid, profile, keywordIds) {
  const {
    firstName, lastName,
    birthDay, birthMonth, birthYear,
    location, countryCode, phoneNumber, showPhone,
    instagramUsername, showInstagram,
    tiktokUsername,    showTiktok,
    snapchatUsername,  showSnapchat,
    discordUsername,   showDiscord,
    profileImageUrl,
    profileGalleryUrls,
    answers, skipped,
  } = profile;

  // Resolve the integer id_user from the Supabase UID.
  const { data: user, error: findErr } = await supabase
    .from("users")
    .select("id_user")
    .eq("supabase_uid", supabaseUid)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (!user)   throw new Error("User not found.");

  // Build date_of_birth string.
  const dateOfBirth =
    birthYear && birthMonth && birthDay
      ? `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`
      : null;

  // Combine country code + local number.
  const fullPhone =
    countryCode && phoneNumber
      ? `${countryCode} ${phoneNumber}`
      : phoneNumber || null;

  const profileUpdates = {
    first_name:        firstName         || null,
    last_name:         lastName          || null,
    date_of_birth:     dateOfBirth,
    location:          location          || null,
    phone_number:      fullPhone,
    show_phone_number: !!showPhone,
    instagram:         instagramUsername || null,
    show_instagram:    !!showInstagram,
    tiktok:            tiktokUsername    || null,
    show_tiktok:       !!showTiktok,
    snapchat:          snapchatUsername  || null,
    show_snapchat:     !!showSnapchat,
    discord:           discordUsername   || null,
    show_discord:      !!showDiscord,
    profile_url: normalizeProfilePictureUrl(profileImageUrl),
    profile_gallery_urls: normalizeProfileGalleryUrls(profileGalleryUrls),
  };

  // Map yes/no answers ("yes" → TRUE, "no" → FALSE, absent/null → NULL).
  if (answers && typeof answers === "object") {
    for (const [key, col] of Object.entries(YES_NO_COLS)) {
      const val = answers[key];
      profileUpdates[col] = val === "yes" ? true : val === "no" ? false : null;
    }
  }

  // Map skip flags (true → TRUE, false/absent → FALSE).
  if (skipped && typeof skipped === "object") {
    for (const [key, col] of Object.entries(SKIP_COLS)) {
      profileUpdates[col] = !!skipped[key];
    }
  }

  const { error: updateErr } = await supabase.rpc("update_my_profile", {
    p_profile: profileUpdates,
    p_keyword_ids: Array.isArray(keywordIds)
      ? keywordIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : null,
  });

  if (updateErr) {
    Promise.resolve(supabase
      .rpc("write_log", { p_action: "EDIT_MY_DATA", p_status: "Error", p_reason: updateErr.message })
    ).catch(() => {});
    throw new Error(updateErr.message);
  }

  await completeDrawEventPendingInviteSignup().catch((err) => {
    console.error("Failed to complete draw event invite:", err.message);
  });

  Promise.resolve(supabase
    .rpc("write_log", { p_action: "EDIT_MY_DATA", p_status: "Success" })
  ).catch(() => {});

  return { ok: true };
}

// ── deleteUser ────────────────────────────────────────────────────────────────
/**
 * Soft-deletes the user row (is_deleted = true).
 * @param {string} supabaseUid
 */
export async function deleteUser() {
  const { error } = await supabase.rpc("delete_my_account");

  if (error) {
    Promise.resolve(supabase
      .rpc("write_log", { p_action: "DELETE_ACCOUNT", p_status: "Error", p_reason: error.message })
    ).catch(() => {});
    throw new Error(error.message);
  }

  Promise.resolve(supabase
    .rpc("write_log", { p_action: "DELETE_ACCOUNT", p_status: "Success" })
  ).catch(() => {});

  return { ok: true };
}

// ── uploadProfilePicture ──────────────────────────────────────────────────────
/**
 * Uploads a profile picture to Supabase Storage (bucket: "profile-pictures")
 * and updates the profile_url column.  Returns the public URL.
 *
 * One-time setup in the Supabase dashboard:
 *   1. Create a public Storage bucket named "profile-pictures".
 *   2. Add a Storage policy: authenticated users can INSERT/UPDATE objects
 *      where name starts with their uid (e.g. (storage.foldername(name))[1] = auth.uid()).
 *
 * @param {string} supabaseUid
 * @param {File}   file
 * @returns {Promise<string>} Public URL
 */
export async function uploadProfilePicture(supabaseUid, file) {
  if (!file) throw new Error("Profile picture is required.");
  if (!/^[0-9a-f-]{36}$/i.test(String(supabaseUid || ""))) {
    throw new Error("Invalid user.");
  }
  if (!PROFILE_PICTURE_ALLOWED_TYPES.has(file.type)) {
    throw new Error("Profile picture must be a JPG, PNG, WEBP, or GIF image.");
  }
  if (file.size > PROFILE_PICTURE_MAX_SIZE) {
    throw new Error("Profile picture must be 3 MB or smaller.");
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  if (!PROFILE_PICTURE_ALLOWED_EXTS.has(ext)) throw new Error("Invalid image file type.");

  const storagePath = `${supabaseUid}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("profile-pictures")
    .upload(storagePath, file, { upsert: true, contentType: file.type });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: urlData } = supabase.storage
    .from("profile-pictures")
    .getPublicUrl(storagePath);

  const cleanUrl = urlData.publicUrl;

  // Persist the clean URL (no cache-bust param) to the DB.
  const { error: dbErr } = await supabase.rpc("set_my_profile_picture_url", {
    p_profile_url: cleanUrl,
  });
  if (dbErr) throw new Error(dbErr.message);

  Promise.resolve(supabase
    .rpc("write_log", {
      p_action:   "UPLOAD_PROFILE_PICTURE",
      p_status:   "Success",
      p_metadata: { fileSize: file.size, mimeType: file.type },
    })
  ).catch(() => {});

  // Return a cache-busted URL for immediate in-memory display so the browser
  // doesn't serve a stale cached copy right after an update.
  return `${cleanUrl}?t=${Date.now()}`;
}

export async function uploadProfileGalleryImage(supabaseUid, file, index) {
  if (!file) throw new Error("Image is required.");
  if (!/^[0-9a-f-]{36}$/i.test(String(supabaseUid || ""))) {
    throw new Error("Invalid user.");
  }
  if (!Number.isInteger(index) || index < 0 || index > 2) {
    throw new Error("Invalid gallery image position.");
  }
  if (!PROFILE_PICTURE_ALLOWED_TYPES.has(file.type)) {
    throw new Error("Image must be a JPG, PNG, WEBP, or GIF image.");
  }
  if (file.size > PROFILE_PICTURE_MAX_SIZE) {
    throw new Error("Image must be 3 MB or smaller.");
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  if (!PROFILE_PICTURE_ALLOWED_EXTS.has(ext)) throw new Error("Invalid image file type.");

  const storagePath = `${supabaseUid}/gallery-${index + 1}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("profile-pictures")
    .upload(storagePath, file, { upsert: true, contentType: file.type });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: urlData } = supabase.storage
    .from("profile-pictures")
    .getPublicUrl(storagePath);

  return `${urlData.publicUrl}?t=${Date.now()}`;
}
