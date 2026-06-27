import React, { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import Editor from "./components/Editor.jsx";
import GoalsPanel from "./components/GoalsPanel.jsx";
import GoalModal from "./components/GoalModal.jsx";
import Inkubus from "./components/Inkubus.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import AccountModal from "./components/AccountModal.jsx";
import { useAuth } from "./AuthContext.jsx";

const fmt = (n) => (n ?? 0).toLocaleString();
const countWords = (t) => {
  t = (t || "").trim();
  return t ? t.split(/\s+/).length : 0;
};
const plusYear = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};
const NEW_DEFAULT = {
  title: "Untitled Project", subtitle: "Novel", target: 80000,
  deadline: plusYear(), days_per_week: 5,
};

export default function App() {
  const { status, profile, signOut, refreshProfile } = useAuth();
  const [showAccount, setShowAccount] = useState(false);
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeSheetId, setActiveSheetId] = useState(null);
  const [modal, setModal] = useState(null); // { isNew, initial }
  const [showCuts, setShowCuts] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [rev, setRev] = useState(0); // bump to force editor remount on programmatic edits
  const [error, setError] = useState(null);
  const [leftOpen, setLeftOpen] = useState(true);   // library + chapters
  const [rightOpen, setRightOpen] = useState(true); // goals / Inkubus panel
  const sessionBase = useRef({});
  const focusMode = !leftOpen && !rightOpen;
  const toggleFocus = () => { const open = focusMode; setLeftOpen(open); setRightOpen(open); };

  // Esc leaves focus mode
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && focusMode) { setLeftOpen(true); setRightOpen(true); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);

  const active = projects.find((p) => p.id === activeId) || null;
  const activeSheet = active ? active.sheets.find((s) => s.id === activeSheetId) || active.sheets[0] : null;

  // ---- load ----
  // Retry the first connection so a backend that is still warming up (common on
  // a one-command `npm run dev` boot) doesn't permanently show the error screen.
  const load = async ({ retries = 20, delay = 500 } = {}) => {
    setError(null);
    for (let attempt = 0; ; attempt++) {
      try {
        const [list, st] = await Promise.all([api.list(), api.getState().catch(() => ({}))]);
        setProjects(list);
        if (list.length) {
          const initial = list.find((p) => p.id === st?.active_project_id) || list[0];
          selectProject(initial);
        } else {
          setModal({ isNew: true, initial: NEW_DEFAULT });
        }
        return;
      } catch (e) {
        if (attempt >= retries) { setError(String(e)); return; }
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  };

  // Load once signed in; clear state on sign-out so a different account never
  // sees the previous user's projects.
  useEffect(() => {
    if (status === "authed") {
      load();
    } else if (status === "anon") {
      setProjects([]); setActiveId(null); setActiveSheetId(null); setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // keep the active project id reachable from the once-registered dict listener
  const activeIdRef = useRef(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // sync the active project's custom words into Electron's spellchecker
  useEffect(() => {
    if (active) window.draftDemon?.syncDictionary?.(active.dictionary || []);
  }, [activeId, active?.dictionary]);

  // persist words added via the native right-click "Add to dictionary"
  useEffect(() => {
    window.draftDemon?.onDictAdd?.(async (word) => {
      const id = activeIdRef.current;
      if (!id) return;
      try { replaceProject(await api.addWord(id, word)); toast(`“${word}” added to dictionary`, "good"); } catch {}
    });
  }, []);

  useEffect(() => {
    if (active && sessionBase.current[active.id] === undefined) {
      sessionBase.current[active.id] = active.state.total_words;
    }
  }, [activeId, active]);

  // ---- helpers ----
  const toast = (msg, kind = "") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  };

  const replaceProject = (p) =>
    setProjects((list) => list.map((x) => (x.id === p.id ? p : x)));

  const selectProject = (p) => {
    setActiveId(p.id);
    setActiveSheetId(p.sheets[0]?.id ?? null);
    setShowCuts(false);
    api.setActive(p.id).catch(() => {}); // keep the native widget in sync
  };

  const handleEvent = (ev) => {
    if (!ev) return;
    if (ev.penalty_xp > 0 || ev.broke_streak) {
      const bits = [`⚠ Cut ${fmt(ev.cut_into_past)} words of earlier work`];
      if (ev.penalty_xp) bits.push(`−${fmt(ev.penalty_xp)} XP`);
      if (ev.broke_streak) bits.push("streak reset");
      toast(bits.join(" · "), "bad");
    } else if (ev.goal_met_now) {
      toast("🔥 Daily goal hit!", "good");
    }
    (ev.badges_earned || []).forEach((b) => toast(`🏅 Badge unlocked: ${b}`, "good"));
  };

  // ---- writes ----
  const save = async (text, title, bump = false) => {
    if (!active || !activeSheet) return;
    try {
      const r = await api.saveSheet(active.id, activeSheet.id, { text, title });
      replaceProject(r);
      handleEvent(r.event);
      if (bump) setRev((v) => v + 1);
    } catch (e) {
      toast("Save failed — is the backend running?", "bad");
    }
  };

  const stash = async (newText, removed) => {
    if (!active || !activeSheet) return;
    const r = await api.stash(active.id, activeSheet.id, { new_text: newText, removed_text: removed });
    replaceProject(r);
    const lost = r.event?.uncredited || 0;
    const tail = lost ? ` · −${fmt(lost)} XP, no penalty` : "";
    toast(`✂ Stashed ${fmt(countWords(removed))} words to Cuts${tail}`, "good");
  };

  const restore = async (cid) => {
    const r = await api.restoreCut(active.id, cid);
    replaceProject(r);
    try {
      await navigator.clipboard.writeText(r.restored_text || "");
      toast("📋 Copied to clipboard — paste it back in", "good");
    } catch {
      toast("Removed from Cuts", "good");
    }
  };

  const toggleMilestone = async (i, done) => {
    const r = await api.setMilestone(active.id, { index: i, done });
    replaceProject(r);
  };

  const toggleInclude = async (include) => {
    if (!active || !activeSheet) return;
    const r = await api.setInclude(active.id, activeSheet.id, include);
    replaceProject(r);
    toast(include ? "✓ Counts toward your manuscript" : "✕ Excluded — planning only", "good");
  };

  const compile = async () => {
    if (!active) return;
    toast("📄 Compiling manuscript…", "good");
    try {
      await api.compile(active.id);
    } catch {
      toast("Compile failed — is the backend running?", "bad");
    }
  };

  const addTask = async (text) => {
    if (!active || !text.trim()) return;
    replaceProject(await api.addTask(active.id, text.trim()));
  };
  const toggleTask = async (tid, done) => {
    if (!active) return;
    const r = await api.updateTask(active.id, tid, { done });
    replaceProject(r);
    if (r.event?.task_done) toast("✓ Box checked — Inkubus approves! +20 XP", "good");
  };
  const deleteTask = async (tid) => {
    if (!active) return;
    replaceProject(await api.deleteTask(active.id, tid));
  };
  const jumpToSheet = (sid) => {
    setShowCuts(false);
    setActiveSheetId(sid);
  };

  const addWord = async (word) => { if (active && word.trim()) replaceProject(await api.addWord(active.id, word.trim())); };
  const removeWord = async (word) => { if (active) replaceProject(await api.removeWord(active.id, word)); };

  const addSheet = async () => {
    const r = await api.addSheet(active.id, { title: `Chapter ${active.sheets.length + 1}` });
    replaceProject(r);
    setActiveSheetId(r.sheets[r.sheets.length - 1].id);
    setRev((v) => v + 1);
  };

  const deleteSheet = async (sheet, e) => {
    e?.stopPropagation();
    const msg = sheet.words > 0
      ? `Delete “${sheet.title}”? Its ${fmt(sheet.words)} words will be moved to Cuts so you can restore them.`
      : `Delete “${sheet.title}”?`;
    if (!window.confirm(msg)) return;
    try {
      const r = await api.deleteSheet(active.id, sheet.id);
      replaceProject(r);
      if (activeSheetId === sheet.id) setActiveSheetId(r.sheets[0]?.id ?? null);
      setRev((v) => v + 1);
      const lost = r.uncredited || 0;
      toast(sheet.words > 0
        ? `Chapter deleted — ${fmt(sheet.words)} words saved to Cuts${lost ? ` · −${fmt(lost)} XP` : ""}`
        : "Chapter deleted", "good");
    } catch (e) {
      toast("Delete failed — is the backend running?", "bad");
    }
  };

  const deleteProject = async (p, e) => {
    e?.stopPropagation();
    if (!window.confirm(`Delete “${p.title}” and everything in it? This can't be undone.`)) return;
    try {
      await api.remove(p.id);
      const remaining = projects.filter((x) => x.id !== p.id);
      setProjects(remaining);
      if (activeId === p.id) {
        if (remaining.length) selectProject(remaining[0]);
        else { setActiveId(null); setActiveSheetId(null); }
      }
      toast("Project deleted", "good");
    } catch (e) {
      toast("Delete failed — is the backend running?", "bad");
    }
  };

  const saveGoal = async (data) => {
    if (modal.isNew) {
      const r = await api.create(data);
      setProjects((list) => [...list, r]);
      selectProject(r);
    } else {
      const r = await api.updateGoal(active.id, data);
      replaceProject(r);
    }
    setModal(null);
  };

  // demo helper: log today's remaining goal as filler text
  const logToday = async () => {
    if (!active || !activeSheet) return;
    const need = Math.max(50, active.state.daily_goal - active.state.wrote_today);
    const filler = Array(need).fill("lorem").join(" ");
    const text = (activeSheet.text ? activeSheet.text + " " : "") + filler;
    await save(text, activeSheet.title, true);
    toast(`Logged ${fmt(need)} words for today`, "good");
  };

  // ---- render ----
  if (status === "loading") {
    return (
      <div className="shell">
        <div className="center-msg">
          <Inkubus mood="neutral" size={120} className="welcome-art" />
          <div>Waking Inkubus…</div>
        </div>
      </div>
    );
  }
  if (status === "anon") return <AuthScreen />;

  if (error) {
    return (
      <div className="shell">
        <div className="center-msg">
          <Inkubus mood="neutral" size={140} className="welcome-art" />
          <div>⚠ Can't reach the Inkubus backend.</div>
          <div style={{ fontSize: 12 }}>Boot everything with: <code>npm run dev</code></div>
          <button className="btn ghost" style={{ marginTop: 12, width: "auto", padding: "8px 20px" }} onClick={() => load()}>Retry</button>
        </div>
      </div>
    );
  }

  const sessionWords = active
    ? Math.max(0, active.state.total_words - (sessionBase.current[active.id] ?? active.state.total_words))
    : 0;

  return (
    <div className="shell">
      <div className="titlebar">
        <div className="dots"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
        <span className="brand">
          <span className="wordmark">INKUBUS</span>
        </span>
        <div className="spacer" />
        <button className="tb-btn" onClick={() => setModal({ isNew: true, initial: NEW_DEFAULT })}>＋ New Project</button>
        {active && <button className="tb-btn" onClick={compile} title="Compile included chapters into a manuscript .docx">📄 Compile</button>}
        <button className={`tb-btn ${showCuts ? "on" : ""}`} onClick={() => setShowCuts((s) => !s)}>
          ✂ Cuts{active ? ` (${active.cuts.length})` : ""}
        </button>
        <button className="tb-btn" onClick={logToday} title="Demo: log today's goal">⚡ Log today</button>
        <button className={`tb-btn ${focusMode ? "on" : ""}`} onClick={toggleFocus} title="Focus mode — hide all panels (Esc to exit)">◳ Focus</button>
        {profile && (
          <button className="tb-btn tb-acct" title="Account settings" onClick={() => setShowAccount(true)}
            style={{ marginLeft: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: profile.plan === "pro" ? "var(--accent)" : "var(--txt3)" }}>
              {profile.plan === "pro" ? "★ Pro" : "Free"}
            </span>
            <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {profile.display_name || profile.email}
            </span>
          </button>
        )}
        <button className="tb-btn" onClick={() => signOut()} title="Sign out">⎋ Sign out</button>
      </div>

      <div className={`app ${focusMode ? "focus" : ""}`}>
        <div className={`side-left ${leftOpen ? "" : "collapsed"}`}>
        {/* Library */}
        <div className="col library">
          <div className="col-head">
            Library
            <button className="add" onClick={() => setModal({ isNew: true, initial: NEW_DEFAULT })}>＋</button>
          </div>
          {projects.map((p) => {
            const pct = p.state.overall_pct;
            return (
              <div key={p.id} className={`proj ${p.id === activeId ? "active" : ""}`} onClick={() => selectProject(p)}>
                <button className="row-del" title="Delete project" onClick={(e) => deleteProject(p, e)}>✕</button>
                <div className="t">{p.title}</div>
                <div className="s">{fmt(p.state.total_words)} / {fmt(p.target)} · {pct}%</div>
                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>

        {/* Sheets */}
        <div className="col sheets">
          <div className="col-head">
            {active ? active.title : "Sheets"}
            {active && <button className="add" onClick={addSheet}>＋</button>}
          </div>
          {active?.sheets.map((s) => (
            <div key={s.id} className={`sheet ${s.id === activeSheet?.id ? "active" : ""} ${s.include === false ? "excluded" : ""}`} onClick={() => setActiveSheetId(s.id)}>
              <button className="row-del" title="Delete chapter" onClick={(e) => deleteSheet(s, e)}>✕</button>
              <div className="t">{s.include === false ? "✕ " : ""}{s.title}</div>
              <div className="meta">{fmt(s.words)} words{s.include === false ? " · excluded" : ""}</div>
            </div>
          ))}
        </div>
        </div>

        <div className="center-area">
        <button className="panel-toggle left" onClick={() => setLeftOpen((o) => !o)}
          title={leftOpen ? "Collapse library & chapters" : "Show library & chapters"}>{leftOpen ? "‹" : "›"}</button>
        {active && (
          <button className="panel-toggle right" onClick={() => setRightOpen((o) => !o)}
            title={rightOpen ? "Collapse goals panel" : "Show goals panel"}>{rightOpen ? "›" : "‹"}</button>
        )}

        {/* Editor or Cuts */}
        {showCuts ? (
          <div className="editor-wrap">
            <div className="editor-top"><b>Cuts</b><div className="spacer" /><span>{active?.cuts.length || 0} stashed</span></div>
            <div style={{ padding: "20px max(40px,6%)", overflowY: "auto" }}>
              <p className="hint" style={{ color: "var(--txt3)", marginBottom: 16 }}>
                Anything you set aside lives here, intact. Restoring copies it to your clipboard so you
                can paste it back wherever it belongs.
              </p>
              {active && active.cuts.length === 0 && <div className="empty">Nothing stashed yet.</div>}
              {active?.cuts.map((c) => (
                <div key={c.id} className="cut">
                  <div className="ct">{c.text}</div>
                  <div className="cb">
                    <span className="cm">{fmt(c.words)} words · {c.sheet_title} · {c.created?.replace("T", " ")}</span>
                    <button className="cr" onClick={() => restore(c.id)}>Restore ↩</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeSheet ? (
          <Editor
            key={`${active.id}-${activeSheet.id}-${rev}`}
            sheet={activeSheet}
            projState={active.state}
            sessionWords={sessionWords}
            onSave={save}
            onStash={stash}
            onToggleInclude={toggleInclude}
            onToast={toast}
          />
        ) : (
          <div className="editor-wrap">
            <div className="center-msg">
              <Inkubus mood="neutral" size={170} className="welcome-art" />
              <div style={{ fontWeight: 700, fontSize: 16, color: "var(--txt)" }}>Inkubus is ready when you are.</div>
              <div>Create a project to set your goal and start writing.</div>
              <button className="btn" style={{ width: "auto", padding: "10px 20px", marginTop: 6 }}
                onClick={() => setModal({ isNew: true, initial: NEW_DEFAULT })}>
                ＋ New Project
              </button>
            </div>
          </div>
        )}

        </div>

        {/* Goals */}
        {active && (
          <div className={`side-right ${rightOpen ? "" : "collapsed"}`}>
            <GoalsPanel
              project={active}
              onEditGoal={() => setModal({ isNew: false, initial: active })}
              onToggleMilestone={toggleMilestone}
              onAddTask={addTask}
              onToggleTask={toggleTask}
              onDeleteTask={deleteTask}
              onJumpSheet={jumpToSheet}
            />
          </div>
        )}
      </div>

      {showAccount && (
        <AccountModal
          profile={profile}
          onClose={() => setShowAccount(false)}
          onProfileChanged={refreshProfile}
          onToast={toast}
        />
      )}

      {modal && (
        <GoalModal
          initial={modal.initial}
          isNew={modal.isNew}
          currentWords={active?.state.total_words || 0}
          dictionary={modal.isNew ? [] : (active?.dictionary || [])}
          onAddWord={addWord}
          onRemoveWord={removeWord}
          onSave={saveGoal}
          onClose={() => setModal(null)}
        />
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
