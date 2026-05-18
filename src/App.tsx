import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ball } from './components/Ball/Ball';
import { DogFollower } from './components/DogFollower/DogFollower';
import { SPRITE_CONFIG } from './components/DogFollower/config';
import { AnimationState, Direction, Position } from './components/DogFollower/types';
import { ThrowAim } from './components/ThrowAim/ThrowAim';

function clampBallPosition(position: Position): Position {
  const radius = BALL_RADIUS;
  const minY = window.innerHeight * 0.5;

  return {
    x: Math.max(radius, Math.min(position.x, window.innerWidth - radius)),
    y: Math.max(minY, Math.min(position.y, window.innerHeight - radius)),
  };
}

function clampPullPosition(start: Position, position: Position): Position {
  const maxPullDistance = 140;
  const dx = position.x - start.x;
  const dy = position.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance <= maxPullDistance) {
    return clampBallPosition(position);
  }

  return clampBallPosition({
    x: start.x + (dx / distance) * maxPullDistance,
    y: start.y + (dy / distance) * maxPullDistance,
  });
}

interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  bounceCount: number;
}

type FetchPhase = 'idle' | 'chasing' | 'pickup' | 'returning' | 'dropping';

const BALL_RADIUS = 14;
const GRAVITY = 0.72;
const THROW_POWER = 0.11;
const MAX_PREVIEW_STEPS = 96;
const AIR_DRAG = 0.992;
const SAND_ROLL_FRICTION = 0.91;
const FIRST_BOUNCE = 0.42;
const SECOND_BOUNCE = 0.2;
const FIRST_BOUNCE_ROLL_LOSS = 0.66;
const SECOND_BOUNCE_ROLL_LOSS = 0.46;
const PICKUP_DURATION_MS = 850;
const DROP_DURATION_MS = 750;
const SCENE_IMAGE_SIZE = { width: 1672, height: 941 };
const BLANKET_BALL_HOME = { x: 410, y: 790 };
const SAND_RETURN_HOME = { xRatio: 0.5, yRatio: 0.88 };
const PROP_BLOCKS = [
  { x: 80, y: 500, width: 310, height: 155 },
  { x: 135, y: 575, width: 165, height: 205 },
  { x: 270, y: 610, width: 215, height: 210 },
  { x: 175, y: 715, width: 165, height: 120 },
];
const DOG_PROP_CLEARANCE = 86;
const SPRITE_RENDER_SCALE = SPRITE_CONFIG.renderedWidth / SPRITE_CONFIG.frameWidth;
const SPRITE_BALL_POINT = {
  x: 106 * SPRITE_RENDER_SCALE,
  y: 112 * SPRITE_RENDER_SCALE,
};
const POST_DROP_GAP = 20;

interface PlannedDogTarget {
  position: Position;
  direction: Direction | null;
}

function getPickupDirection(ballPosition: Position, dogPosition: Position | null): Direction {
  if (!dogPosition) return 'right';
  const dogCenterX = dogPosition.x + SPRITE_CONFIG.renderedWidth / 2;
  return dogCenterX <= ballPosition.x ? 'right' : 'left';
}

function getDogTargetForBall(ballPosition: Position, dogPosition: Position | null): PlannedDogTarget {
  const direction = getPickupDirection(ballPosition, dogPosition);
  const originX = SPRITE_CONFIG.renderedWidth / 2;
  const originY = SPRITE_CONFIG.renderedHeight;
  const signedBallOffsetX =
    (SPRITE_BALL_POINT.x - originX) * (direction === 'right' ? 1 : -1);
  let targetY = ballPosition.y - SPRITE_CONFIG.renderedHeight * 0.75;

  for (let index = 0; index < 5; index += 1) {
    const topY = targetY - SPRITE_CONFIG.renderedHeight * 0.75;
    const scale = getDogPerspectiveScale(topY);
    targetY =
      ballPosition.y -
      SPRITE_CONFIG.renderedHeight * 0.25 -
      (SPRITE_BALL_POINT.y - originY) * scale;
  }

  const scale = getDogPerspectiveScale(targetY - SPRITE_CONFIG.renderedHeight * 0.75);

  return {
    direction,
    position: {
      x: ballPosition.x - signedBallOffsetX * scale,
      y: targetY,
    },
  };
}

