import React from "react";
import Inkubus from "./Inkubus.jsx";

const fmt = (n) => (n ?? 0).toLocaleString();

export function moodFor(st) {
  return st.in_deficit || st.pace < 0 ? "angry" : "happy";
}

function inkubusLine(st) {
  if (st.in_deficit) return "You're unwriting the book! Inkubus is FURIOUS.";
  if (st.remaining === 0) return "The draft is DONE. Inkubus bows to you.";
  if (st.day_pct >= 100) return "Goal smashed. Inkubus is delighted.";
  if (st.pace < 0) return "Behind pace — Inkubus is getting restless…";
  return "On track. Keep the streak alive!";
}

export default function GoalsPanel({ project, onEditGoal, onToggleMilestone }) {
  const st = project.state;
  const lvl = st.level;
  const circ = 2 * Math.PI * 65;
  const off = circ * (1 - st.day_pct / 100);
  const mood = moodFor(st);

  const paceTxt = st.in_deficit
    ? `⚠️ ${fmt(st.cut_debt)} words below your locked total`
    : st.remaining === 0
    ? "🎉 Target reached"
    : st.pace >= 0
    ? `${fmt(st.pace)} words ahead of pace`
    : `${fmt(-st.pace)} words behind pace`;
  const paceColor = st.in_deficit || st.pace < 0 ? "var(--warn)" : "var(--good)";

  return (
    <div className="col goals">
      <div className="gsec">
        <div className={`mascot ${mood}`}>
          <div className="frame"><Inkubus mood={mood} size={104} /></div>
          <div className="say">{inkubusLine(st)}</div>
        </div>
      </div>

      <div className="gsec today">
        <h3>Today's Goal</h3>
        <div className="ring-wrap">
          <svg width="150" height="150">
            <circle cx="75" cy="75" r="65" fill="none" stroke="var(--ring)" strokeWidth="12" />
            <circle
              cx="75" cy="75" r="65" fill="none" stroke="var(--accent)" strokeWidth="12"
              strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off}
              transform="rotate(-90 75 75)" style={{ transition: "stroke-dashoffset .5s" }}
            />
          </svg>
          <div className="ring-num">
            <div className="big">{fmt(st.wrote_today)}</div>
            <div className="lbl">of {fmt(st.daily_goal)} words</div>
          </div>
        </div>
        <div className="task">
          <div className="k">Focus · {st.phase_name}</div>
          <div className="v">{st.task}</div>
        </div>
        <div className="sub" style={{ color: paceColor }}>{paceTxt}</div>
      </div>

      <div className="gsec">
        <h3>Momentum</h3>
        <div className="stats">
          <div className="stat"><div className="n flame">{project.streak}🔥</div><div className="l">Day streak</div></div>
          <div className="stat"><div className="n xp">Lv {lvl.level}</div><div className="l">{fmt(project.xp)} XP</div></div>
          <div className="stat"><div className="n">{st.overall_pct}%</div><div className="l">Manuscript</div></div>
          <div className="stat"><div className="n">{fmt(st.days_left)}</div><div className="l">Writing days left</div></div>
        </div>
        <div className="levelbar"><i style={{ width: `${Math.round((lvl.into / lvl.need) * 100)}%` }} /></div>
        <div className="levelrow">
          <span>Level {lvl.level}</span>
          <span>{fmt(lvl.into)}/{fmt(lvl.need)} to Lv {lvl.level + 1}</span>
        </div>
      </div>

      <div className="gsec">
        <h3>Milestones</h3>
        {project.phases.map((ph, i) => {
          const done = i < st.phase_idx || project.milestones_done[String(i)];
          const cur = i === st.phase_idx && !done;
          const range = ph.end != null && ph.end > 0 ? `to ${Math.round(ph.end * 100)}%` : "kickoff";
          return (
            <div key={i} className={`ms ${done ? "done" : ""} ${cur ? "cur" : ""}`}
                 onClick={() => onToggleMilestone(i, !done)}>
              <div className="box">✓</div>
              <div><div className="mt">{ph.name}</div><div className="mr">{range}</div></div>
            </div>
          );
        })}
      </div>

      <div className="gsec">
        <h3>Badges</h3>
        <div className="badges">
          {project.badge_defs.map((b) => (
            <div key={b.id} className={`badge ${project.badges[b.id] ? "earned" : ""}`} title={b.name}>
              {b.icon}
            </div>
          ))}
        </div>
      </div>

      <div className="gsec">
        <button className="btn ghost" onClick={onEditGoal}>Edit project goal</button>
      </div>
    </div>
  );
}
