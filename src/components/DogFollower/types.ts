export type AnimationState =
  | 'walking'
  | 'sitting'
  | 'barking'
  | 'pickup'
  | 'carryWalking'
  | 'dropping';
export type Direction = 'left' | 'right';

export interface Position {
  x: number;
  y: number;
}

export interface AnimationConfig {
  row: number;
  frames: number;
  duration: number;
  loop?: boolean;
  loopCount?: number;
  direction?: 'normal' | 'reverse';
}

export interface SpriteConfig {
  frameWidth: number;
  frameHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  sheetColumns: number;
  sheetRows: number;
  frameInsetX: number;
  gutter: number;
  spriteSheet: string;
  animations: Record<AnimationState, AnimationConfig>;
  walkSpeed: number;
  cursorOffset: Position;
  idleThreshold: number;
  maxSpeedMultiplier: number;
  maxBoostClicks: number;
  boostDecayInterval: number;
  idleDeadZone: number;
  walkableTopRatio: number;
}
