/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { ensureUser } from "../lib/userService";
import { isShowAllNavbarLocalEnabled, LOCAL_DEV_USER_ID } from "../lib/devFlags";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const showAllNavbarOptions = isShowAllNavbarLocalEnabled();
  const [session, setSession] = useState(undefined); // undefined = loading
  const [isAdmin, setIsAdmin] = useState(false);
  const [authBlockReason, setAuthBlockReason] = useState(null);
  // True while fetching the current user's role from the database.
  const [isRoleLoading, setIsRoleLoading] = useState(false);
  // Tracks the last UID for which ensureUser was called to prevent double-calls
  // when Supabase fires SIGNED_IN twice during OTP/magic-link verification.
  const ensuredUidRef = useRef(null);

  async function fetchRole(uid) {
    setIsRoleLoading(true);
    try {
      const { data: user, error } = await supabase
        .from("users")
        .select("id_type, is_deleted, is_banned, suspension_reason, suspended_until")
        .eq("supabase_uid", uid)
        .maybeSingle();
      const isSuspended = user?.suspended_until && new Date(user.suspended_until).getTime() > Date.now();
      if (error || !user || user.is_deleted || user.is_banned || isSuspended) {
        setIsAdmin(false);
        if (user?.is_deleted) {
          setAuthBlockReason("accountDeleted");
        }
        if (user?.is_banned && user?.suspension_reason === "underage") {
          setAuthBlockReason("underageBanned");
        }
        if (user?.is_deleted || user?.is_banned || isSuspended) {
          await supabase.auth.signOut();
        }
        return;
      }
      setAuthBlockReason(null);
      const admin = user.id_type === 2;
      setIsAdmin(admin);
    } catch {
      setIsAdmin(false);
    } finally {
      setIsRoleLoading(false);
    }
  }

  useEffect(() => {
    if (showAllNavbarOptions) {
      let isMounted = true;

      supabase
        .from("users")
        .select("id_user, supabase_uid, email")
        .eq("id_user", LOCAL_DEV_USER_ID)
        .maybeSingle()
        .then(({ data: user, error }) => {
          if (!isMounted) return;
          if (error || !user?.supabase_uid) {
            console.error(error || new Error(`Local dev user ${LOCAL_DEV_USER_ID} not found.`));
            setSession(null);
            setIsAdmin(false);
            setIsRoleLoading(false);
            return;
          }

          setAuthBlockReason(null);
          setIsAdmin(false);
          setIsRoleLoading(false);
          setSession({
            access_token: "local-dev-session",
            token_type: "bearer",
            user: {
              id: user.supabase_uid,
              email: user.email || `local-user-${LOCAL_DEV_USER_ID}@letsfindpeople.local`,
              aud: "authenticated",
              role: "authenticated",
              app_metadata: {},
              user_metadata: {
                localDevUserId: user.id_user,
              },
            },
          });
        });

      return () => {
        isMounted = false;
      };
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session ?? null);
      if (session?.user) {
        setAuthBlockReason(null);
        const isAuthCallback =
          window.location.pathname === "/auth/callback" ||
          window.location.hash.includes("access_token=");

        if (isAuthCallback && ensuredUidRef.current !== session.user.id) {
          ensuredUidRef.current = session.user.id;
          setIsRoleLoading(true);
          try {
            await ensureUser();
            await fetchRole(session.user.id);
          } catch (err) {
            console.error(err);
            setIsAdmin(false);
            setIsRoleLoading(false);
            if (err.message === "ACCOUNT_DELETED") {
              setAuthBlockReason("accountDeleted");
            }
            if (
              err.message === "ACCOUNT_DELETED" ||
              err.message === "ACCOUNT_BANNED" ||
              err.message === "ACCOUNT_SUSPENDED"
            ) {
              await supabase.auth.signOut();
            }
          }
          return;
        }

        fetchRole(session.user.id);
      } else {
        setIsRoleLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session ?? null);
      if (session?.user) {
        setAuthBlockReason(null);
        // Only call ensureUser on genuine sign-in, not on session restoration after a refresh.
        // Guard with a ref so duplicate SIGNED_IN events for the same UID don't double-log.
        if (event === 'SIGNED_IN' && ensuredUidRef.current !== session.user.id) {
          ensuredUidRef.current = session.user.id;
          setIsRoleLoading(true);
          (async () => {
            try {
              await ensureUser();
              await fetchRole(session.user.id);
            } catch (err) {
              console.error(err);
              setIsAdmin(false);
              setIsRoleLoading(false);
              if (err.message === "ACCOUNT_DELETED") {
                setAuthBlockReason("accountDeleted");
              }
              if (err.message === "ACCOUNT_BANNED_UNDERAGE") {
                setAuthBlockReason("underageBanned");
              }
              if (
                err.message === "ACCOUNT_DELETED" ||
                err.message === "ACCOUNT_BANNED" ||
                err.message === "ACCOUNT_BANNED_UNDERAGE" ||
                err.message === "ACCOUNT_SUSPENDED"
              ) {
                await supabase.auth.signOut();
              }
            }
          })();
          return;
        }
        fetchRole(session.user.id);
      } else {
        setIsAdmin(false);
        setIsRoleLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [showAllNavbarOptions]);

  return (
    <AuthContext.Provider value={{ session, isLoading: session === undefined || isRoleLoading, isRoleLoading, isAdmin, authBlockReason, showAllNavbarOptions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
