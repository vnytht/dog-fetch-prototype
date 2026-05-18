import { Position } from '../DogFollower/types';
import styles from './ThrowAim.module.css';

interface ThrowAimProps {
  start: Position;
  current: Position;
  points: Position[];
  strength: number;
}

export function ThrowAim({ start, current, points, strength }: ThrowAimProps) {
  const trailPoints = [current, ...points];
  const segments = trailPoints.slice(0, -1).map((point, index) => ({
    from: point,
    to: trailPoints[index + 1],
    opacity: 0.8 * (1 - index / Math.max(trailPoints.length - 2, 1)),
  }));
  const pullOpacity = 0.18 + strength * 0.28;
  const strokeWidth = 2.5 + strength * 2;

  return (
    <svg className={styles.aimLayer} aria-hidden="true">
      <line
        className={styles.pullLine}
        x1={start.x}
        y1={start.y}
        x2={current.x}
        y2={current.y}
        style={{ opacity: pullOpacity, strokeWidth }}
      />
      {segments.map((segment, index) => (
        <line
          className={styles.throwLine}
          key={`${segment.from.x}-${segment.from.y}-${index}`}
          x1={segment.from.x}
          y1={segment.from.y}
          x2={segment.to.x}
          y2={segment.to.y}
          style={{ opacity: segment.opacity, strokeWidth }}
        />
      ))}
    </svg>
  );
}
