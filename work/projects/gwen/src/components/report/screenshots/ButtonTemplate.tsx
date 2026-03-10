export function ButtonTemplate() {
  return (
    <g>
      {/* Browser chrome */}
      <rect x="0" y="0" width="400" height="28" fill="#1a1a1a" />
      <circle cx="14" cy="14" r="4" fill="#ef4444" opacity="0.6" />
      <circle cx="28" cy="14" r="4" fill="#eab308" opacity="0.6" />
      <circle cx="42" cy="14" r="4" fill="#22c55e" opacity="0.6" />
      <rect x="70" y="8" width="260" height="12" rx="6" fill="#2a2a2a" />

      {/* Page */}
      <rect x="0" y="28" width="400" height="222" fill="#111" />

      {/* Context: text above */}
      <rect x="40" y="48" width="320" height="7" rx="2" fill="#2a2a2a" />
      <rect x="40" y="62" width="300" height="7" rx="2" fill="#2a2a2a" />
      <rect x="40" y="76" width="260" height="7" rx="2" fill="#2a2a2a" />

      {/* Button group area */}
      <rect x="30" y="96" width="340" height="80" rx="8" fill="#161616" stroke="#2a2a2a" strokeWidth="1" />

      {/* Primary button */}
      <rect x="50" y="116" width="120" height="36" rx="8" fill="#3b82f6" opacity="0.7" />
      <rect x="74" y="130" width="72" height="8" rx="2" fill="#fff" opacity="0.7" />

      {/* Secondary button */}
      <rect x="186" y="116" width="120" height="36" rx="8" fill="none" stroke="#525252" strokeWidth="1.5" />
      <rect x="210" y="130" width="72" height="8" rx="2" fill="#525252" />

      {/* Context: text below */}
      <rect x="40" y="196" width="320" height="7" rx="2" fill="#2a2a2a" />
      <rect x="40" y="210" width="280" height="7" rx="2" fill="#2a2a2a" />
      <rect x="40" y="224" width="310" height="7" rx="2" fill="#2a2a2a" />
    </g>
  );
}
