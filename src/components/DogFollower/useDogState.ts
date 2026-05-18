import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimationState, Direction, Position } from './types';
import { SPRITE_CONFIG } from './config';

type PositionConstraint = (position: Position) => Position;

function clampToViewport(pos: Position, constrainPosition?: PositionConstraint): Position {
  const maxX = window.innerWidth - SPRITE_CONFIG.renderedWidth;
  const minY = window.innerHeight * SPRITE_CONFIG.walkableTopRatio;
  const maxY = window.innerHeight - SPRITE_CONFIG.renderedHeight;

  const clampedPosition = {
    x: Math.max(0, Math.min(pos.x, maxX)),
    y: Math.max(minY, Math.min(pos.y, maxY)),
  };

  if (!constrainPosition) {
    return clampedPosition;
  }

  const constrainedPosition = constrainPosition(clampedPosition);

  return {
    x: Math.max(0, Math.min(constrainedPosition.x, maxX)),
    y: Math.max(minY, Math.min(constrainedPosition.y, maxY)),
  };
}

function clampPositionOnly(pos: Position): Position {
  const maxX = window.innerWidth - SPRITE_CONFIG.renderedWidth;
  const minY = window.innerHeight * SPRITE_CONFIG.walkableTopRatio;
  const maxY = window.innerHeight - SPRITE_CONFIG.renderedHeight;

  return {
    x: Math.max(0, Math.min(pos.x, maxX)),
    y: Math.max(minY, Math.min(pos.y, maxY)),
  };
}

interface UseDogStateReturn {
  position: Position;
  animation: AnimationState;
  direction: Direction;
  isVisible: boolean;
  onAnimationEnd: () => void;
}