function getDogPerspectiveScale(y: number): number {
  const minY = window.innerHeight * SPRITE_CONFIG.walkableTopRatio;
  const maxY = window.innerHeight - SPRITE_CONFIG.renderedHeight;
  const progress = Math.max(0, Math.min((y - minY) / (maxY - minY), 1));

  return 0.7 + progress * 0.3;
}

function getMouthPosition(position: Position, direction: Direction): Position {
  return clampBallPosition({
    x: position.x + (direction === 'right' ? 64 : 16),
    y: position.y + 44,
  });
}

function separateDroppedBallFromDog(
  ballPosition: Position,
  direction: Direction | null
): Position {
  if (!direction) return ballPosition;

  return avoidPropZone({
    x: ballPosition.x + (direction === 'right' ? POST_DROP_GAP : -POST_DROP_GAP),
    y: ballPosition.y,
  });
}

function createRestingBall(position: Position): BallState {
  return {
    x: position.x,
    y: position.y,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    bounceCount: 0,
  };
}

function getBallGroundPosition(ball: BallState): Position {
  return { x: ball.x, y: ball.y };
}

function getThrowVelocity(start: Position, current: Position) {
  const pullDistance = Math.sqrt(
    (start.x - current.x) * (start.x - current.x) +
      (start.y - current.y) * (start.y - current.y)
  );

  return {
    vx: (start.x - current.x) * THROW_POWER,
    vy: (start.y - current.y) * THROW_POWER,
    vz: Math.min(16, 6 + pullDistance * 0.07),
  };
}

function getPullStrength(start: Position, current: Position): number {
  const maxPullDistance = 140;
  const pullDistance = Math.sqrt(
    (start.x - current.x) * (start.x - current.x) +
      (start.y - current.y) * (start.y - current.y)
  );

  return Math.max(0, Math.min(pullDistance / maxPullDistance, 1));
}

function stepBallPhysics(ball: BallState): BallState {
  const minY = window.innerHeight * 0.5;
  let { x, y, z, vx, vy, vz, bounceCount } = ball;

  x += vx;
  y += vy;
  z += vz;
  vz -= GRAVITY;
  vx *= z > 0 ? AIR_DRAG : SAND_ROLL_FRICTION;
  vy *= z > 0 ? AIR_DRAG : SAND_ROLL_FRICTION;

  if (x < BALL_RADIUS || x > window.innerWidth - BALL_RADIUS) {
    x = Math.max(BALL_RADIUS, Math.min(x, window.innerWidth - BALL_RADIUS));
    vx *= -0.38;
  }

  if (y < minY || y > window.innerHeight - BALL_RADIUS) {
    y = Math.max(minY, Math.min(y, window.innerHeight - BALL_RADIUS));
    vy *= -0.28;
    vx *= 0.78;
  }

  if (z <= 0) {
    z = 0;

    if (vz < -1.2 && bounceCount < 2) {
      const bounceFactor = bounceCount === 0 ? FIRST_BOUNCE : SECOND_BOUNCE;
      const rollLoss = bounceCount === 0 ? FIRST_BOUNCE_ROLL_LOSS : SECOND_BOUNCE_ROLL_LOSS;
      vz = -vz * bounceFactor;
      vx *= rollLoss;
      vy *= rollLoss;
      bounceCount += 1;
    } else {
      vz = 0;
      vx *= SAND_ROLL_FRICTION;
      vy *= SAND_ROLL_FRICTION;
    }
  }

  if (z === 0) {
    const safePosition = avoidPropZone({ x, y });
    if (safePosition.x !== x || safePosition.y !== y) {
      x = safePosition.x;
      y = safePosition.y;
      vx *= -0.25;
      vy *= -0.25;
    }
  }

  return { x, y, z, vx, vy, vz, bounceCount };
}

function isBallStopped(ball: BallState): boolean {
  return Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) < 0.16 && ball.z === 0 && ball.vz === 0;
}

