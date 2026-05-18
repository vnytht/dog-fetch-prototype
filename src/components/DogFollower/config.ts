import { SpriteConfig } from './types';

export const SPRITE_CONFIG: SpriteConfig = {
  frameWidth: 128,
  frameHeight: 128,
  gutter: 0,
  renderedWidth: 133,
  renderedHeight: 133,
  sheetColumns: 6,
  sheetRows: 5,
  frameInsetX: 0,
  spriteSheet: '/sprites/brown-dog-final-normalized.png',
  animations: {
    walking: { row: 0, frames: 6, duration: 0.62, loop: true },
    sitting: { row: 1, frames: 6, duration: 1.8, loop: true },
    barking: { row: 2, frames: 6, duration: 1.6, loopCount: 3 },
    carryWalking: { row: 3, frames: 6, duration: 0.62, loop: true },
    pickup: { row: 4, frames: 6, duration: 0.85, loop: false },
    dropping: { row: 4, frames: 6, duration: 0.75, loop: false, direction: 'reverse' },
  },
  walkSpeed: 0.8,
  cursorOffset: { x: -12, y: 32 },
  idleThreshold: 500,
  maxSpeedMultiplier: 5,
  maxBoostClicks: 10,
  boostDecayInterval: 300,
  idleDeadZone: 50,
  walkableTopRatio: 0.5,
};

export const IDLE_ANIMATIONS: ('sitting' | 'barking')[] = ['sitting', 'barking'];
