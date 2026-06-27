import React, { useEffect, useRef, useState } from "react";
import Inkubus from "./Inkubus.jsx";

const fmt = (n) => (n ?? 0).toLocaleString();
const GUARD_WORDS = 25; // one-shot deletions of this many words trigger the stash prompt

// Plain text + word count from HTML, using the DOM (accurate, no regex guessing).
function htmlToText(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return (d.textContent || "").replace(/ /g, " ");
}
const countWords = (html) => {
  const t = htmlToText(html).trim();
  return t ? t.split(/\s+/).length : 0;
};
// Removed chunk between two plain-text strings (common-prefix/suffix diff).
function removedText(oldT, newT) {
  let p = 0;
  const min = Math.min(oldT.length, newT.length);
  while (p < min && oldT[p] === newT[p]) p++;
  let s = 0;
  while (s < min - p && oldT[oldT.length - 1 - s] === newT[newT.length - 1 - s]) s++;
  return oldT.slice(p, oldT.length - s).trim();
}

const TOOLS = [
  { cmd: "bold", label: "B", title: "Bold (⌘B)", style: { fontWeight: 800 } },
  { cmd: "italic", label: "I", title: "Italic (⌘I)", style: { fontStyle: "italic" } },
  { cmd: "underline", label: "U", title: "Underline (⌘U)", style: { textDecoration: "underline" } },
];

export default function Editor({ sheet, projState, sessionWords, onSave, onStash, onToggleInclude, onToast }) {
  const [title, setTitle] = useState(sheet.title);
  const [words, setWords] = useState(sheet.words || 0);
  const [confirm, setConfirm] = useState(null); // { removed, pendingHtml }
  const ref = useRef(null);
  const saveTimer = useRef(null);
  const lastHtml = useRef(sheet.text || "");
  const lastWords = useRef(sheet.words || 0);

  // Initialize the editable surface once (component is remounted per sheet via key).
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = sheet.text || "";
    lastHtml.current = sheet.text || "";
    lastWords.current = sheet.words || 0;
    setWords(sheet.words || 0);
  }, [sheet.id]);

  const scheduleSave = (html, t = title) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave(html, t), 500);
  };

  const exec = (cmd, value = null) => {
    ref.current?.focus();
    document.execCommand(cmd, false, value);
    handleInput();
  };

  const handleInput = () => {
    const html = ref.current.innerHTML;
    const w = countWords(html);
    const drop = lastWords.current - w;
    if (drop >= GUARD_WORDS) {
      // Big one-shot deletion — intercept. Revert the surface and ask.
      const removed = removedText(htmlToText(lastHtml.current), htmlToText(html));
      const top = ref.current.scrollTop;
      ref.current.innerHTML = lastHtml.current; // visually undo
      ref.current.scrollTop = top; // keep the reader where they were
      setConfirm({ removed, pendingHtml: html });
      return;
    }
    lastHtml.current = html;
    lastWords.current = w;
    setWords(w);
    scheduleSave(html);
  };

  const handleTitle = (e) => {
    setTitle(e.target.value);
    scheduleSave(lastHtml.current, e.target.value);
  };

  const handleKeyDown = (e) => {
    // Paragraphs auto-indent visually (CSS), so Tab doesn't insert a character —
    // just keep it from moving focus out of the editor.
    if (e.key === "Tab") e.preventDefault();
  };

  const stashSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      onToast?.("Select the text you want to set aside first.", "bad");
      return;
    }
    const removed = sel.toString();
    document.execCommand("delete");
    const html = ref.current.innerHTML;
    lastHtml.current = html;
    lastWords.current = countWords(html);
    setWords(lastWords.current);
    onStash(html, removed);
  };

  const commit = (html) => {
    const top = ref.current.scrollTop;
    ref.current.innerHTML = html;
    ref.current.scrollTop = top; // preserve scroll across the DOM swap
    lastHtml.current = html;
    lastWords.current = countWords(html);
    setWords(lastWords.current);
  };
  const confirmStash = () => { commit(confirm.pendingHtml); onStash(confirm.pendingHtml, confirm.removed); setConfirm(null); };
  const confirmDelete = () => { commit(confirm.pendingHtml); onSave(confirm.pendingHtml, title); setConfirm(null); };

  const included = sheet.include !== false;

  return (
    <div className="editor-wrap">
      <div className="editor-top">
        <input className="title" value={title} onChange={handleTitle} />
        <button
          className={`incl ${included ? "on" : "off"}`}
          onClick={() => onToggleInclude(!included)}
          title={included ? "Counts toward your goal and the compiled manuscript" : "Planning/outline only — excluded from goal & manuscript"}
        >
          {included ? "✓ In manuscript" : "✕ Excluded"}
        </button>
        <div className="spacer" />
        {projState?.in_deficit && <span className="deficit">⚠ {fmt(projState.cut_debt)} below locked total</span>}
        <span>Session: <span className="live">{fmt(sessionWords)}</span></span>
        <span>{fmt(words)} words</span>
      </div>

      <div className="rt-toolbar">
        {TOOLS.map((t) => (
          <button key={t.cmd} className="rt-btn" title={t.title} style={t.style}
            onMouseDown={(e) => { e.preventDefault(); exec(t.cmd); }}>{t.label}</button>
        ))}
        <span className="rt-sep" />
        <button className="rt-btn" title="Heading" onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "H2"); }}>H</button>
        <button className="rt-btn" title="Quote" onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "BLOCKQUOTE"); }}>❝</button>
        <button className="rt-btn" title="Scene break" onMouseDown={(e) => { e.preventDefault(); exec("insertHorizontalRule"); }}>#</button>
        <button className="rt-btn" title="Clear formatting" onMouseDown={(e) => { e.preventDefault(); exec("removeFormat"); exec("formatBlock", "P"); }}>⌫</button>
        <span className="rt-sep" />
        <button className="rt-btn wide" title="Move the selected text to Cuts" onMouseDown={(e) => { e.preventDefault(); stashSelection(); }}>✂ Stash</button>
      </div>

      <div
        ref={ref}
        className="editor rt"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder="Start writing…"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
      />

      {confirm && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setConfirm(null)}>
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
            <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setConfirm(null)}>Keep writing</button>
          </div>
        </div>
      )}
    </div>
  );
}