export function useDogState(
  chaseTarget: Position | null,
  onChaseArrive?: () => void,
  chaseDirection?: Direction | null,
  constrainPosition?: PositionConstraint
): UseDogStateReturn {
  const [position, setPosition] = useState<Position>(() => ({
    x: window.innerWidth - SPRITE_CONFIG.renderedWidth - 20,
    y: window.innerHeight * 0.72,
  }));
  const [targetPosition, setTargetPosition] = useState<Position>(position);
  const [animation, setAnimation] = useState<AnimationState>('sitting');
  const [direction, setDirection] = useState<Direction>('left');
  const [isIdle, setIsIdle] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [hasReachedTarget, setHasReachedTarget] = useState(true);
  const [boostLevel, setBoostLevel] = useState(0);

  const idleTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isPlayingIdleRef = useRef(false);
  const isHoldingSitRef = useRef(false);
  const boostDecayRef = useRef<number | null>(null);
  const positionRef = useRef(position);
  const previousChaseTargetRef = useRef<Position | null>(null);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const startSittingIdle = useCallback(() => {
    isPlayingIdleRef.current = false;
    isHoldingSitRef.current = true;
    setAnimation('sitting');
  }, []);

  const startPostFetchIdle = useCallback(() => {
    isPlayingIdleRef.current = true;
    isHoldingSitRef.current = false;
    setAnimation('barking');
  }, []);

  useEffect(() => {
    if (!chaseTarget) {
      if (previousChaseTargetRef.current) {
        setIsIdle(true);
        setHasReachedTarget(true);
        startPostFetchIdle();
        setBoostLevel(0);
      }

      previousChaseTargetRef.current = null;
      return;
    }

    const target = clampToViewport(
      {
        x: chaseTarget.x - SPRITE_CONFIG.renderedWidth / 2,
        y: chaseTarget.y - SPRITE_CONFIG.renderedHeight * 0.75,
      },
      constrainPosition
    );

    previousChaseTargetRef.current = chaseTarget;
    isPlayingIdleRef.current = false;
    isHoldingSitRef.current = false;
    setTargetPosition(target);
    setIsIdle(false);
    setHasReachedTarget(false);
    setAnimation('walking');
    setBoostLevel(0);
  }, [chaseTarget, constrainPosition, startPostFetchIdle]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (chaseTarget) return;

      const newTarget = clampToViewport(
        {
          x: event.clientX - SPRITE_CONFIG.cursorOffset.x,
          y: event.clientY - SPRITE_CONFIG.cursorOffset.y,
        },
        constrainPosition
      );

      if (isPlayingIdleRef.current || isHoldingSitRef.current) {
        const dx = newTarget.x - positionRef.current.x;
        const dy = newTarget.y - positionRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < SPRITE_CONFIG.idleDeadZone) {
          return;
        }

        isPlayingIdleRef.current = false;
        isHoldingSitRef.current = false;
        setAnimation('walking');
      }

      setTargetPosition(newTarget);
      setIsIdle(false);
      setHasReachedTarget(false);

      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }

      idleTimerRef.current = window.setTimeout(() => {
        setIsIdle(true);
      }, SPRITE_CONFIG.idleThreshold);
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
    };
  }, [chaseTarget, constrainPosition]);

  useEffect(() => {
    const handleLeave = () => setIsVisible(true);
    const handleEnter = () => setIsVisible(true);

    document.addEventListener('mouseleave', handleLeave);
    document.addEventListener('mouseenter', handleEnter);

    return () => {
      document.removeEventListener('mouseleave', handleLeave);
      document.removeEventListener('mouseenter', handleEnter);
    };
  }, []);

  useEffect(() => {
    const handleClick = () => {
      setBoostLevel((prev) => Math.min(prev + 1, SPRITE_CONFIG.maxBoostClicks));
    };

    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (boostLevel === 0) return;

    boostDecayRef.current = window.setTimeout(() => {
      setBoostLevel((prev) => Math.max(prev - 1, 0));
    }, SPRITE_CONFIG.boostDecayInterval);

    return () => {
      if (boostDecayRef.current) {
        window.clearTimeout(boostDecayRef.current);
      }
    };
  }, [boostLevel]);

  useEffect(() => {
    const boostRatio = boostLevel / SPRITE_CONFIG.maxBoostClicks;
    const speedMultiplier = 1 + boostRatio * (SPRITE_CONFIG.maxSpeedMultiplier - 1);
    const currentSpeed = SPRITE_CONFIG.walkSpeed * speedMultiplier;

    const updatePosition = () => {
      setPosition((currentPos) => {
        const dx = targetPosition.x - currentPos.x;
        const dy = targetPosition.y - currentPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < currentSpeed) {
          if (!hasReachedTarget) {
            setHasReachedTarget(true);
            setBoostLevel(0);
            if (!chaseTarget) {
              setIsIdle(true);
            }
            if (chaseDirection) {
              setDirection(chaseDirection);
            }

            if (chaseTarget) {
              onChaseArrive?.();
            }

            if (!chaseTarget && !chaseDirection && SPRITE_CONFIG.cursorOffset.x !== 0) {
              setDirection(SPRITE_CONFIG.cursorOffset.x < 0 ? 'left' : 'right');
            }
          }

          return clampPositionOnly(targetPosition);
        }

        if (Math.abs(dx) > 0.5) {
          setDirection(dx > 0 ? 'right' : 'left');
        }

        const ratio = currentSpeed / distance;

        return clampPositionOnly(
          {
            x: currentPos.x + dx * ratio,
            y: currentPos.y + dy * ratio,
          }
        );
      });

      animationFrameRef.current = requestAnimationFrame(updatePosition);
    };

    animationFrameRef.current = requestAnimationFrame(updatePosition);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    targetPosition,
    hasReachedTarget,
    boostLevel,
    chaseTarget,
    chaseDirection,
    constrainPosition,
    onChaseArrive,
  ]);

  useEffect(() => {
    if (!isIdle || !hasReachedTarget) {
      if (!isPlayingIdleRef.current && animation !== 'walking') {
        setAnimation('walking');
      }
      return;
    }

    if (!isPlayingIdleRef.current && !isHoldingSitRef.current) {
      startSittingIdle();
    }
  }, [isIdle, hasReachedTarget, animation, startSittingIdle]);

  const onAnimationEnd = useCallback(() => {
    if (!isPlayingIdleRef.current) return;

    if (isIdle && hasReachedTarget) {
      startSittingIdle();
    } else {
      isPlayingIdleRef.current = false;
      isHoldingSitRef.current = false;
      setAnimation('walking');
    }
  }, [isIdle, hasReachedTarget, startSittingIdle]);

  return {
    position,
    animation,
    direction,
    isVisible,
    onAnimationEnd,
  };
}
