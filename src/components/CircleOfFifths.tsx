import { normalizePitchClass } from '../lib/theory/noteUtils';
import {
  CIRCLE_INTERVAL_COLORS_IN_FIFTHS_ORDER,
  CIRCLE_INTERVAL_LABELS_IN_FIFTHS_ORDER,
  intervalColorForTonicAndRoot,
  rootsInFifthsOrderForTonic,
} from '../lib/theory/intervalRing';

interface CircleOfFifthsProps {
  currentTonic: string | null;
  currentChordRoot: string | null;
}

export function CircleOfFifths({
  currentTonic,
  currentChordRoot,
}: CircleOfFifthsProps) {
  const center = 120;
  const outerRadius = 98;
  const intervalDotRadius = 78;
  const intervalTextRadius = 62;

  const chordRoot = currentChordRoot ? normalizePitchClass(currentChordRoot) : null;
  const displayedRoots = rootsInFifthsOrderForTonic(currentTonic);
  const currentRootBorderColor = intervalColorForTonicAndRoot(currentTonic, currentChordRoot, '#f97316');

  return (
    <section className="circle-panel">
      <svg viewBox="0 0 240 240" role="img" aria-label="Circle of fifths">
        <circle cx={center} cy={center} r={outerRadius} className="circle-shell" />
        <circle cx={center} cy={center} r={intervalDotRadius} className="circle-interval-shell" />
        {displayedRoots.map((root, index) => {
          const angle = (-Math.PI / 2) + (index / displayedRoots.length) * Math.PI * 2;
          const x = center + Math.cos(angle) * outerRadius;
          const y = center + Math.sin(angle) * outerRadius;
          const normalized = normalizePitchClass(root);
          const isCurrentRoot = chordRoot === normalized;

          const className = [
            'circle-node',
            isCurrentRoot ? 'is-current-root' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <g key={root}>
              <circle
                cx={x}
                cy={y}
                r="12"
                className={className}
                style={isCurrentRoot ? { stroke: currentRootBorderColor } : undefined}
              />
              <text x={x} y={y + 4} textAnchor="middle" className="circle-label">
                {root}
              </text>
            </g>
          );
        })}
        {CIRCLE_INTERVAL_LABELS_IN_FIFTHS_ORDER.map((label, index) => {
          const angle = (-Math.PI / 2) + (index / CIRCLE_INTERVAL_LABELS_IN_FIFTHS_ORDER.length) * Math.PI * 2;
          const dotX = center + Math.cos(angle) * intervalDotRadius;
          const dotY = center + Math.sin(angle) * intervalDotRadius;
          const textX = center + Math.cos(angle) * intervalTextRadius;
          const textY = center + Math.sin(angle) * intervalTextRadius;

          return (
            <g key={`interval-${label}`}>
              <circle cx={dotX} cy={dotY} r="4.8" className="interval-dot" style={{ fill: CIRCLE_INTERVAL_COLORS_IN_FIFTHS_ORDER[index] }} />
              <text x={textX} y={textY + 4} textAnchor="middle" className="interval-label">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
