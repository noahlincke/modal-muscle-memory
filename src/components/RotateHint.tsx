export function RotateHint() {
  return (
    <div className="rotate-hint" role="status">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8" y="4" width="8" height="16" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4.2 13.5a8 8 0 0 1 1.9-6.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M6.6 4.6v2.8H3.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p>Rotate your phone to play</p>
    </div>
  );
}
