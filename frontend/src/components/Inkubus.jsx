import React, { useState } from "react";

/**
 * Inkubus — the Draft Demon mascot. Two moods:
 *   "happy" — content little demon (you're on track / hit your goal)
 *   "angry" — furious flaming demon (you're behind, or clawing back past work)
 *
 * If you drop real artwork at  frontend/public/inkubus-happy.png  and
 * frontend/public/inkubus-angry.png , those are used automatically; otherwise
 * these built-in SVGs render so the app always has a mascot.
 */
const SRC = {
  angry: "/inkubus-angry.png",
  neutral: "/inkubus-neutral.png",
};

export default function Inkubus({ mood = "neutral", size = 96, className = "" }) {
  const [imgOk, setImgOk] = useState(true);
  // "happy" shares the neutral sprite — only "angry" has its own art.
  const resolved = mood === "angry" ? "angry" : "neutral";
  const src = SRC[resolved];

  if (imgOk) {
    return (
      <img
        className={`inkubus ${mood} ${className}`}
        src={src}
        width={size}
        height={size}
        alt={`Inkubus (${mood})`}
        onError={() => setImgOk(false)}
        style={{ objectFit: "contain" }}
      />
    );
  }
  return resolved === "angry"
    ? <AngrySVG size={size} className={className} />
    : <NeutralSVG size={size} className={className} />;
}

const Defs = () => (
  <defs>
    <linearGradient id="ink-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#ff9a4d" />
      <stop offset="0.55" stopColor="#f0531f" />
      <stop offset="1" stopColor="#c5230f" />
    </linearGradient>
    <linearGradient id="ink-horn" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fbd9a6" />
      <stop offset="1" stopColor="#9a4a1f" />
    </linearGradient>
    <linearGradient id="ink-quill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#ffe79a" />
      <stop offset="1" stopColor="#d8992c" />
    </linearGradient>
    <radialGradient id="ink-glow" cx="0.5" cy="0.45" r="0.6">
      <stop offset="0" stopColor="#ffd27a" stopOpacity="0.5" />
      <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
    </radialGradient>
    <linearGradient id="ink-flame" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stopColor="#ffd34d" />
      <stop offset="0.5" stopColor="#ff7a18" />
      <stop offset="1" stopColor="#e62a12" />
    </linearGradient>
  </defs>
);

// Shared head/horns/ears so both moods read as the same character.
const Head = () => (
  <g>
    {/* horns */}
    <path d="M50 40 C44 24 40 14 33 7 C40 16 41 28 46 40 Z" fill="url(#ink-horn)" stroke="#6e3417" strokeWidth="1.5" />
    <path d="M90 40 C96 24 100 14 107 7 C100 16 99 28 94 40 Z" fill="url(#ink-horn)" stroke="#6e3417" strokeWidth="1.5" />
    {/* ears */}
    <path d="M28 58 L13 50 L26 72 Z" fill="url(#ink-body)" stroke="#a51f0c" strokeWidth="1.5" />
    <path d="M112 58 L127 50 L114 72 Z" fill="url(#ink-body)" stroke="#a51f0c" strokeWidth="1.5" />
    {/* head */}
    <ellipse cx="70" cy="74" rx="43" ry="41" fill="url(#ink-body)" stroke="#a51f0c" strokeWidth="2" />
  </g>
);

