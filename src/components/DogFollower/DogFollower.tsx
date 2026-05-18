import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import styles from './DogFollower.module.css';
import { SPRITE_CONFIG } from './config';
import { AnimationState, Direction, Position } from './types';
import { useDogState } from './useDogState';

function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function getScaledSpriteSize(): { width: number; height: number } {
  const {
    frameWidth,
    frameHeight,
    renderedWidth,
    renderedHeight,
    gutter,
    sheetColumns,
    sheetRows,
    frameInsetX,
  } = SPRITE_CONFIG;
  const visibleFrameWidth = frameWidth - frameInsetX * 2;
  const scaleX = renderedWidth / visibleFrameWidth;
  const scaleY = renderedHeight / frameHeight;
  const totalWidth = sheetColumns * frameWidth + (sheetColumns - 1) * gutter;
  const totalHeight = sheetRows * frameHeight + (sheetRows - 1) * gutter;

  return {
    width: totalWidth * scaleX,
    height: totalHeight * scaleY,
  };
}

function generateAnimationStyle(animation: AnimationState): CSSProperties {
  const config = SPRITE_CONFIG.animations[animation];
  const { frameWidth, frameHeight, renderedWidth, renderedHeight, gutter, frameInsetX } =
    SPRITE_CONFIG;
  const visibleFrameWidth = frameWidth - frameInsetX * 2;
  const scaleX = renderedWidth / visibleFrameWidth;
  const scaleY = renderedHeight / frameHeight;
  const yOffset = config.row * (frameHeight + gutter);
  const scaledYOffset = yOffset * scaleY;
  const scaledXInset = frameInsetX * scaleX;
  const spriteSize = getScaledSpriteSize();
  const iterationCount = config.loop ? 'infinite' : config.loopCount ?? 1;

  return {
    width: renderedWidth,
    height: renderedHeight,
    backgroundImage: `url(${SPRITE_CONFIG.spriteSheet})`,
    backgroundSize: `${spriteSize.width}px ${spriteSize.height}px`,
    backgroundPosition: `-${scaledXInset}px -${scaledYOffset}px`,
    animationName: `sprite-${animation}`,
    animationDuration: `${config.duration}s`,
    animationTimingFunction: `steps(${config.frames})`,
    animationIterationCount: iterationCount,
    animationDirection: config.direction ?? 'normal',
    animationFillMode: 'none',
  };
}

function getPerspectiveScale(y: number): number {
  const minY = window.innerHeight * SPRITE_CONFIG.walkableTopRatio;
  const maxY = window.innerHeight - SPRITE_CONFIG.renderedHeight;
  const progress = Math.max(0, Math.min((y - minY) / (maxY - minY), 1));

  return 0.7 + progress * 0.3;
}

interface DogFollowerProps {
  chaseTarget: Position | null;
  chaseDirection?: Direction | null;
  constrainPosition?: (position: Position) => Position;
  animationOverride?: AnimationState | null;
  onChaseArrive?: () => void;
  onDogUpdate?: (position: Position, direction: Direction) => void;
}

export function DogFollower({
  chaseTarget,
  chaseDirection = null,
  constrainPosition,
  animationOverride = null,
  onChaseArrive,
  onDogUpdate,
}: DogFollowerProps) {
  const { position, animation, direction, isVisible, onAnimationEnd } = useDogState(
    chaseTarget,
    onChaseArrive,
    chaseDirection,
    constrainPosition
  );
  const displayedAnimation = animationOverride ?? animation;
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setIsTouch(isTouchDevice());
  }, []);

  const keyframeStyles = useMemo(() => {
    const {
      frameWidth,
      frameHeight,
      renderedWidth,
      renderedHeight,
      gutter,
      animations,
      frameInsetX,
    } = SPRITE_CONFIG;
    const visibleFrameWidth = frameWidth - frameInsetX * 2;
    const scaleX = renderedWidth / visibleFrameWidth;
    const scaleY = renderedHeight / frameHeight;

    return Object.entries(animations)
      .map(([name, config]) => {
        const stepSize = frameWidth + gutter;
        const totalWidth = stepSize * config.frames;
        const scaledTotalWidth = totalWidth * scaleX;
        const scaledXInset = frameInsetX * scaleX;
        const yOffset = config.row * (frameHeight + gutter);
        const scaledYOffset = yOffset * scaleY;

        return `
          @keyframes sprite-${name} {
            from { background-position: -${scaledXInset}px -${scaledYOffset}px; }
            to { background-position: -${scaledTotalWidth + scaledXInset}px -${scaledYOffset}px; }
          }
        `;
      })
      .join('\n');
  }, []);

  useEffect(() => {
    onDogUpdate?.(position, direction);
  }, [direction, onDogUpdate, position]);

  if (reducedMotion || isTouch || !isVisible) {
    return null;
  }

  return (
    <>
      <style>{keyframeStyles}</style>
      <div
        className={styles.dog}
        style={{
          ...generateAnimationStyle(displayedAnimation),
          left: position.x,
          top: position.y,
          transform: `scaleX(${direction === 'left' ? -1 : 1}) scale(${getPerspectiveScale(
            position.y
          )})`,
        }}
        onAnimationEnd={onAnimationEnd}
        aria-hidden="true"
      />
    </>
  );
}
