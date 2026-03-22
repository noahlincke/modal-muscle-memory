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
  currentChordPitchClasses: string[];
  visualizationMode: 'intervals' | 'chord_arrows';
}

export function CircleOfFifths({
  currentTonic,
  currentChordRoot,
  currentChordPitchClasses,
  visualizationMode,
}: CircleOfFifthsProps) {
  const center = 120;
  const outerRadius = 98;
  const intervalDotRadius = 78;
  const intervalTextRadius = 62;
  const arrowTipRadius = outerRadius - 14;

  const chordRoot = currentChordRoot ? normalizePitchClass(currentChordRoot) : null;
  const displayedRoots = rootsInFifthsOrderForTonic(currentTonic);
  const currentRootBorderColor = intervalColorForTonicAndRoot(currentTonic, currentChordRoot, '#f97316');
  const chordPitchClasses = [...new Set(currentChordPitchClasses.map((pitchClass) => normalizePitchClass(pitchClass)))];
  const tonicPitchClass = currentTonic ? normalizePitchClass(currentTonic) : null;

  const nodePositions = displayedRoots.reduce<Record<string, { x: number; y: number }>>((result, root, index) => {
    const angle = (-Math.PI / 2) + (index / displayedRoots.length) * Math.PI * 2;
    result[normalizePitchClass(root)] = {
      x: center + Math.cos(angle) * arrowTipRadius,
      y: center + Math.sin(angle) * arrowTipRadius,
    };
    return result;
  }, {});

  return (
    <section className="circle-panel">
      <svg viewBox="0 0 240 240" role="img" aria-label="Circle of fifths">
        {visualizationMode === 'chord_arrows'
          ? chordPitchClasses.map((pitchClass) => {
            const tip = nodePositions[pitchClass];
            if (!tip) {
              return null;
            }

            const isTonicArrow = tonicPitchClass === pitchClass;
            const dx = tip.x - center;
            const dy = tip.y - center;
            const length = Math.sqrt((dx * dx) + (dy * dy)) || 1;
            const ux = dx / length;
            const uy = dy / length;
            const headBaseX = tip.x - (ux * 10);
            const headBaseY = tip.y - (uy * 10);
            const perpX = -uy;
            const perpY = ux;
            const leftX = headBaseX + (perpX * 4);
            const leftY = headBaseY + (perpY * 4);
            const rightX = headBaseX - (perpX * 4);
            const rightY = headBaseY - (perpY * 4);

            return (
              <g key={`arrow:${pitchClass}`} className="circle-arrow-group">
                <line
                  x1={center}
                  y1={center}
                  x2={headBaseX}
                  y2={headBaseY}
                  className={`circle-arrow-shaft ${isTonicArrow ? 'is-tonic' : ''}`.trim()}
                  style={isTonicArrow ? { stroke: intervalColorForTonicAndRoot(currentTonic, currentTonic, '#4554df') } : undefined}
                />
                <path
                  d={`M ${leftX} ${leftY} L ${tip.x} ${tip.y} L ${rightX} ${rightY}`}
                  className={`circle-arrow-head ${isTonicArrow ? 'is-tonic' : ''}`.trim()}
                  style={isTonicArrow ? { stroke: intervalColorForTonicAndRoot(currentTonic, currentTonic, '#4554df') } : undefined}
                />
              </g>
            );
          })
          : null}
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
        {visualizationMode === 'intervals'
          ? CIRCLE_INTERVAL_LABELS_IN_FIFTHS_ORDER.map((label, index) => {
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
          })
          : null}
      </svg>
    </section>
  );
}
