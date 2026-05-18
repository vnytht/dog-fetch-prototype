import styles from './Ball.module.css';

interface BallProps {
  x: number;
  y: number;
  groundY: number;
  airHeight: number;
  isAiming: boolean;
  isInteractive: boolean;
  isMoving: boolean;
}

export function Ball({ x, y, groundY, airHeight, isAiming, isInteractive, isMoving }: BallProps) {
  const heightProgress = Math.min(airHeight / 120, 1);
  const shadowScale = 1 - heightProgress * 0.45;
  const shadowOpacity = 0.34 - heightProgress * 0.2;
  const ballScale = 1 - heightProgress * 0.06;

  return (
    <>
      <div
        className={styles.shadow}
        style={{
          left: x,
          top: groundY + 12,
          opacity: shadowOpacity,
          transform: `translate(-50%, -50%) scale(${shadowScale})`,
        }}
        aria-hidden="true"
      />
      <div
        className={`${styles.ball} ${isMoving ? styles.moving : ''} ${isAiming ? styles.aiming : ''} ${
          isInteractive ? styles.interactive : styles.locked
        }`}
        style={{
          left: x,
          top: y,
          transform: `translate(-50%, -50%) scale(${ballScale})`,
        }}
        aria-hidden="true"
      />
    </>
  );
}
