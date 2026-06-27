// Auth state for the whole app. Restores the session on mount, tracks the
// signed-in user + their plan, and exposes sign-out. Rendering gates on
// `status`: "loading" | "anon" | "authed".
import React, { createContext, useContext, useEffect, useState } from "react";
import { isSupabaseConfigured, onAuthChange, getSession, signOut, getProfile, handleAuthCallback } from "./auth.js";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState("loading"); // loading | anon | authed
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // { email, display_name, plan, ... }

  const refreshProfile = async () => {
    try {
      setProfile(await getProfile());
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStatus("anon"); // can't authenticate without config — show the auth screen
      return;
    }
    let unsub = () => {};
    (async () => {
      const { data } = await getSession();
      applySession(data?.session ?? null);
      unsub = onAuthChange((s) => applySession(s));
    })();
    // Receive OAuth deep-link callbacks from the Electron main process and
    // signal that the renderer is ready to flush any buffered one.
    window.draftDemon?.onAuthCallback?.((url) => handleAuthCallback(url));
    window.draftDemon?.rendererReady?.();
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applySession(s) {
    setSession(s);
    if (s) {
      setStatus("authed");
      refreshProfile();
    } else {
      setStatus("anon");
      setProfile(null);
    }
  }

  const value = {
    status,
    session,
    user: session?.user ?? null,
    profile,
    configured: isSupabaseConfigured,
    refreshProfile,
    signOut: () => signOut(),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