function HappySVG({ size, className }) {
  return (
    <svg className={`inkubus happy ${className}`} width={size} height={size} viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
      <Defs />
      <circle cx="70" cy="72" r="60" fill="url(#ink-glow)" />
      {/* sparkles */}
      <g fill="#ffd86b">
        <path d="M24 36 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" />
        <path d="M116 34 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 Z" />
        <path d="M122 84 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 Z" />
      </g>
      {/* little crown */}
      <path d="M58 30 L64 38 L70 28 L76 38 L82 30 L80 42 L60 42 Z" fill="url(#ink-quill)" stroke="#b9821f" strokeWidth="1" />
      <Head />
      {/* happy closed eyes */}
      <path d="M50 70 q7 -9 14 0" fill="none" stroke="#5a1606" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M76 70 q7 -9 14 0" fill="none" stroke="#5a1606" strokeWidth="3.2" strokeLinecap="round" />
      {/* cheeks */}
      <circle cx="48" cy="84" r="6" fill="#ff5a3c" opacity="0.55" />
      <circle cx="92" cy="84" r="6" fill="#ff5a3c" opacity="0.55" />
      {/* big smile */}
      <path d="M55 86 q15 18 30 0 Z" fill="#7a160a" />
      <path d="M55 86 q15 18 30 0" fill="none" stroke="#5a1606" strokeWidth="2" />
      {/* fang */}
      <path d="M63 90 l3 6 3 -6 Z" fill="#fff" />
      {/* gold quill */}
      <g transform="rotate(24 108 96)">
        <path d="M108 60 C120 70 122 92 110 112 C104 98 104 76 108 60 Z" fill="url(#ink-quill)" stroke="#b9821f" strokeWidth="1.2" />
        <line x1="109" y1="66" x2="109" y2="108" stroke="#b9821f" strokeWidth="1" />
      </g>
    </svg>
  );
}

function AngrySVG({ size, className }) {
  return (
    <svg className={`inkubus angry ${className}`} width={size} height={size} viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
      <Defs />
      {/* flames behind */}
      <g opacity="0.95">
        <path d="M70 6 C84 24 80 30 88 40 C100 30 96 16 94 10 C108 26 112 44 104 60 L40 60 C30 44 34 26 46 12 C44 20 42 30 52 40 C60 30 56 22 70 6 Z" fill="url(#ink-flame)" />
      </g>
      <Head />
      {/* angry brows */}
      <path d="M46 60 L66 70" stroke="#5a1606" strokeWidth="5" strokeLinecap="round" />
      <path d="M94 60 L74 70" stroke="#5a1606" strokeWidth="5" strokeLinecap="round" />
      {/* glowing eyes */}
      <g>
        <ellipse cx="57" cy="74" rx="7" ry="5.5" fill="#ffe14d" />
        <ellipse cx="83" cy="74" rx="7" ry="5.5" fill="#ffe14d" />
        <circle cx="57" cy="74" r="2.4" fill="#7a160a" />
        <circle cx="83" cy="74" r="2.4" fill="#7a160a" />
      </g>
      {/* snarling mouth with fangs */}
      <path d="M52 92 q18 14 36 0 q-6 6 -18 6 q-12 0 -18 -6 Z" fill="#5a0f06" stroke="#3d0a04" strokeWidth="1.5" />
      <path d="M56 92 l4 9 4 -9 Z" fill="#fff" />
      <path d="M84 92 l-4 9 -4 -9 Z" fill="#fff" />
      {/* burnt quill */}
      <g transform="rotate(24 108 96)">
        <path d="M108 60 C120 70 122 92 110 112 C104 98 104 76 108 60 Z" fill="#3a2a22" stroke="#1c130e" strokeWidth="1.2" />
        <path d="M110 60 C116 66 118 78 114 90" fill="none" stroke="#ff7a18" strokeWidth="2" opacity="0.8" />
      </g>
    </svg>
  );
}

function NeutralSVG({ size, className }) {
  return (
    <svg className={`inkubus neutral ${className}`} width={size} height={size} viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
      <Defs />
      <circle cx="70" cy="72" r="60" fill="url(#ink-glow)" />
      <Head />
      {/* calm open eyes */}
      <circle cx="57" cy="72" r="4" fill="#5a1606" />
      <circle cx="83" cy="72" r="4" fill="#5a1606" />
      {/* small neutral mouth */}
      <path d="M60 90 q10 6 20 0" fill="none" stroke="#5a1606" strokeWidth="3" strokeLinecap="round" />
      {/* quill, upright */}
      <g transform="rotate(18 108 96)">
        <path d="M108 60 C120 70 122 92 110 112 C104 98 104 76 108 60 Z" fill="url(#ink-quill)" stroke="#b9821f" strokeWidth="1.2" />
        <line x1="109" y1="66" x2="109" y2="108" stroke="#b9821f" strokeWidth="1" />
      </g>
    </svg>
  );
}
