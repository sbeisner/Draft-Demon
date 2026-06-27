import React, { useEffect, useRef, useState } from "react";
import Inkubus from "./Inkubus.jsx";

const fmt = (n) => (n ?? 0).toLocaleString();
const GUARD_WORDS = 25; // one-shot deletions of this many words trigger the stash prompt

// Plain text + word count from HTML, using the DOM (accurate, no regex guessing).
function htmlToText(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return (d.textContent || "").replace(/ /g, " ");
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
  { cmd: "bold", label: "B", title: "Bold (⌘/Ctrl+B)", style: { fontWeight: 800 } },
  { cmd: "italic", label: "I", title: "Italic (⌘/Ctrl+I)", style: { fontStyle: "italic" } },
  { cmd: "underline", label: "U", title: "Underline (⌘/Ctrl+U)", style: { textDecoration: "underline" } },
];

// ---- KAN-84: smart typography ---------------------------------------------
const SMART_KEY = "dd.smartTypography";
const loadSmartPref = () => {
  try { return localStorage.getItem(SMART_KEY) !== "0"; } catch { return true; }
};
const isWordChar = (c) => !!c && /[A-Za-z0-9]/.test(c);
const isOpenContext = (c) => !c || /[\s(\[{<—–"'“‘]/.test(c);

// ---- KAN-83: find helpers --------------------------------------------------
const wordBoundary = (full, start, len) => {
  const before = full[start - 1];
  const after = full[start + len];
  return !isWordChar(before) && !isWordChar(after);
};

export default function Editor({ sheet, projState, sessionWords, onSave, onStash, onToggleInclude, onToast }) {
  const [title, setTitle] = useState(sheet.title);
  const [words, setWords] = useState(sheet.words || 0);
  const [confirm, setConfirm] = useState(null); // { removed, pendingHtml }
  const [smartOn, setSmartOn] = useState(loadSmartPref);

  // Find & replace state
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [matchIdx, setMatchIdx] = useState(0); // 1-based for display, 0 = none

  const ref = useRef(null);
  const findInputRef = useRef(null);
  const saveTimer = useRef(null);
  const lastHtml = useRef(sheet.text || "");
  const lastWords = useRef(sheet.words || 0);
  const subbing = useRef(false);        // guard against smart-sub recursion
  const matchRanges = useRef([]);       // live Range objects for current matches
  const curIdx = useRef(0);             // 0-based index of the active match

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

  // ---- KAN-84: apply a smart-typography substitution at the caret ----------
  // Uses execCommand so the change lands on the native undo stack: one Ctrl/Cmd+Z
  // reverts the substitution to the raw characters, never "fighting" the writer.
  const maybeSmartSub = () => {
    if (!smartOn || subbing.current) return;
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !sel.anchorNode || sel.anchorNode.nodeType !== Node.TEXT_NODE) return;
    const node = sel.anchorNode;
    const offset = sel.anchorOffset;
    const text = node.nodeValue || "";
    const prev = text[offset - 1];
    if (!prev) return;

    let backCount = 0;     // characters to remove behind the caret
    let insert = null;     // replacement string

    if (prev === ".") {
      // "..." -> ellipsis
      if (text.slice(offset - 3, offset) === "...") { backCount = 3; insert = "…"; }
    } else if (prev === "-") {
      // "--" -> em dash (handles start-of-line and mid-word the same, sanely)
      if (text.slice(offset - 2, offset) === "--") { backCount = 2; insert = "—"; }
    } else if (prev === '"') {
      backCount = 1;
      insert = isOpenContext(text[offset - 2]) ? "“" : "”"; // “ ”
    } else if (prev === "'") {
      backCount = 1;
      insert = isOpenContext(text[offset - 2]) ? "‘" : "’"; // ‘ ’ (’ also = apostrophe)
    }

    if (!insert || offset < backCount) return;

    try {
      subbing.current = true;
      const range = document.createRange();
      range.setStart(node, offset - backCount);
      range.setEnd(node, offset);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, insert);
    } finally {
      subbing.current = false;
    }
  };

  const handleInput = () => {
    if (!subbing.current) maybeSmartSub();

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
    if (findOpen && query) refreshMatches();
  };

  const handleTitle = (e) => {
    setTitle(e.target.value);
    scheduleSave(lastHtml.current, e.target.value);
  };

  // Is the current block already a given tag? (for toggle behaviour)
  const inBlock = (tag) => {
    try { return (document.queryCommandValue("formatBlock") || "").toLowerCase() === tag.toLowerCase(); }
    catch { return false; }
  };

  // ---- KAN-85: formatting keyboard shortcuts -------------------------------
  const handleKeyDown = (e) => {
    // Paragraphs auto-indent visually (CSS), so Tab doesn't insert a character —
    // just keep it from moving focus out of the editor.
    if (e.key === "Tab") { e.preventDefault(); return; }

    const mod = e.metaKey || e.ctrlKey; // ⌘ on macOS, Ctrl on Windows/Linux
    if (!mod) return;

    // Cmd/Ctrl+F opens find (also wired globally below for when focus is elsewhere).
    if (!e.altKey && !e.shiftKey && e.code === "KeyF") { e.preventDefault(); openFind(); return; }

    // Basic marks. We handle them explicitly so behaviour is identical on every
    // platform (and stays consistent with a future iOS hardware-keyboard editor).
    if (!e.altKey && !e.shiftKey) {
      if (e.code === "KeyB") { e.preventDefault(); exec("bold"); return; }
      if (e.code === "KeyI") { e.preventDefault(); exec("italic"); return; }
      if (e.code === "KeyU") { e.preventDefault(); exec("underline"); return; }
      if (e.code === "Enter") { e.preventDefault(); exec("insertHorizontalRule"); return; } // scene break
      if (e.code === "Backslash") { e.preventDefault(); exec("removeFormat"); exec("formatBlock", "P"); return; }
    }
    // Block styles live on ⌘/Ctrl+Alt to avoid clobbering text entry.
    if (e.altKey && !e.shiftKey) {
      if (e.code === "Digit2") { e.preventDefault(); exec("formatBlock", inBlock("h2") ? "P" : "H2"); return; }
      if (e.code === "Digit0") { e.preventDefault(); exec("formatBlock", "P"); return; }
      if (e.code === "KeyQ")   { e.preventDefault(); exec("formatBlock", inBlock("blockquote") ? "P" : "BLOCKQUOTE"); return; }
    }
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

  const toggleSmart = () => {
    setSmartOn((on) => {
      const next = !on;
      try { localStorage.setItem(SMART_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  // ---- KAN-83: find & replace ----------------------------------------------
  const clearHighlights = () => {
    if (window.CSS && CSS.highlights) { CSS.highlights.delete("dd-find"); CSS.highlights.delete("dd-find-current"); }
  };

  // Walk the editor's text nodes, locate every match, and paint them with the
  // CSS Custom Highlight API so we never mutate the manuscript markup itself.
  const computeMatches = () => {
    const root = ref.current;
    matchRanges.current = [];
    if (!root || !query) { clearHighlights(); setMatchCount(0); setMatchIdx(0); return; }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const charMap = []; // charMap[i] = { node, off }
    let full = "";
    let node;
    while ((node = walker.nextNode())) {
      const t = node.nodeValue || "";
      for (let i = 0; i < t.length; i++) charMap.push({ node, off: i });
      full += t;
    }

    const hay = matchCase ? full : full.toLowerCase();
    const needle = matchCase ? query : query.toLowerCase();
    const ranges = [];
    let from = 0;
    while (needle) {
      const idx = hay.indexOf(needle, from);
      if (idx < 0) break;
      if (wholeWord && !wordBoundary(full, idx, needle.length)) { from = idx + 1; continue; }
      const a = charMap[idx];
      const b = charMap[idx + needle.length - 1];
      if (a && b) {
        const r = document.createRange();
        r.setStart(a.node, a.off);
        r.setEnd(b.node, b.off + 1);
        ranges.push(r);
      }
      from = idx + needle.length;
    }

    matchRanges.current = ranges;
    setMatchCount(ranges.length);
    if (curIdx.current >= ranges.length) curIdx.current = 0;
    paintHighlights();
    setMatchIdx(ranges.length ? curIdx.current + 1 : 0);
  };

  const paintHighlights = () => {
    if (!(window.CSS && CSS.highlights && window.Highlight)) return;
    const ranges = matchRanges.current;
    if (!ranges.length) { clearHighlights(); return; }
    CSS.highlights.set("dd-find", new Highlight(...ranges));
    const cur = ranges[curIdx.current];
    if (cur) CSS.highlights.set("dd-find-current", new Highlight(cur));
    else CSS.highlights.delete("dd-find-current");
  };

  const scrollToCurrent = () => {
    const r = matchRanges.current[curIdx.current];
    const el = r && (r.startContainer.parentElement);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const refreshMatches = () => { computeMatches(); };

  const stepMatch = (dir) => {
    const n = matchRanges.current.length;
    if (!n) return;
    curIdx.current = (curIdx.current + dir + n) % n;
    setMatchIdx(curIdx.current + 1);
    paintHighlights();
    scrollToCurrent();
  };

  const openFind = () => {
    setFindOpen(true);
    setTimeout(() => { findInputRef.current?.focus(); findInputRef.current?.select(); }, 0);
  };
  const closeFind = () => {
    setFindOpen(false);
    clearHighlights();
    ref.current?.focus();
  };

  const replaceCurrent = () => {
    const r = matchRanges.current[curIdx.current];
    if (!r) return;
    const sel = window.getSelection();
    ref.current.focus();
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand("insertText", false, replaceWith); // undoable
    // content changed -> persist + recompute
    const html = ref.current.innerHTML;
    lastHtml.current = html; lastWords.current = countWords(html); setWords(lastWords.current);
    scheduleSave(html);
    computeMatches();
    if (matchRanges.current.length) { stepMatch(0); }
  };

  const replaceAll = () => {
    const ranges = matchRanges.current.slice();
    if (!ranges.length) return;
    ref.current.focus();
    const sel = window.getSelection();
    // Apply from last to first so earlier ranges stay valid as we edit.
    for (let i = ranges.length - 1; i >= 0; i--) {
      sel.removeAllRanges();
      sel.addRange(ranges[i]);
      document.execCommand("insertText", false, replaceWith);
    }
    const html = ref.current.innerHTML;
    lastHtml.current = html; lastWords.current = countWords(html); setWords(lastWords.current);
    scheduleSave(html);
    curIdx.current = 0;
    computeMatches();
  };

  // Recompute when the query or options change while the bar is open.
  useEffect(() => {
    if (findOpen) { curIdx.current = 0; computeMatches(); scrollToCurrent(); }
  }, [query, matchCase, wholeWord, findOpen]);

  // Global Cmd/Ctrl+F: open find even when the caret isn't in the editor.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.code === "KeyF" || e.key === "f")) {
        e.preventDefault();
        openFind();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearHighlights(); };
  }, []);

  const onFindKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); stepMatch(e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape") { e.preventDefault(); closeFind(); }
  };

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
        <button className="rt-btn" title="Heading (⌘/Ctrl+Alt+2)" onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", inBlock("h2") ? "P" : "H2"); }}>H</button>
        <button className="rt-btn" title="Quote (⌘/Ctrl+Alt+Q)" onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", inBlock("blockquote") ? "P" : "BLOCKQUOTE"); }}>❝</button>
        <button className="rt-btn" title="Scene break (⌘/Ctrl+Enter)" onMouseDown={(e) => { e.preventDefault(); exec("insertHorizontalRule"); }}>#</button>
        <button className="rt-btn" title="Clear formatting (⌘/Ctrl+\)" onMouseDown={(e) => { e.preventDefault(); exec("removeFormat"); exec("formatBlock", "P"); }}>⌫</button>
        <span className="rt-sep" />
        <button className="rt-btn" title="Find & replace (⌘/Ctrl+F)" onMouseDown={(e) => { e.preventDefault(); openFind(); }}>🔍</button>
        <button className={`rt-btn ${smartOn ? "on" : ""}`} title={`Smart typography ${smartOn ? "on" : "off"} — curly quotes, em dashes, ellipses`} onMouseDown={(e) => { e.preventDefault(); toggleSmart(); }}>“”</button>
        <span className="rt-sep" />
        <button className="rt-btn wide" title="Move the selected text to Cuts" onMouseDown={(e) => { e.preventDefault(); stashSelection(); }}>✂ Stash</button>
      </div>

      {findOpen && (
        <div className="find-bar">
          <input
            ref={findInputRef}
            className="find-input"
            placeholder="Find"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onFindKeyDown}
          />
          <span className="find-count">{matchCount ? `${matchIdx}/${matchCount}` : (query ? "0/0" : "")}</span>
          <button className="rt-btn" title="Previous (⇧Enter)" disabled={!matchCount} onMouseDown={(e) => { e.preventDefault(); stepMatch(-1); }}>↑</button>
          <button className="rt-btn" title="Next (Enter)" disabled={!matchCount} onMouseDown={(e) => { e.preventDefault(); stepMatch(1); }}>↓</button>
          <button className={`rt-btn ${matchCase ? "on" : ""}`} title="Match case" onMouseDown={(e) => { e.preventDefault(); setMatchCase((v) => !v); }}>Aa</button>
          <button className={`rt-btn ${wholeWord ? "on" : ""}`} title="Whole word" onMouseDown={(e) => { e.preventDefault(); setWholeWord((v) => !v); }}>❝W❞</button>
          <span className="rt-sep" />
          <input
            className="find-input"
            placeholder="Replace with"
            value={replaceWith}
            onChange={(e) => setReplaceWith(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); replaceCurrent(); } else if (e.key === "Escape") { e.preventDefault(); closeFind(); } }}
          />
          <button className="rt-btn wide" disabled={!matchCount} onMouseDown={(e) => { e.preventDefault(); replaceCurrent(); }}>Replace</button>
          <button className="rt-btn wide" disabled={!matchCount} onMouseDown={(e) => { e.preventDefault(); replaceAll(); }}>All</button>
          <div className="spacer" />
          <button className="rt-btn" title="Close (Esc)" onMouseDown={(e) => { e.preventDefault(); closeFind(); }}>✕</button>
        </div>
      )}

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