function getThrowPreview(start: Position, current: Position): Position[] {
  const velocity = getThrowVelocity(start, current);
  let previewBall: BallState = {
    x: current.x,
    y: current.y,
    z: 0,
    vx: velocity.vx,
    vy: velocity.vy,
    vz: velocity.vz,
    bounceCount: 0,
  };
  const points: Position[] = [];
  let hasLifted = false;

  for (let step = 0; step < MAX_PREVIEW_STEPS; step += 1) {
    previewBall = stepBallPhysics(previewBall);

    if (previewBall.z > 0) {
      hasLifted = true;
    }

    if (step % 5 === 0) {
      points.push({
        x: previewBall.x,
        y: previewBall.y - previewBall.z,
      });
    }

    if (hasLifted && previewBall.z === 0) break;
  }

  return points.slice(0, Math.max(2, Math.ceil(points.length * 0.6)));
}

function getScenePointPosition(point: Position): Position {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scale = Math.max(
    viewportWidth / SCENE_IMAGE_SIZE.width,
    viewportHeight / SCENE_IMAGE_SIZE.height
  );
  const renderedWidth = SCENE_IMAGE_SIZE.width * scale;
  const renderedHeight = SCENE_IMAGE_SIZE.height * scale;
  const offsetX = (viewportWidth - renderedWidth) / 2;
  const offsetY = viewportHeight - renderedHeight;

  return clampBallPosition({
    x: offsetX + point.x * scale,
    y: offsetY + point.y * scale,
  });
}

function getSandReturnPosition(): Position {
  return avoidPropZone({
    x: window.innerWidth * SAND_RETURN_HOME.xRatio,
    y: window.innerHeight * SAND_RETURN_HOME.yRatio,
  });
}

function getSceneRect(rect: { x: number; y: number; width: number; height: number }) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scale = Math.max(
    viewportWidth / SCENE_IMAGE_SIZE.width,
    viewportHeight / SCENE_IMAGE_SIZE.height
  );
  const renderedWidth = SCENE_IMAGE_SIZE.width * scale;
  const renderedHeight = SCENE_IMAGE_SIZE.height * scale;
  const offsetX = (viewportWidth - renderedWidth) / 2;
  const offsetY = viewportHeight - renderedHeight;

  return {
    left: offsetX + rect.x * scale,
    top: offsetY + rect.y * scale,
    right: offsetX + (rect.x + rect.width) * scale,
    bottom: offsetY + (rect.y + rect.height) * scale,
  };
}

function isInsideRect(position: Position, rect: ReturnType<typeof getSceneRect>): boolean {
  return (
    position.x >= rect.left &&
    position.x <= rect.right &&
    position.y >= rect.top &&
    position.y <= rect.bottom
  );
}

function inflateRect(rect: ReturnType<typeof getSceneRect>, amount: number) {
  return {
    left: rect.left - amount,
    top: rect.top - amount,
    right: rect.right + amount,
    bottom: rect.bottom + amount,
  };
}

function getPropRects() {
  return PROP_BLOCKS.map((rect) => getSceneRect(rect));
}

function getDogPropBlock() {
  const rects = getPropRects().map((rect) => inflateRect(rect, DOG_PROP_CLEARANCE));

  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

function getDogAnchor(position: Position): Position {
  return {
    x: position.x + SPRITE_CONFIG.renderedWidth / 2,
    y: position.y + SPRITE_CONFIG.renderedHeight * 0.75,
  };
}

function getDogPositionFromAnchor(anchor: Position): Position {
  return {
    x: anchor.x - SPRITE_CONFIG.renderedWidth / 2,
    y: anchor.y - SPRITE_CONFIG.renderedHeight * 0.75,
  };
}

function avoidDogPropZone(position: Position): Position {
  let safeAnchor = getDogAnchor(position);

  for (const blockedRect of getPropRects().map((rect) => inflateRect(rect, DOG_PROP_CLEARANCE))) {
    if (isInsideRect(safeAnchor, blockedRect)) {
      safeAnchor = pushOutsideRect(safeAnchor, blockedRect);
    }
  }

  return getDogPositionFromAnchor(safeAnchor);
}

function orientation(a: Position, b: Position, c: Position): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  return o1 * o2 < 0 && o3 * o4 < 0;
}

function lineCrossesRect(start: Position, end: Position, rect: ReturnType<typeof inflateRect>) {
  if (isInsideRect(start, rect) || isInsideRect(end, rect)) return true;

  const corners = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];

  return corners.some((corner, index) =>
    segmentsIntersect(start, end, corner, corners[(index + 1) % corners.length])
  );
}

function routeLength(points: Position[]): number {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    return total + Math.sqrt(dx * dx + dy * dy);
  }, 0);
}

