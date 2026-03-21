interface ThemeToggleProps {
  theme: 'light' | 'dark' | 'focus';
  onToggle: () => void;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.6v2.3M12 19.1v2.3M21.4 12h-2.3M4.9 12H2.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.9 3.2a8.9 8.9 0 1 0 5.4 15.8 7.2 7.2 0 1 1-5.4-15.8Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}

function EclipseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M14.2 5.3a6.7 6.7 0 0 1 0 13.4 5.1 5.1 0 1 0 0-13.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'focus' : 'light';
  const currentIcon = theme === 'light'
    ? <MoonIcon />
    : theme === 'dark'
      ? <EclipseIcon />
      : <SunIcon />;
  const currentLabel = theme === 'light' ? 'light mode' : theme === 'dark' ? 'dark mode' : 'focus mode';
  const nextLabel = nextTheme === 'light' ? 'light mode' : nextTheme === 'dark' ? 'dark mode' : 'focus mode';

  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={`Current theme: ${currentLabel}. Switch to ${nextLabel}`}
      aria-pressed={theme !== 'light'}
      title={`Switch to ${nextLabel}`}
      onClick={onToggle}
    >
      {currentIcon}
    </button>
  );
}
