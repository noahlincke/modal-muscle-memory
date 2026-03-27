export type WalkthroughStep = 'exercise' | 'key' | 'content' | 'settings';

interface WalkthroughBubbleProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onSkip?: () => void;
  inline?: boolean;
  align?: 'center' | 'end';
}

export function WalkthroughBubble({
  message,
  actionLabel,
  onAction,
  onSkip,
  inline = false,
  align = 'center',
}: WalkthroughBubbleProps) {
  return (
    <div
      className={`walkthrough-bubble ${inline ? 'walkthrough-bubble-inline' : ''} walkthrough-bubble-${align}`.trim()}
      role="dialog"
      aria-live="polite"
      aria-label="New player walkthrough"
    >
      <p>{message}</p>
      {actionLabel || onSkip ? (
        <div className="walkthrough-bubble-actions">
          {onSkip ? (
            <button type="button" className="walkthrough-bubble-skip" onClick={onSkip}>
              Skip
            </button>
          ) : null}
          {actionLabel && onAction ? (
            <button type="button" className="primary walkthrough-bubble-action" onClick={onAction}>
              {actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
