import React, { useMemo, useState } from "react";

const fmt = (n) => (n ?? 0).toLocaleString();

function writingDays(deadline, dpw) {
  const a = new Date();
  const b = new Date(deadline + "T00:00");
  if (b <= a) return 0;
  const total = Math.round((b - a) / 86400000);
  return Math.max(1, Math.round(total * (dpw / 7)));
}

export default function GoalModal({ initial, isNew, currentWords = 0, dictionary = [], onAddWord, onRemoveWord, onSave, onClose }) {
  const [title, setTitle] = useState(initial.title);
  const [author, setAuthor] = useState(initial.author || "");
  const [target, setTarget] = useState(initial.target);
  const [deadline, setDeadline] = useState(initial.deadline);
  const [dpw, setDpw] = useState(initial.days_per_week);
  const [newWord, setNewWord] = useState("");

  const preview = useMemo(() => {
    const days = writingDays(deadline, dpw);
    const remaining = Math.max(0, Number(target) - (isNew ? 0 : currentWords));
    const daily = Math.max(50, Math.ceil(remaining / Math.max(1, days)));
    return { days, daily };
  }, [target, deadline, dpw, currentWords, isNew]);

  return (
    <div className="overlay" onClick={(e) => e.target.classList.contains("overlay") && onClose()}>
      <div className="modal">
        <h2>{isNew ? "New writing project" : "Project goal"}</h2>
        <p className="hint">
          Set the target and deadline. Draft Demon divides the work into a daily goal and re-balances
          it as you go.
        </p>
        <div className="two">
          <div className="field">
            <label>Project title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Author name</label>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="for the manuscript title page" />
          </div>
        </div>
        <div className="two">
          <div className="field">
            <label>Target word count</label>
            <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="field">
            <label>Draft deadline</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Writing days per week</label>
          <select value={dpw} onChange={(e) => setDpw(Number(e.target.value))}>
            {[3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>{n} days / week</option>
            ))}
          </select>
        </div>
        <div className="preview">
          That's about <b>{fmt(preview.daily)} words/day</b> across <b>{fmt(preview.days)}</b> writing
          days — roughly <b>{(preview.daily / 250).toFixed(1)} pages</b> a day.
        </div>

        {!isNew && (
          <div className="field">
            <label>Project dictionary ({dictionary.length})</label>
            <div className="dict-add">
              <input value={newWord} onChange={(e) => setNewWord(e.target.value)}
                placeholder="Add a word the spellchecker should accept"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddWord(newWord); setNewWord(""); } }} />
              <button type="button" onClick={() => { onAddWord(newWord); setNewWord(""); }}>＋</button>
            </div>
            <div className="dict-chips">
              {dictionary.length === 0 && <span className="empty">No custom words yet. Right-click a red-underlined word while writing to add it here.</span>}
              {dictionary.map((w) => (
                <span key={w} className="chip">{w}<button type="button" onClick={() => onRemoveWord(w)} title="Remove">✕</button></span>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn"
            onClick={() =>
              onSave({
                title: title || "Untitled",
                subtitle: initial.subtitle || "Novel",
                author: author.trim(),
                target: Number(target) || 50000,
                deadline,
                days_per_week: Number(dpw),
              })
            }
          >
            {isNew ? "Create project" : "Save goal"}
          </button>
        </div>
      </div>
    </div>
  );
}
