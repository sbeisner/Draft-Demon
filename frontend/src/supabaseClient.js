// Supabase client — owns identity (email/password + Apple/Google), issues the
// JWT the backend verifies. Config comes from the Electron main process
// (window.DRAFTDEMON_SUPABASE) in the app, or Vite env vars in pure-browser dev.
import { createClient } from "@supabase/supabase-js";

function readConfig() {
  if (typeof window !== "undefined" && window.DRAFTDEMON_SUPABASE) {
    return window.DRAFTDEMON_SUPABASE; // { url, anonKey }
  }
  const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
  if (env.VITE_SUPABASE_URL) {
    return { url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY };
  }
  return null;
}

const cfg = readConfig();
export const isSupabaseConfigured = !!(cfg && cfg.url && cfg.anonKey);

// Persist the session (incl. the long-lived refresh token) through Electron's
// encrypted safeStorage when the bridge is present; fall back to localStorage
// in a plain browser. The bridge methods are async, which gotrue supports.
const secure = (typeof window !== "undefined" && window.draftDemon && window.draftDemon.secureStore) || null;
const storage = secure
  ? {
      getItem: (k) => secure.get(k),
      setItem: (k, v) => secure.set(k, v),
      removeItem: (k) => secure.delete(k),
    }
  : (typeof window !== "undefined" ? window.localStorage : undefined);

export const supabase = isSupabaseConfigured
  ? createClient(cfg.url, cfg.anonKey, {
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // desktop app handles the OAuth redirect itself
        flowType: "pkce",          // OAuth returns a code we exchange via the deep link
      },
    })
  : null;
