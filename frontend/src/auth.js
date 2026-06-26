// Thin wrappers over Supabase auth + the app-side account endpoints.
// Sign-up/in/out and password/email changes go straight to Supabase; the
// backend only owns the local profile and the local half of deletion.
import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import { req } from "./api.js";

export { isSupabaseConfigured };

export const signUp = (email, password) =>
  supabase.auth.signUp({ email, password });

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

// OAuth (Apple/Google). We ask Supabase for the provider URL but skip the
// in-app navigation, open it in the system browser, and let the main process
// hand the draftdemon://auth-callback deep link back to us (handleAuthCallback).
// In a plain browser (no Electron bridge) we fall back to a normal redirect.
export async function signInWithOAuth(provider) {
  const bridge = typeof window !== "undefined" ? window.draftDemon : null;
  const res = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: "draftdemon://auth-callback",
      skipBrowserRedirect: !!bridge?.openExternal,
    },
  });
  if (res.error) return res;
  if (bridge?.openExternal && res.data?.url) {
    await bridge.openExternal(res.data.url); // hand off to the system browser
  }
  return res;
}

// Complete an OAuth login from the deep-link URL (draftdemon://auth-callback?code=...).
export async function handleAuthCallback(url) {
  try {
    const code = new URL(url).searchParams.get("code");
    if (!code) return;
    await supabase.auth.exchangeCodeForSession(code); // onAuthStateChange picks it up
  } catch (e) {
    console.warn("OAuth callback exchange failed:", e);
  }
}

export const signOut = () => supabase.auth.signOut();
export const getSession = () => supabase.auth.getSession();

// Subscribe to auth changes; returns an unsubscribe function.
export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data?.subscription?.unsubscribe();
}

// App-side profile (includes plan/entitlement fields).
export const getProfile = () => req("GET", "/api/account/me");
export const updateProfile = (display_name) => req("PATCH", "/api/account/me", { display_name });

// Credential changes are owned by Supabase (KAN-17).
export const changePassword = (password) => supabase.auth.updateUser({ password });

// Account deletion (KAN-18): remove local data with the still-valid token,
// then delete the Supabase identity via the Edge Function, then sign out.
export async function deleteAccount() {
  await req("DELETE", "/api/account/me");
  try {
    await supabase.functions.invoke("delete-account");
  } catch (e) {
    // The Edge Function may not be deployed in every environment; local data is
    // already gone and we still sign out. Surface for visibility.
    console.warn("Supabase identity deletion failed:", e);
  }
  await supabase.auth.signOut();
}