function pathAvoidsRect(points: Position[], rect: ReturnType<typeof inflateRect>): boolean {
  return points
    .slice(1)
    .every((point, index) => !lineCrossesRect(points[index], point, rect));
}

function planDogRoute(start: Position, finalTarget: PlannedDogTarget): PlannedDogTarget[] {
  const block = getDogPropBlock();

  if (!lineCrossesRect(start, finalTarget.position, block)) {
    return [finalTarget];
  }

  const minY = window.innerHeight * SPRITE_CONFIG.walkableTopRatio + 24;
  const maxY = window.innerHeight - 24;
  const left = Math.max(24, block.left - 24);
  const right = Math.min(window.innerWidth - 24, block.right + 24);
  const top = Math.max(minY, block.top - 24);
  const bottom = Math.min(maxY, block.bottom + 24);
  const candidates = [
    [start, { x: right, y: start.y }, { x: right, y: finalTarget.position.y }, finalTarget.position],
    [start, { x: start.x, y: top }, { x: finalTarget.position.x, y: top }, finalTarget.position],
    [start, { x: start.x, y: bottom }, { x: finalTarget.position.x, y: bottom }, finalTarget.position],
    [start, { x: left, y: start.y }, { x: left, y: finalTarget.position.y }, finalTarget.position],
  ];
  const bestPath = candidates
    .filter((path) => pathAvoidsRect(path, block))
    .sort((a, b) => routeLength(a) - routeLength(b))[0];

  if (!bestPath) {
    return [finalTarget];
  }

  return bestPath.slice(1).map((position, index, path) => ({
    position,
    direction: index === path.length - 1 ? finalTarget.direction : null,
  }));
}

function pushOutsideRect(position: Position, rect: ReturnType<typeof getSceneRect>): Position {
  const distances = [
    { x: rect.left - BALL_RADIUS, y: position.y, distance: Math.abs(position.x - rect.left) },
    { x: rect.right + BALL_RADIUS, y: position.y, distance: Math.abs(position.x - rect.right) },
    { x: position.x, y: rect.top - BALL_RADIUS, distance: Math.abs(position.y - rect.top) },
    { x: position.x, y: rect.bottom + BALL_RADIUS, distance: Math.abs(position.y - rect.bottom) },
  ];
  const closest = distances.reduce((best, item) => (item.distance < best.distance ? item : best));

  return clampBallPosition({ x: closest.x, y: closest.y });
}

function avoidPropZone(position: Position): Position {
  let safePosition = clampBallPosition(position);

  for (const blockedRect of getPropRects()) {
    if (isInsideRect(safePosition, blockedRect)) {
      safePosition = pushOutsideRect(safePosition, blockedRect);
    }
  }

  return safePosition;
}

