import React, { useState } from "react";
import { updateProfile, changePassword, deleteAccount } from "../auth.js";

// Account settings (KAN-17) + self-serve deletion (KAN-18). Email/password are
// owned by Supabase; display name + plan come from the app backend.
export default function AccountModal({ profile, onClose, onProfileChanged, onToast }) {
  const [name, setName] = useState(profile?.display_name || "");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const saveName = async () => {
    setBusy(true);
    try {
      await updateProfile(name.trim());
      onProfileChanged?.();
      onToast?.("Profile updated", "good");
    } catch { onToast?.("Couldn't update profile", "bad"); }
    finally { setBusy(false); }
  };

  const savePw = async () => {
    if (pw.length < 6) { onToast?.("Password must be at least 6 characters", "bad"); return; }
    setBusy(true);
    try {
      const { error } = await changePassword(pw);
      if (error) throw error;
      setPw("");
      onToast?.("Password changed", "good");
    } catch (e) { onToast?.(e?.message || "Couldn't change password", "bad"); }
    finally { setBusy(false); }
  };

  const removeAccount = async () => {
    if (!window.confirm(
      "Delete your account? This permanently removes your projects, chapters, cuts, and tasks, " +
      "and your sign-in. This cannot be undone."
    )) return;
    setBusy(true);
    try {
      await deleteAccount(); // local data + Supabase identity, then signs out
      onToast?.("Account deleted", "good");
      // Sign-out flips the app back to the auth screen automatically.
    } catch { onToast?.("Account deletion failed", "bad"); setBusy(false); }
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Account</h2>
        <p className="hint">Manage your profile, password, and subscription.</p>

        <div className="field">
          <label>Email</label>
          <input value={profile?.email || "—"} disabled />
        </div>

        <div className="field">
          <label>Plan</label>
          <input value={profile?.plan === "pro" ? `Pro (${profile.plan_status})` : "Free"} disabled />
        </div>

        <div className="field">
          <label>Display name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn ghost" disabled={busy} onClick={saveName}>Save profile</button>

        <div className="field" style={{ marginTop: 18 }}>
          <label>New password</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="leave blank to keep current" />
        </div>
        <button className="btn ghost" disabled={busy || !pw} onClick={savePw}>Change password</button>

        <div style={{ borderTop: "1px solid var(--line)", margin: "20px 0 16px" }} />

        <button className="btn danger" disabled={busy} onClick={removeAccount}>Delete account</button>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
