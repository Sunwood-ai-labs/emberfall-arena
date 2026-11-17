// Every tuning number and colour for Emberfall Arena in one place. The arena is a fixed
// 1280x720 logical field; the renderer scales it to the window, so no rule below depends on
// the screen size.

export const FIELD = { width: 1280, height: 720, margin: 26 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  speed: 305,
  maxHp: 5,
  fireInterval: 0.145,
  rapidInterval: 0.082,
  bulletSpeed: 660,
  bulletRadius: 4,
  bulletLife: 1.15,
  dashTime: 0.16,
  dashSpeed: 980,
  dashCooldown: 1.15,
  hurtInvulnerable: 1.25,
};

export const COMBO = { window: 3.0, perMultiplier: 5, maxMultiplier: 8 };

export const ENEMY = {
  drifter: { radius: 13, hp: 2, speed: 96, score: 20, contact: 1 },
  spitter: { radius: 15, hp: 3, speed: 72, score: 35, contact: 1, range: 265, orbInterval: 2.15, orbSpeed: 215 },
  splitter: { radius: 23, hp: 6, speed: 54, score: 50, contact: 1 },
  warden: { radius: 46, hp: 95, speed: 44, score: 1000, contact: 1 },
};

export const PICKUP = {
  radius: 12,
  life: 12,
  dropChance: 0.13,
  spreadSeconds: 12,
  rapidSeconds: 10,
  shieldSeconds: 15,
  magnetRange: 96,
  magnetSpeed: 340,
};

export const WAVE = { intermission: 2.2, spawnInterval: 0.62, bannerSeconds: 2.0 };

export const PALETTE = {
  backdrop: '#07060e',
  arenaTop: '#141126',
  arenaBottom: '#0b0918',
  grid: '#241d45',
  gridGlow: '#342a63',
  border: '#4b3a8f',
  player: '#39e6c3',
  playerCore: '#eafff8',
  bullet: '#ffd166',
  orb: '#ff5d8f',
  drifter: '#ff5d73',
  spitter: '#b388ff',
  splitter: '#ff9f43',
  warden: '#ff3860',
  wardenCore: '#ffe3ec',
  heart: '#ff5d73',
  spread: '#ffd166',
  rapid: '#39c2e6',
  shield: '#7ef0d4',
  heal: '#8dff6e',
  text: '#f2efff',
  muted: '#9a92c4',
  panel: '#171233',
  panelEdge: '#4b3a8f',
  combo: '#ffd166',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberfall-arena.best';