export function App() {
  const ballHome = useMemo<Position>(
    () => getScenePointPosition(BLANKET_BALL_HOME),
    []
  );
  const [ballState, setBallState] = useState<BallState>(() => createRestingBall(ballHome));
  const [aimPoint, setAimPoint] = useState<Position | null>(null);
  const [dogTarget, setDogTarget] = useState<Position | null>(null);
  const [dogTargetDirection, setDogTargetDirection] = useState<Direction | null>(null);
  const [fetchPhase, setFetchPhase] = useState<FetchPhase>('idle');
  const [isBallCarried, setIsBallCarried] = useState(false);
  const [dogSnapshot, setDogSnapshot] = useState<{
    position: Position;
    direction: Direction;
  } | null>(null);
  const ballStateRef = useRef<BallState>(createRestingBall(ballHome));
  const aimPointRef = useRef<Position | null>(null);
  const throwStartRef = useRef<Position>(ballHome);
  const returnPositionRef = useRef<Position>(ballHome);
  const dragOffsetRef = useRef<Position>({ x: 0, y: 0 });
  const animationFrameRef = useRef<number | null>(null);
  const fetchTimerRef = useRef<number | null>(null);
  const dogRouteRef = useRef<PlannedDogTarget[]>([]);
  const dogSnapshotRef = useRef<{
    position: Position;
    direction: Direction;
  } | null>(null);

  useEffect(() => {
    ballStateRef.current = ballState;
  }, [ballState]);

  useEffect(() => {
    aimPointRef.current = aimPoint;
  }, [aimPoint]);

  useEffect(() => {
    if (!isBallCarried || !dogSnapshot) return;
    const nextPosition = getMouthPosition(dogSnapshot.position, dogSnapshot.direction);
    const nextState = createRestingBall(nextPosition);
    ballStateRef.current = nextState;
    setBallState(nextState);
  }, [dogSnapshot, isBallCarried]);

  const clearFetchTimer = useCallback(() => {
    if (!fetchTimerRef.current) return;
    window.clearTimeout(fetchTimerRef.current);
    fetchTimerRef.current = null;
  }, []);

  const clearDogRoute = useCallback(() => {
    dogRouteRef.current = [];
  }, []);

  const sendDogToTarget = useCallback((finalTarget: PlannedDogTarget) => {
    const dogAnchor = dogSnapshotRef.current
      ? getDogAnchor(dogSnapshotRef.current.position)
      : finalTarget.position;
    const [firstTarget, ...remainingTargets] = planDogRoute(dogAnchor, finalTarget);

    dogRouteRef.current = remainingTargets;
    setDogTarget(firstTarget.position);
    setDogTargetDirection(firstTarget.direction);
  }, []);

  const handleDogArrive = useCallback(() => {
    const nextRouteTarget = dogRouteRef.current.shift();
    if (nextRouteTarget) {
      setDogTarget(nextRouteTarget.position);
      setDogTargetDirection(nextRouteTarget.direction);
      return;
    }

    if (fetchPhase === 'chasing') {
      clearFetchTimer();
      setFetchPhase('pickup');
      fetchTimerRef.current = window.setTimeout(() => {
        setIsBallCarried(true);
        setFetchPhase('returning');
        const returnPosition = getSandReturnPosition();
        const returnPlan = getDogTargetForBall(
          returnPosition,
          dogSnapshotRef.current?.position ?? null
        );
        returnPositionRef.current = returnPosition;
        sendDogToTarget(returnPlan);
        fetchTimerRef.current = null;
      }, PICKUP_DURATION_MS);
      return;
    }

    if (fetchPhase === 'returning') {
      clearFetchTimer();
      setFetchPhase('dropping');
      fetchTimerRef.current = window.setTimeout(() => {
        const dropPosition = separateDroppedBallFromDog(
          returnPositionRef.current,
          dogTargetDirection
        );
        const dropState = createRestingBall(dropPosition);
        ballStateRef.current = dropState;
        setBallState(dropState);
        setIsBallCarried(false);
        setFetchPhase('idle');
        setDogTarget(null);
        setDogTargetDirection(null);
        clearDogRoute();
        fetchTimerRef.current = null;
      }, DROP_DURATION_MS);
    }
  }, [clearDogRoute, clearFetchTimer, fetchPhase, sendDogToTarget]);

  const handleDogUpdate = useCallback((position: Position, direction: Direction) => {
    const nextSnapshot = { position, direction };
    dogSnapshotRef.current = nextSnapshot;
    setDogSnapshot(nextSnapshot);
  }, []);

  useEffect(() => {
    let isDragging = false;

    const stopFlight = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      ballStateRef.current = {
        ...ballStateRef.current,
        vx: 0,
        vy: 0,
        vz: 0,
      };
    };

    const animateThrow = () => {
      const nextState = stepBallPhysics(ballStateRef.current);
      ballStateRef.current = nextState;
      setBallState(nextState);

      if (isBallStopped(nextState)) {
        const stoppedPosition = { x: nextState.x, y: nextState.y };
        const chasePlan = getDogTargetForBall(
          stoppedPosition,
          dogSnapshotRef.current?.position ?? null
        );
        setFetchPhase('chasing');
        sendDogToTarget(chasePlan);
        ballStateRef.current = createRestingBall(stoppedPosition);
        animationFrameRef.current = null;
        return;
      }

      animationFrameRef.current = requestAnimationFrame(animateThrow);
    };

    const startThrow = (start: Position, current: Position) => {
      stopFlight();
      clearFetchTimer();
      clearDogRoute();
      setDogTarget(null);
      setDogTargetDirection(null);
      setIsBallCarried(false);
      setFetchPhase('idle');
      const throwVelocity = getThrowVelocity(start, current);
      ballStateRef.current = {
        ...ballStateRef.current,
        vx: throwVelocity.vx,
        vy: throwVelocity.vy,
        vz: throwVelocity.vz,
        bounceCount: 0,
      };
      animationFrameRef.current = requestAnimationFrame(animateThrow);
    };

    const startAim = (x: number, y: number) => {
      if (fetchPhase !== 'idle') return;

      const ballPosition = getBallGroundPosition(ballStateRef.current);
      const dx = x - ballPosition.x;
      const dy = y - ballPosition.y;
      const distanceFromBall = Math.sqrt(dx * dx + dy * dy);

      if (distanceFromBall > 28) return;

      stopFlight();
      clearFetchTimer();
      clearDogRoute();
      setDogTarget(null);
      setDogTargetDirection(null);
      setIsBallCarried(false);
      isDragging = true;
      throwStartRef.current = ballPosition;
      dragOffsetRef.current = {
        x: x - ballPosition.x,
        y: y - ballPosition.y,
      };
      setAimPoint(ballPosition);
    };

    const moveAim = (x: number, y: number) => {
      if (!isDragging) return;
      const nextPosition = avoidPropZone(
        clampPullPosition(throwStartRef.current, {
          x: x - dragOffsetRef.current.x,
          y: y - dragOffsetRef.current.y,
        })
      );
      const nextState = createRestingBall(nextPosition);
      ballStateRef.current = nextState;
      setBallState(nextState);
      setAimPoint(nextPosition);
    };

    const stopAim = () => {
      const currentAim = aimPointRef.current;
      if (isDragging && currentAim) {
        startThrow(throwStartRef.current, currentAim);
      }
      isDragging = false;
      setAimPoint(null);
    };

    const handlePointerDown = (event: PointerEvent) => {
      startAim(event.clientX, event.clientY);
    };

    const handlePointerMove = (event: PointerEvent) => {
      moveAim(event.clientX, event.clientY);
    };

    const handleMouseDown = (event: MouseEvent) => {
      startAim(event.clientX, event.clientY);
    };

    const handleMouseMove = (event: MouseEvent) => {
      moveAim(event.clientX, event.clientY);
    };

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      startAim(touch.clientX, touch.clientY);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      moveAim(touch.clientX, touch.clientY);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopAim);
    window.addEventListener('pointercancel', stopAim);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopAim);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', stopAim);
    window.addEventListener('touchcancel', stopAim);

    return () => {
      stopFlight();
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopAim);
      window.removeEventListener('pointercancel', stopAim);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopAim);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', stopAim);
      window.removeEventListener('touchcancel', stopAim);
    };
  }, [ballHome, clearDogRoute, clearFetchTimer, fetchPhase, sendDogToTarget]);

  useEffect(() => {
    return () => {
      clearFetchTimer();
    };
  }, [clearFetchTimer]);

  const dogAnimationOverride: AnimationState | null =
    fetchPhase === 'pickup'
      ? 'pickup'
      : fetchPhase === 'returning'
        ? 'carryWalking'
        : fetchPhase === 'dropping'
          ? 'dropping'
          : null;
  const shouldShowBall = !isBallCarried && fetchPhase !== 'pickup' && fetchPhase !== 'dropping';
  const isBallMoving = ballState.z > 0 || Math.abs(ballState.vz) > 0.01;

  return (
    <main className="stage" aria-label="Mello dog follower demo">
      {aimPoint && (
        <ThrowAim
          start={throwStartRef.current}
          current={aimPoint}
          points={getThrowPreview(throwStartRef.current, aimPoint)}
          strength={getPullStrength(throwStartRef.current, aimPoint)}
        />
      )}
      {shouldShowBall && (
        <Ball
          x={ballState.x}
          y={ballState.y - ballState.z}
          groundY={ballState.y}
          airHeight={ballState.z}
          isAiming={Boolean(aimPoint)}
          isInteractive={fetchPhase === 'idle' && !isBallCarried}
          isMoving={isBallMoving}
        />
      )}
      <DogFollower
        chaseTarget={dogTarget}
        chaseDirection={dogTargetDirection}
        constrainPosition={avoidDogPropZone}
        animationOverride={dogAnimationOverride}
        onChaseArrive={handleDogArrive}
        onDogUpdate={handleDogUpdate}
      />
    </main>
  );
}
