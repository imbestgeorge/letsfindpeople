export const LOCAL_DEV_USER_ID = 20;

export function isShowAllNavbarLocalEnabled() {
  const enabled = import.meta.env.VITE_SHOW_ALL_NAV === "true";
  if (!enabled || typeof window === "undefined") return false;

  return import.meta.env.DEV ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
}
