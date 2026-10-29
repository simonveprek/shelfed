/** Shelfed's mark: two plain spines and the one you're reading, leaning, in the aurora. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id="mark-aurora" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b4bff" />
          <stop offset="0.33" stopColor="#a23bff" />
          <stop offset="0.67" stopColor="#ff2d55" />
          <stop offset="1" stopColor="#ffb020" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="3" width="7" height="26" rx="3" fill="currentColor" />
      <rect x="11.5" y="8" width="7" height="21" rx="3" fill="currentColor" />
      <rect x="23.7" y="10" width="7" height="19" rx="3" fill="url(#mark-aurora)" transform="rotate(-16 23.7 29)" />
    </svg>
  );
}
