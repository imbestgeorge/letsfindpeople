// ── catalogService.js ─────────────────────────────────────────────────────────
// Manages fetching and caching of the catalog (categories/subcategories/keywords)
// and user search results.  All data is fetched directly from Supabase — no
// Express backend required.
//
// Caching strategy:
//   - The catalog is large (~800 KB JSON) and rarely changes.
//   - We store it in localStorage under "lfp_catalog" along with its version tag.
//   - On load we compare stored version vs live; re-download only when changed.
//   - If the network is unavailable we fall back to whatever is in the cache.

import { supabase } from "./supabaseClient";

const CACHE_KEY    = "lfp_catalog";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── helpers ──────────────────────────────────────────────────────────────────

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(version, categories) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ version, categories, savedAt: Date.now() })
    );
  } catch {
    // Storage full or unavailable – silently skip caching
  }
}

function isCacheStale(entry) {
  if (!entry?.savedAt) return true;
  return Date.now() - entry.savedAt > CACHE_TTL_MS;
}

// ── public API ────────────────────────────────────────────────────────────────

function mapPublicUser(u) {
  return {
    id:             u.id_user,
    supabaseUid:    u.supabase_uid,
    name:           `${u.first_name || ""} ${u.last_name || ""}`.trim(),
    birthday:       u.date_of_birth,
    location:       u.location,
    contacts: {
      phone:     { value: u.phone_number  || "", show: u.show_phone_number },
      instagram: { value: u.instagram     || "", show: u.show_instagram },
      tiktok:    { value: u.tiktok        || "", show: u.show_tiktok },
      snapchat:  { value: u.snapchat      || "", show: u.show_snapchat },
      discord:   { value: u.discord       || "", show: u.show_discord },
    },
    profilePicture: u.profile_url || null,
    keywordIds:     u.all_keyword_ids || [],
  };
}

/**
 * Returns the catalog as { categories }.
 * Uses cache when possible; re-fetches when stale or version changed.
 */
export async function getCatalog() {
  const cached = readCache();

  // If cache is fresh (within TTL) skip the network entirely.
  if (cached && !isCacheStale(cached)) {
    return { categories: cached.categories };
  }

  try {
    // Fetch categories, subcategories, and all keywords directly from Supabase.
    const [catResult, subResult] = await Promise.all([
      supabase.from("categories").select("id_category, name").order("id_category"),
      supabase
        .from("subcategories")
        .select("id_subcategory, name, id_category")
        .order("id_subcategory"),
    ]);

    if (catResult.error) throw new Error(catResult.error.message);
    if (subResult.error) throw new Error(subResult.error.message);

    // Paginate keywords to get all rows regardless of count.
    const allKw = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("keywords")
        .select("id_keyword, name, id_subcategory")
        .order("id_keyword")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      allKw.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // Group keywords by subcategory.
    const kwBySubcat = {};
    for (const kw of allKw) {
      if (!kwBySubcat[kw.id_subcategory]) kwBySubcat[kw.id_subcategory] = [];
      kwBySubcat[kw.id_subcategory].push({ id: kw.id_keyword, name: kw.name });
    }

    // Group subcategories by category.
    const subByCategory = {};
    for (const sub of subResult.data) {
      if (!subByCategory[sub.id_category]) subByCategory[sub.id_category] = [];
      subByCategory[sub.id_category].push({
        id:    sub.id_subcategory,
        name:  sub.name,
        items: kwBySubcat[sub.id_subcategory] || [],
      });
    }

    const categories = catResult.data.map((cat) => ({
      id:             cat.id_category,
      name:           cat.name,
      subcategories:  subByCategory[cat.id_category] || [],
    }));

    // Version tag based on row counts — same logic as the old Express backend.
    const version = `${catResult.data.length}-${subResult.data.length}-${allKw.length}`;

    if (!cached || cached.version !== version) {
      writeCache(version, categories);
    } else {
      // Same version — just bump the savedAt timestamp.
      writeCache(version, cached.categories);
    }

    return { categories };
  } catch (err) {
    // Network / DB failed — serve stale cache if available.
    if (cached) {
      console.warn("[catalogService] error, using stale cache:", err.message);
      return { categories: cached.categories };
    }
    throw err;
  }
}

/**
 * Search for users who have ALL of the supplied keyword IDs.
 * Delegates to the search_users_by_keywords Postgres RPC which runs as
 * SECURITY DEFINER and handles the set-intersection logic server-side.
 * @param {number[]} keywordIds
 * @param {string} [reason]
 * @returns {Promise<{ users: object[] }>}
 */
export async function searchUsers(keywordIds) {
  const ids = [...new Set(keywordIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) throw new Error("keywordIds must contain valid integers.");

  const { data, error } = await supabase.rpc("search_users_by_keywords", {
    keyword_ids: ids,
  });
  if (error) throw new Error(error.message);

  // Note: the search_users_by_keywords RPC already writes the SEARCH log
  // server-side. Do not write it again here to avoid double-logging.

  const users = (data || []).map(mapPublicUser);

  return { users };
}

export async function getPublicUserById(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid user.");

  const { data, error } = await supabase.rpc("get_public_user_profile", {
    p_user_id: id,
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapPublicUser(row) : null;
}

export async function getUserCount() {
  const { data: rpcCount, error: rpcError } = await supabase.rpc("get_public_user_count");
  if (!rpcError) return Number(rpcCount || 0);

  const { count, error } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("is_deleted", false);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Consumes one free search for free users, or allows active subscribers through
 * without decrementing their remaining searches.
 * @returns {Promise<{ allowed: boolean, remaining: number, unlimited: boolean, reason: string }>}
 */
export async function consumeSearchAllowance() {
  const { data, error } = await supabase.rpc("consume_search_allowance");
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: !!row?.allowed,
    remaining: Number(row?.remaining ?? 0),
    unlimited: !!row?.unlimited,
    reason: row?.reason || "",
    resetAt: row?.reset_at || null,
  };
}

/**
 * Request a new keyword by name.
 * Increments request_amount if a pending request for that name already exists;
 * otherwise inserts a new row.
 * @param {string} name
 */
export async function requestKeyword(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Keyword name is required.");
  if (trimmed.length > 80) throw new Error("Keyword name must be 80 characters or fewer.");

  const { error } = await supabase.rpc("request_keyword", { p_name: trimmed });
  if (error) throw new Error(error.message);
}
