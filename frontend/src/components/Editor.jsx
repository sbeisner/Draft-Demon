import React, { useEffect, useRef, useState } from "react";
import Inkubus from "./Inkubus.jsx";

const countWords = (t) => {
  t = (t || "").trim();
  return t ? t.split(/\s+/).length : 0;
};
const fmt = (n) => (n ?? 0).toLocaleString();

// Words removed in one edit beyond this trigger the "stash or delete?" guard.
const GUARD_WORDS = 25;

// Best-effort diff for a single contiguous edit: strip the common prefix and
// suffix; what's left of the old string is the removed chunk.
function diffEdit(oldV, newV) {
  let p = 0;
  const min = Math.min(oldV.length, newV.length);
  while (p < min && oldV[p] === newV[p]) p++;
  let s = 0;
  while (s < min - p && oldV[oldV.length - 1 - s] === newV[newV.length - 1 - s]) s++;
  return { removed: oldV.slice(p, oldV.length - s), added: newV.slice(p, newV.length - s) };
}

export default function Editor({ sheet, projState, sessionWords, onSave, onStash }) {
  const [value, setValue] = useState(sheet.text);
  const [title, setTitle] = useState(sheet.title);
  const [confirm, setConfirm] = useState(null); // { removed, pending }
  const taRef = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    setValue(sheet.text);
    setTitle(sheet.title);
  }, [sheet.id]);

  const scheduleSave = (text, t = title) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave(text, t), 450);
  };

  const handleChange = (e) => {
    const newV = e.target.value;
    const { removed, added } = diffEdit(value, newV);
    // Big, purely-deletive edit -> intercept and offer to stash.
    if (countWords(removed) >= GUARD_WORDS && added.trim() === "") {
      setConfirm({ removed, pending: newV }); // value stays old -> textarea visually reverts
      return;
    }
    setValue(newV);
    scheduleSave(newV);
  };

  const handleTitle = (e) => {
    setTitle(e.target.value);
    scheduleSave(value, e.target.value);
  };

  const stashSelection = () => {
    const ta = taRef.current;
    if (!ta || ta.selectionStart === ta.selectionEnd) {
      alert("Select the text you want to set aside first.");
      return;
    }
    const removed = value.slice(ta.selectionStart, ta.selectionEnd);
    const pending = value.slice(0, ta.selectionStart) + value.slice(ta.selectionEnd);
    setValue(pending);
    onStash(pending, removed);
  };

  const confirmStash = () => {
    setValue(confirm.pending);
    onStash(confirm.pending, confirm.removed);
    setConfirm(null);
  };
  const confirmDelete = () => {
    setValue(confirm.pending);
    onSave(confirm.pending, title); // immediate save -> penalty applies if it digs into past work
    setConfirm(null);
  };

  return (
    <div className="editor-wrap">
      <div className="editor-top">
        <input className="title" value={title} onChange={handleTitle} />
        <div className="spacer" />
        {projState?.in_deficit && (
          <span className="deficit">⚠ {fmt(projState.cut_debt)} below locked total</span>
        )}
        <span>Session: <span className="live">{fmt(sessionWords)}</span></span>
        <span>{fmt(countWords(value))} words</span>
        <div className="ed-actions">
          <button className="mini" onClick={stashSelection} title="Move the selected text to Cuts">
            ✂ Stash selection
          </button>
        </div>
      </div>

      <textarea
        ref={taRef}
        className="editor"
        value={value}
        onChange={handleChange}
        placeholder="Start writing…"
        spellCheck
      />

      {confirm && (
        <div className="overlay" onClick={(e) => e.target.classList.contains("overlay") && setConfirm(null)}>
          <div className="modal">
            <div className="cut-mascot"><div className="frame"><Inkubus mood="angry" size={84} /></div></div>
            <h2>Inkubus sees that — {countWords(confirm.removed)} words</h2>
            <p className="hint">
              Don't burn the book in a moment of doubt. Set it aside in <b>Cuts</b> instead — it stays
              safe and won't dent your streak. Delete it outright and, if it eats into earlier days'
              work, it'll cost XP and break your streak (and make Inkubus very angry).
            </p>
            <div className="cutpreview">{confirm.removed.slice(0, 600)}{confirm.removed.length > 600 ? "…" : ""}</div>
            <div className="modal-actions">
              <button className="btn" onClick={confirmStash}>✂ Stash to Cuts</button>
              <button className="btn danger" onClick={confirmDelete}>Delete anyway</button>
            </div>
            <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setConfirm(null)}>
              Keep writing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
