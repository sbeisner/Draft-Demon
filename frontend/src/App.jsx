import React, { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import Editor from "./components/Editor.jsx";
import GoalsPanel from "./components/GoalsPanel.jsx";
import GoalModal from "./components/GoalModal.jsx";
import Inkubus from "./components/Inkubus.jsx";

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
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeSheetId, setActiveSheetId] = useState(null);
  const [modal, setModal] = useState(null); // { isNew, initial }
  const [showCuts, setShowCuts] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [rev, setRev] = useState(0); // bump to force editor remount on programmatic edits
  const [error, setError] = useState(null);
  const sessionBase = useRef({});

  const active = projects.find((p) => p.id === activeId) || null;
  const activeSheet = active ? active.sheets.find((s) => s.id === activeSheetId) || active.sheets[0] : null;

  // ---- load ----
  useEffect(() => {
    api.list()
      .then((list) => {
        setProjects(list);
        if (list.length) selectProject(list[0]);
        else setModal({ isNew: true, initial: NEW_DEFAULT });
      })
      .catch((e) => setError(String(e)));
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
    toast(`✂ Stashed ${fmt(countWords(removed))} words — safe & penalty-free`, "good");
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

  const addSheet = async () => {
    const r = await api.addSheet(active.id, { title: `Chapter ${active.sheets.length + 1}` });
    replaceProject(r);
    setActiveSheetId(r.sheets[r.sheets.length - 1].id);
    setRev((v) => v + 1);
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
  if (error) {
    return (
      <div className="shell">
        <div className="center-msg">
          <Inkubus mood="neutral" size={140} className="welcome-art" />
          <div>⚠ Can't reach the Draft Demon backend.</div>
          <div style={{ fontSize: 12 }}>Start it with: <code>cd backend && uvicorn app:app --port 8741</code></div>
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
          <img className="wordmark" src="/draft-demon-text.png" alt="Draft Demon" />
        </span>
        <div className="spacer" />
        <button className="tb-btn" onClick={() => setModal({ isNew: true, initial: NEW_DEFAULT })}>＋ New Project</button>
        <button className={`tb-btn ${showCuts ? "on" : ""}`} onClick={() => setShowCuts((s) => !s)}>
          ✂ Cuts{active ? ` (${active.cuts.length})` : ""}
        </button>
        <button className="tb-btn" onClick={logToday} title="Demo: log today's goal">⚡ Log today</button>
      </div>

      <div className="app">
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
            <div key={s.id} className={`sheet ${s.id === activeSheet?.id ? "active" : ""}`} onClick={() => setActiveSheetId(s.id)}>
              <div className="t">{s.title}</div>
              <div className="meta">{fmt(s.words)} words</div>
            </div>
          ))}
        </div>

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

        {/* Goals */}
        {active && (
          <GoalsPanel
            project={active}
            onEditGoal={() => setModal({ isNew: false, initial: active })}
            onToggleMilestone={toggleMilestone}
          />
        )}
      </div>

      {modal && (
        <GoalModal
          initial={modal.initial}
          isNew={modal.isNew}
          currentWords={active?.state.total_words || 0}
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
