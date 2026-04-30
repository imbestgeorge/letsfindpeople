import { useEffect, useState } from "react";

export const LAUNCH_DATE = new Date(2026, 4, 16);
export const LAUNCH_MESSAGE = "*Launching May 16, 2026 - Sign up now. The more users, the better your matches later.";
export const SEARCH_LOCKED_MESSAGE = "*This feature will only be available on 16 May 2026";

export const isLaunchLive = (now = new Date()) => now >= LAUNCH_DATE;

export const useLaunchLive = () => {
  const [launchLive, setLaunchLive] = useState(() => isLaunchLive());

  useEffect(() => {
    if (launchLive) return undefined;

    const msUntilLaunch = LAUNCH_DATE.getTime() - Date.now();
    const timer = window.setTimeout(() => {
      setLaunchLive(true);
    }, Math.max(0, msUntilLaunch));

    return () => window.clearTimeout(timer);
  }, [launchLive]);

  return launchLive;
};
