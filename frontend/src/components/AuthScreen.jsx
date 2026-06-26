import React, { useState } from "react";
import Inkubus from "./Inkubus.jsx";
import { signIn, signUp, signInWithOAuth } from "../auth.js";
import { useAuth } from "../AuthContext.jsx";

// Full-screen gate shown when no one is signed in. Email/password against
// Supabase, plus Apple/Google OAuth. Styled with the app's existing tokens.
export default function AuthScreen() {
  const { configured } = useAuth();
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const isSignup = mode === "signup";

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { data, error } = isSignup
        ? await signUp(email.trim(), password)
        : await signIn(email.trim(), password);
      if (error) throw error;
      // Sign-up with email confirmation on: no session until they confirm.
      if (isSignup && !data?.session) {
        setNotice("Account created — check your email to confirm, then sign in.");
        setMode("signin");
      }
      // Otherwise onAuthStateChange flips the app to the authed view.
    } catch (err) {
      setError(err?.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider) => {
    setError(null);
    try {
      const { error } = await signInWithOAuth(provider);
      if (error) throw error;
    } catch (err) {
      setError(err?.message || `Could not start ${provider} sign-in.`);
    }
  };

  return (
    <div className="shell">
      <div className="center-msg" style={{ padding: 24 }}>
        <Inkubus mood="neutral" size={120} className="welcome-art" />
        <div style={{ fontWeight: 700, fontSize: 18, color: "var(--txt)" }}>
          {isSignup ? "Create your account" : "Welcome back"}
        </div>
        <div style={{ fontSize: 13, marginBottom: 4 }}>
          {isSignup ? "Start owing Inkubus your words." : "Sign in to keep your streak alive."}
        </div>

        {!configured ? (
          <div style={{ maxWidth: 360, fontSize: 12, color: "var(--bad)", lineHeight: 1.5 }}>
            Sign-in isn't configured yet. Set <code>SUPABASE_URL</code> and{" "}
            <code>SUPABASE_ANON_KEY</code> (or the <code>VITE_</code> equivalents in dev) and
            relaunch.
          </div>
        ) : (
          <form onSubmit={submit} style={{ width: 320, textAlign: "left", marginTop: 6 }}>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {error && <div style={{ color: "var(--bad)", fontSize: 12, marginBottom: 10 }}>{error}</div>}
            {notice && <div style={{ color: "var(--good)", fontSize: 12, marginBottom: 10 }}>{notice}</div>}

            <button className="btn" type="submit" disabled={busy}>
              {busy ? "…" : isSignup ? "Create account" : "Sign in"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0", color: "var(--txt3)", fontSize: 11 }}>
              <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              OR
              <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            </div>

            <button type="button" className="btn ghost" onClick={() => oauth("apple")}> Continue with Apple</button>
            <button type="button" className="btn ghost" onClick={() => oauth("google")}>Continue with Google</button>

            <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--txt2)" }}>
              {isSignup ? "Already have an account?" : "New to Draft Demon?"}{" "}
              <a
                href="#"
                style={{ color: "var(--accent)" }}
                onClick={(e) => { e.preventDefault(); setError(null); setNotice(null); setMode(isSignup ? "signin" : "signup"); }}
              >
                {isSignup ? "Sign in" : "Create one"}
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
