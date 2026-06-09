import { supabase } from "./supabaseClient";

const VISITOR_KEY_STORAGE = "lfp_visitor_key";

function createVisitorKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const digit = char === "x" ? value : (value & 0x3) | 0x8;
    return digit.toString(16);
  });
}

function getVisitorKey() {
  try {
    const existing = localStorage.getItem(VISITOR_KEY_STORAGE);
    if (existing) return existing;

    const visitorKey = createVisitorKey();
    localStorage.setItem(VISITOR_KEY_STORAGE, visitorKey);
    return visitorKey;
  } catch {
    return createVisitorKey();
  }
}

export function trackSiteVisit(path) {
  const cleanPath = typeof path === "string" && path ? path : "/";

  if (cleanPath.startsWith("/admin") || cleanPath.startsWith("/auth/callback")) {
    return;
  }

  supabase
    .rpc("track_site_visit", {
      p_visitor_key: getVisitorKey(),
      p_path: cleanPath.slice(0, 255),
    })
    .then(() => {}, () => {});
}
