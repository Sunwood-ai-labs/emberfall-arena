// The screenshot scenes behind ?shot=title|play|boss|over. Each one plays the real rules
// forward from a fresh world, steered by a small autopilot, so the frame is what a short
// game really looks like and the same seed always gives the same frame. The boss scene
// jumps the world to wave 5 and stages the Warden at half health, then plays on for a few
// seconds so the bullets, orbs and boss bar in frame are all live.

import { FIELD, STEP } from './config.js';
import { EVENT_OVER, KIND_WARDEN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function nearestEnemy(state) {
  let best = null;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    const d = (enemy.x - state.player.x) ** 2 + (enemy.y - state.player.y) ** 2;
    if (d < bestDistance) { bestDistance = d; best = enemy; }
  }
  return { enemy: best, distance: Math.sqrt(bestDistance) };
}

function nearestOrbDistance(state) {
  let best = Infinity;
  for (const orb of state.orbs) {
    if (!orb.active) continue;
    const d = Math.hypot(orb.x - state.player.x, orb.y - state.player.y);
    if (d < best) best = d;
  }
  return best;
}

/** A competent keeper: kite the nearest shadow, strafe, dash out of trouble, always firing. */
function pilotControl(state) {
  const { enemy, distance } = nearestEnemy(state);
  const player = state.player;
  let moveX = 0;
  let moveY = 0;
  let aimX = player.x + Math.cos(player.aim) * 100;
  let aimY = player.y + Math.sin(player.aim) * 100;
  if (enemy !== null) {
    const lead = Math.min(0.35, distance / 660);
    aimX = enemy.x + enemy.vx * lead;
    aimY = enemy.y + enemy.vy * lead;
    const awayX = (player.x - enemy.x) / Math.max(1, distance);
    const awayY = (player.y - enemy.y) / Math.max(1, distance);
    if (distance < 215) { moveX = awayX; moveY = awayY; }
    else if (distance > 330) { moveX = -awayX; moveY = -awayY; }
    else { moveX = -awayY * 0.8; moveY = awayX * 0.8; }
    // Drift back inside when kiting pushes the keeper against a wall.
    if (player.x < 130) moveX += 0.9;
    if (player.x > FIELD.width - 130) moveX -= 0.9;
    if (player.y < 130) moveY += 0.9;
    if (player.y > FIELD.height - 130) moveY -= 0.9;
  }
  const dash = (distance < 105 || nearestOrbDistance(state) < 52) && player.dashCooldown <= 0;
  return { moveX, moveY, aimX, aimY, firing: enemy !== null, dash };
}

/** A hurried keeper: walks at the nearest shadow and barely shoots. It does not last long. */
function recklessControl(state) {
  const { enemy } = nearestEnemy(state);
  const player = state.player;
  if (enemy === null) return { moveX: 0, moveY: 0, aimX: player.x + 80, aimY: player.y, firing: false, dash: false };
  const d = Math.max(1, Math.hypot(enemy.x - player.x, enemy.y - player.y));
  return {
    moveX: (enemy.x - player.x) / d,
    moveY: (enemy.y - player.y) / d,
    aimX: enemy.x,
    aimY: enemy.y,
    firing: state.elapsed % 1.4 < 0.3,
    dash: false,
  };
}

function playUntil(world, controlFor, seconds, stopOnOver = true) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(STEP, controlFor(world.state));
    if (stopOnOver && (events & EVENT_OVER)) return true;
  }
  return world.state.player.hp <= 0;
}

/**
 * Set `world` to the named scene (title, play, boss or over; any other name is title) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  if (name === 'play') {
    world.reset();
    playUntil(world, pilotControl, 26);
    if (state.player.hp <= 0) {
      // The pilot had a bad seed: play a shorter, safer stretch so the frame is mid-fight.
      world.reset();
      playUntil(world, pilotControl, 14);
      state.player.hp = Math.max(3, state.player.hp);
    }
    // The frame must be mid-fight, never the quiet second between waves: if the pilot has
    // cleared the arena, send in a fresh mixed pack and play on just long enough for
    // bullets and orbs to be in the air.
    const active = state.enemies.filter((enemy) => enemy.active).length;
    if (active < 5) {
      state.phase = 'fighting';
      state.spawnQueue = [];
      world.spawnEnemy('drifter', 150, 140);
      world.spawnEnemy('drifter', 1130, 160);
      world.spawnEnemy('spitter', 1080, 560);
      world.spawnEnemy('splitter', 190, 570);
      world.spawnEnemy('drifter', 640, 110);
      playUntil(world, pilotControl, 0.9, false);
    }
    state.bannerTimer = 0;
    state.shake = 0;
    return { screen: SCREEN_PLAY, best: Math.max(state.score, 500) };
  }
  if (name === 'boss') {
    world.reset();
    state.wave = 5;
    state.phase = 'fighting';
    state.spawnQueue = [];
    state.score = 2840;
    state.kills = 47;
    state.combo = 6;
    state.comboTimer = 2.4;
    state.player.hp = 4;
    const warden = world.spawnEnemy(KIND_WARDEN, 830, 315);
    if (warden !== null) warden.hp = Math.floor(warden.maxHp * 0.8);
    world.spawnEnemy('drifter', 1010, 470);
    world.spawnEnemy('spitter', 240, 170);
    playUntil(world, pilotControl, 1.8, false);
    if (state.boss === null || !state.boss.active) {
      const again = world.spawnEnemy(KIND_WARDEN, 880, 220);
      if (again !== null) again.hp = Math.floor(again.maxHp * 0.6);
      state.phase = 'fighting';
      state.spawnQueue = [];
    }
    if (state.enemies.filter((enemy) => enemy.active).length < 3) {
      world.spawnEnemy('drifter', 1080, 520);
      world.spawnEnemy('drifter', 180, 540);
      playUntil(world, pilotControl, 0.5, false);
    }
    // The Warden's signature is its radial orb burst: end on one, mid-flight in frame.
    if (state.boss !== null && state.boss.active) {
      state.boss.burstTimer = 0.01;
      playUntil(world, pilotControl, 0.45, false);
    }
    // No hit-flash in the still: every shadow shows its true colour.
    for (const enemy of state.enemies) enemy.flash = 0;
    state.player.hp = Math.max(3, state.player.hp);
    state.banner = '';
    state.bannerTimer = 0;
    state.shake = 0;
    return { screen: SCREEN_PLAY, best: Math.max(state.score, 2840) };
  }
  if (name === 'over') {
    // A real run's arc: the pilot plays well for a stretch, then the keeper is overwhelmed
    // and stops firing back — so the results panel carries a score worth showing.
    world.reset();
    playUntil(world, pilotControl, 38);
    const died = playUntil(world, recklessControl, 75);
    if (!died) {
      // Even an overwhelmed keeper can get lucky: finish the story the scene shows.
      state.player.hp = 0;
      state.score = Math.max(state.score, 1240);
      state.kills = Math.max(state.kills, 23);
    }
    return { screen: SCREEN_OVER, best: state.score };
  }
  // Title: first play one real run (well, then badly), so the best score on the panel is a
  // score this staging earned, then reset and let the demo shadows drift behind the panel.
  world.reset();
  playUntil(world, pilotControl, 30);
  playUntil(world, recklessControl, 75);
  const earnedBest = state.score;
  world.reset();
  for (let i = 0; i < Math.floor(3 / STEP); i += 1) world.demoStep(STEP);
  return { screen: SCREEN_TITLE, best: earnedBest };
}
