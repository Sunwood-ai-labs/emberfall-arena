// The rules and state of Emberfall Arena, with no drawing and no browser in it: the lantern
// keeper, pooled bullets, shadow enemies, enemy orbs, pickups, waves, the combo meter and
// the Umbral Warden boss. step() advances one fixed step and returns what happened as bit
// flags, so the caller can play sounds and announce screens without the world knowing
// about either. Nothing here allocates after createWorld returns, apart from wave setup.

import { COMBO, ENEMY, FIELD, PICKUP, PLAYER, WAVE } from './config.js';
import { createParticles } from './particles.js';

export const KIND_DRIFTER = 'drifter';
export const KIND_SPITTER = 'spitter';
export const KIND_SPLITTER = 'splitter';
export const KIND_WARDEN = 'warden';

export const PICKUP_SPREAD = 'spread';
export const PICKUP_RAPID = 'rapid';
export const PICKUP_SHIELD = 'shield';
export const PICKUP_HEAL = 'heal';

export const EVENT_SHOOT = 1;
export const EVENT_ENEMY_HIT = 2;
export const EVENT_EXPLOSION = 4;
export const EVENT_HURT = 8;
export const EVENT_PICKUP = 16;
export const EVENT_DASH = 32;
export const EVENT_WAVE = 64;
export const EVENT_BOSS = 128;
export const EVENT_OVER = 256;
export const EVENT_SHIELD_BREAK = 512;
export const EVENT_BIG_EXPLOSION = 1024;

const MAX_ENEMIES = 52;
const MAX_BULLETS = 160;
const MAX_ORBS = 90;
const MAX_PICKUPS = 14;
const MAX_FLOATERS = 20;
const TAU = Math.PI * 2;

function makePool(count, make) {
  const pool = [];
  for (let i = 0; i < count; i += 1) pool.push(make());
  return pool;
}

function freeOf(pool) {
  for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
  return null;
}

function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** The wave's spawn list, as kind names: more shadows, new kinds, and a Warden every 5th. */
export function waveComposition(wave) {
  const list = [];
  const bossWave = wave % 5 === 0;
  const drifters = bossWave ? 4 : 4 + wave * 2;
  const spitters = wave >= 2 ? Math.min(8, wave - 1) : 0;
  const splitters = wave >= 3 ? Math.min(6, wave - 2) : 0;
  for (let i = 0; i < drifters; i += 1) list.push(KIND_DRIFTER);
  for (let i = 0; i < spitters; i += 1) list.push(KIND_SPITTER);
  for (let i = 0; i < splitters; i += 1) list.push(KIND_SPLITTER);
  if (bossWave) list.push(KIND_WARDEN);
  return list;
}

export function createWorld(random) {
  const particles = createParticles(random);
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, radius: PLAYER.radius, aim: -Math.PI / 2,
    hp: PLAYER.maxHp, fireTimer: 0, dashTimer: 0, dashCooldown: 0, dashDirX: 1, dashDirY: 0,
    invulnerable: 0, spreadTimer: 0, rapidTimer: 0, shieldTimer: 0, trailTimer: 0,
  };
  const enemies = makePool(MAX_ENEMIES, () => ({
    active: false, kind: KIND_DRIFTER, x: 0, y: 0, vx: 0, vy: 0, radius: 13, hp: 2, maxHp: 2,
    speed: 90, fireTimer: 0, burstTimer: 0, spawnTimer: 0, wobble: 0, flash: 0, angle: 0,
  }));
  const bullets = makePool(MAX_BULLETS, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
  const orbs = makePool(MAX_ORBS, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
  const pickups = makePool(MAX_PICKUPS, () => ({ active: false, kind: PICKUP_SPREAD, x: 0, y: 0, life: 0, bob: 0 }));
  const floaters = makePool(MAX_FLOATERS, () => ({ active: false, x: 0, y: 0, life: 0, text: '', color: '#ffd166' }));
  const trail = makePool(14, () => ({ active: false, x: 0, y: 0, life: 0 }));

  const state = {
    player, enemies, bullets, orbs, pickups, floaters, trail, particles: particles.pool,
    score: 0, kills: 0, combo: 0, comboTimer: 0, bestCombo: 0, wave: 0, elapsed: 0,
    phase: 'intermission', phaseTimer: 1.2, spawnQueue: [], spawnTimer: 0,
    banner: '', bannerTimer: 0, shake: 0, hitStop: 0, boss: null, emberTimer: 0,
  };

  function comboMultiplier() {
    return Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo / COMBO.perMultiplier));
  }

  function addFloater(x, y, text, color) {
    const floater = freeOf(floaters);
    if (floater === null) return;
    floater.active = true;
    floater.x = x;
    floater.y = y;
    floater.life = 0.9;
    floater.text = text;
    floater.color = color;
  }

  function spawnEnemy(kind, x, y) {
    const enemy = freeOf(enemies);
    if (enemy === null) return null;
    const spec = ENEMY[kind];
    enemy.active = true;
    enemy.kind = kind;
    enemy.x = x;
    enemy.y = y;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.radius = spec.radius;
    enemy.maxHp = kind === KIND_WARDEN ? spec.hp + state.wave * 6 : spec.hp;
    enemy.hp = enemy.maxHp;
    enemy.speed = spec.speed + Math.min(46, state.wave * 3.5) + random() * 12;
    enemy.fireTimer = 1 + random() * 1.4;
    enemy.burstTimer = 2.6;
    enemy.spawnTimer = kind === KIND_WARDEN ? 5.2 : 0;
    enemy.wobble = random() * TAU;
    enemy.flash = 0;
    enemy.angle = random() * TAU;
    if (kind === KIND_WARDEN) state.boss = enemy;
    return enemy;
  }

  function spawnFromEdge(kind) {
    // Spawn on an arena edge at least 240px from the keeper, so nothing lands on the player.
    let x = FIELD.margin;
    let y = FIELD.margin;
    for (let tries = 0; tries < 8; tries += 1) {
      const side = Math.floor(random() * 4);
      if (side === 0) { x = FIELD.margin + random() * (FIELD.width - FIELD.margin * 2); y = FIELD.margin + 8; }
      else if (side === 1) { x = FIELD.margin + random() * (FIELD.width - FIELD.margin * 2); y = FIELD.height - FIELD.margin - 8; }
      else if (side === 2) { x = FIELD.margin + 8; y = FIELD.margin + random() * (FIELD.height - FIELD.margin * 2); }
      else { x = FIELD.width - FIELD.margin - 8; y = FIELD.margin + random() * (FIELD.height - FIELD.margin * 2); }
      if (distanceSquared(x, y, player.x, player.y) > 240 * 240) break;
    }
    return spawnEnemy(kind, x, y);
  }

  function beginWave(wave) {
    state.wave = wave;
    state.spawnQueue = waveComposition(wave);
    // Shuffle the queue so kinds arrive mixed, with the Warden always last.
    const warden = state.spawnQueue.filter((kind) => kind === KIND_WARDEN);
    const rest = state.spawnQueue.filter((kind) => kind !== KIND_WARDEN);
    for (let i = rest.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const swap = rest[i];
      rest[i] = rest[j];
      rest[j] = swap;
    }
    state.spawnQueue = rest.concat(warden);
    state.spawnTimer = 0.4;
    state.phase = 'fighting';
    state.banner = wave % 5 === 0 ? `Wave ${wave} — the Umbral Warden` : `Wave ${wave}`;
    state.bannerTimer = WAVE.bannerSeconds;
    return wave % 5 === 0 ? EVENT_BOSS | EVENT_WAVE : EVENT_WAVE;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.hp = PLAYER.maxHp;
    player.fireTimer = 0;
    player.dashTimer = 0;
    player.dashCooldown = 0;
    player.invulnerable = 0;
    player.spreadTimer = 0;
    player.rapidTimer = 0;
    player.shieldTimer = 0;
    for (const pool of [enemies, bullets, orbs, pickups, floaters, trail]) {
      for (const item of pool) item.active = false;
    }
    state.score = 0;
    state.kills = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.bestCombo = 0;
    state.wave = 0;
    state.elapsed = 0;
    state.phase = 'intermission';
    state.phaseTimer = 1.1;
    state.spawnQueue = [];
    state.banner = '';
    state.bannerTimer = 0;
    state.shake = 0;
    state.hitStop = 0;
    state.boss = null;
  }

  function fireBullet(angle) {
    const bullet = freeOf(bullets);
    if (bullet === null) return;
    bullet.active = true;
    bullet.x = player.x + Math.cos(angle) * (player.radius + 6);
    bullet.y = player.y + Math.sin(angle) * (player.radius + 6);
    bullet.vx = Math.cos(angle) * PLAYER.bulletSpeed;
    bullet.vy = Math.sin(angle) * PLAYER.bulletSpeed;
    bullet.life = PLAYER.bulletLife;
  }

  function fireOrb(enemy, angle, speed) {
    const orb = freeOf(orbs);
    if (orb === null) return;
    orb.active = true;
    orb.x = enemy.x + Math.cos(angle) * (enemy.radius + 8);
    orb.y = enemy.y + Math.sin(angle) * (enemy.radius + 8);
    orb.vx = Math.cos(angle) * speed;
    orb.vy = Math.sin(angle) * speed;
    orb.life = 4.2;
  }

  function dropPickup(x, y) {
    if (random() > PICKUP.dropChance) return;
    const pickup = freeOf(pickups);
    if (pickup === null) return;
    const roll = random();
    pickup.kind = roll < 0.34 ? PICKUP_SPREAD : roll < 0.62 ? PICKUP_RAPID : roll < 0.84 ? PICKUP_SHIELD : PICKUP_HEAL;
    if (pickup.kind === PICKUP_HEAL && player.hp >= PLAYER.maxHp) pickup.kind = PICKUP_SPREAD;
    pickup.active = true;
    pickup.x = x;
    pickup.y = y;
    pickup.life = PICKUP.life;
    pickup.bob = random() * TAU;
  }

  function killEnemy(enemy) {
    let events = EVENT_EXPLOSION;
    enemy.active = false;
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = COMBO.window;
    if (state.combo > state.bestCombo) state.bestCombo = state.combo;
    const gained = ENEMY[enemy.kind].score * comboMultiplier();
    state.score += gained;
    const color = enemy.kind === KIND_DRIFTER ? '#ff5d73' : enemy.kind === KIND_SPITTER ? '#b388ff' : enemy.kind === KIND_SPLITTER ? '#ff9f43' : '#ff3860';
    if (enemy.kind === KIND_WARDEN) {
      state.boss = null;
      particles.burst(enemy.x, enemy.y, color, 46, 340, 0.8, 3.4);
      particles.burst(enemy.x, enemy.y, '#ffd166', 26, 240, 0.9, 2.6);
      state.shake = Math.min(15, state.shake + 11);
      state.hitStop = Math.max(state.hitStop, 0.09);
      addFloater(enemy.x, enemy.y - 30, `WARDEN DOWN +${gained}`, '#ffd166');
      events |= EVENT_BIG_EXPLOSION;
    } else {
      particles.burst(enemy.x, enemy.y, color, enemy.kind === KIND_SPLITTER ? 20 : 12, 230, 0.55, 2.8);
      addFloater(enemy.x, enemy.y - 16, comboMultiplier() > 1 ? `+${gained} x${comboMultiplier()}` : `+${gained}`, '#ffd166');
      if (enemy.kind === KIND_SPLITTER) {
        for (let i = 0; i < 2; i += 1) {
          const child = spawnEnemy(KIND_DRIFTER, enemy.x + (i === 0 ? -18 : 18), enemy.y + (i === 0 ? 10 : -10));
          if (child !== null) { child.vx = (i === 0 ? -70 : 70); child.vy = 40; }
        }
      }
      dropPickup(enemy.x, enemy.y);
    }
    return events;
  }

  function hurtPlayer(events) {
    if (player.invulnerable > 0 || player.dashTimer > 0) return events;
    if (player.shieldTimer > 0) {
      player.shieldTimer = 0;
      player.invulnerable = 0.8;
      state.shake = Math.min(12, state.shake + 5);
      particles.burst(player.x, player.y, '#7ef0d4', 14, 220, 0.45, 2.6);
      return events | EVENT_SHIELD_BREAK;
    }
    player.hp -= 1;
    player.invulnerable = PLAYER.hurtInvulnerable;
    state.combo = 0;
    state.comboTimer = 0;
    state.shake = Math.min(14, state.shake + 8);
    state.hitStop = Math.max(state.hitStop, 0.055);
    particles.burst(player.x, player.y, '#ff5d73', 16, 250, 0.5, 2.8);
    if (player.hp <= 0) return events | EVENT_HURT | EVENT_OVER;
    return events | EVENT_HURT;
  }

  /**
   * One fixed step of a live game. `control` is { moveX, moveY, aimX, aimY, firing, dash }:
   * movement in -1..1, the aim point in world coordinates, and the dash as a one-step flag.
   */
  function step(dt, control) {
    let events = 0;
    if (state.hitStop > 0) {
      state.hitStop -= dt;
      particles.update(dt);
      return events;
    }
    state.elapsed += dt;
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    // Wave flow: intermission counts down into the next wave; a cleared wave rests, then turns.
    if (state.phase === 'intermission') {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) events |= beginWave(state.wave + 1);
    } else if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnFromEdge(state.spawnQueue.shift());
        state.spawnTimer = WAVE.spawnInterval * (0.7 + random() * 0.6);
      }
    } else if (!enemies.some((enemy) => enemy.active)) {
      state.phase = 'intermission';
      state.phaseTimer = WAVE.intermission;
      state.banner = state.wave % 5 === 0 ? 'The Warden falls — the light holds' : `Wave ${state.wave} clear`;
      state.bannerTimer = 1.6;
    }

    // The keeper: aim, dash, move, fire.
    player.aim = Math.atan2(control.aimY - player.y, control.aimX - player.x);
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.dashCooldown > 0) player.dashCooldown -= dt;
    if (player.spreadTimer > 0) player.spreadTimer -= dt;
    if (player.rapidTimer > 0) player.rapidTimer -= dt;
    if (player.shieldTimer > 0) player.shieldTimer -= dt;
    if (control.dash && player.dashCooldown <= 0 && player.dashTimer <= 0) {
      const length = Math.hypot(control.moveX, control.moveY);
      player.dashDirX = length > 0.1 ? control.moveX / length : Math.cos(player.aim);
      player.dashDirY = length > 0.1 ? control.moveY / length : Math.sin(player.aim);
      player.dashTimer = PLAYER.dashTime;
      player.dashCooldown = PLAYER.dashCooldown;
      events |= EVENT_DASH;
    }
    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      player.x += player.dashDirX * PLAYER.dashSpeed * dt;
      player.y += player.dashDirY * PLAYER.dashSpeed * dt;
      player.trailTimer -= dt;
      if (player.trailTimer <= 0) {
        player.trailTimer = 0.024;
        const mark = freeOf(trail);
        if (mark !== null) { mark.active = true; mark.x = player.x; mark.y = player.y; mark.life = 0.28; }
      }
    } else {
      const length = Math.hypot(control.moveX, control.moveY);
      const scale = length > 1 ? 1 / length : 1;
      player.x += control.moveX * scale * PLAYER.speed * dt;
      player.y += control.moveY * scale * PLAYER.speed * dt;
    }
    player.x = Math.min(FIELD.width - FIELD.margin - player.radius, Math.max(FIELD.margin + player.radius, player.x));
    player.y = Math.min(FIELD.height - FIELD.margin - player.radius, Math.max(FIELD.margin + player.radius, player.y));

    if (player.fireTimer > 0) player.fireTimer -= dt;
    if (control.firing && player.fireTimer <= 0) {
      player.fireTimer = player.rapidTimer > 0 ? PLAYER.rapidInterval : PLAYER.fireInterval;
      fireBullet(player.aim);
      if (player.spreadTimer > 0) {
        fireBullet(player.aim - 0.15);
        fireBullet(player.aim + 0.15);
      }
      particles.spawn(player.x + Math.cos(player.aim) * 22, player.y + Math.sin(player.aim) * 22, Math.cos(player.aim) * 60, Math.sin(player.aim) * 60, 0.09, 2.4, '#ffd166', 4);
      events |= EVENT_SHOOT;
    }

    // Enemies: each kind hunts its own way.
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      if (enemy.flash > 0) enemy.flash -= dt;
      enemy.angle += dt * 0.9;
      const toPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      enemy.wobble += dt * 2.4;
      if (enemy.kind === KIND_DRIFTER) {
        const wobbleAngle = toPlayer + Math.sin(enemy.wobble) * 0.35;
        enemy.vx = Math.cos(wobbleAngle) * enemy.speed;
        enemy.vy = Math.sin(wobbleAngle) * enemy.speed;
      } else if (enemy.kind === KIND_SPITTER) {
        const keep = dist > ENEMY.spitter.range + 26 ? 1 : dist < ENEMY.spitter.range - 42 ? -1 : 0;
        const strafe = Math.sin(enemy.wobble * 0.7) > 0 ? 1 : -1;
        enemy.vx = Math.cos(toPlayer) * enemy.speed * keep + Math.cos(toPlayer + Math.PI / 2) * enemy.speed * 0.55 * strafe;
        enemy.vy = Math.sin(toPlayer) * enemy.speed * keep + Math.sin(toPlayer + Math.PI / 2) * enemy.speed * 0.55 * strafe;
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0 && dist < 430) {
          enemy.fireTimer = ENEMY.spitter.orbInterval * (0.85 + random() * 0.4);
          fireOrb(enemy, toPlayer, ENEMY.spitter.orbSpeed);
        }
      } else if (enemy.kind === KIND_SPLITTER) {
        enemy.vx = Math.cos(toPlayer) * enemy.speed;
        enemy.vy = Math.sin(toPlayer) * enemy.speed;
      } else if (enemy.kind === KIND_WARDEN) {
        const hpFrac = enemy.hp / enemy.maxHp;
        const speedScale = hpFrac < 0.33 ? 1.7 : hpFrac < 0.66 ? 1.25 : 1;
        enemy.vx = Math.cos(toPlayer) * enemy.speed * speedScale;
        enemy.vy = Math.sin(toPlayer) * enemy.speed * speedScale;
        enemy.burstTimer -= dt;
        if (enemy.burstTimer <= 0) {
          enemy.burstTimer = hpFrac < 0.33 ? 2.1 : 2.9;
          const count = hpFrac < 0.66 ? 14 : 10;
          const base = random() * TAU;
          for (let i = 0; i < count; i += 1) fireOrb(enemy, base + (i / count) * TAU, 168);
          if (hpFrac < 0.66) {
            for (let i = -1; i <= 1; i += 1) fireOrb(enemy, toPlayer + i * 0.16, 245);
          }
        }
        enemy.spawnTimer -= dt;
        if (enemy.spawnTimer <= 0 && hpFrac < 0.66) {
          enemy.spawnTimer = 6.5;
          spawnEnemy(KIND_DRIFTER, enemy.x - 60, enemy.y);
          spawnEnemy(KIND_DRIFTER, enemy.x + 60, enemy.y);
        }
      }
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.x = Math.min(FIELD.width - FIELD.margin - enemy.radius, Math.max(FIELD.margin + enemy.radius, enemy.x));
      enemy.y = Math.min(FIELD.height - FIELD.margin - enemy.radius, Math.max(FIELD.margin + enemy.radius, enemy.y));
      if (dist < enemy.radius + player.radius + 2) events = hurtPlayer(events);
      if (events & EVENT_OVER) return events;
    }

    // Bullets against enemies.
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.life <= 0 || bullet.x < 6 || bullet.y < 6 || bullet.x > FIELD.width - 6 || bullet.y > FIELD.height - 6) {
        bullet.active = false;
        continue;
      }
      for (const enemy of enemies) {
        if (!enemy.active) continue;
        const reach = enemy.radius + PLAYER.bulletRadius;
        if (distanceSquared(bullet.x, bullet.y, enemy.x, enemy.y) > reach * reach) continue;
        bullet.active = false;
        enemy.hp -= 1;
        enemy.flash = 0.09;
        if (enemy.hp <= 0) events |= killEnemy(enemy);
        else events |= EVENT_ENEMY_HIT;
        break;
      }
    }

    // Orbs against the keeper.
    for (const orb of orbs) {
      if (!orb.active) continue;
      orb.life -= dt;
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      if (orb.life <= 0 || orb.x < 4 || orb.y < 4 || orb.x > FIELD.width - 4 || orb.y > FIELD.height - 4) {
        orb.active = false;
        continue;
      }
      const reach = player.radius + 6;
      if (distanceSquared(orb.x, orb.y, player.x, player.y) <= reach * reach) {
        orb.active = false;
        events = hurtPlayer(events);
        if (events & EVENT_OVER) return events;
      }
    }

    // Pickups drift toward a near keeper and apply on touch.
    for (const pickup of pickups) {
      if (!pickup.active) continue;
      pickup.life -= dt;
      pickup.bob += dt * 3;
      if (pickup.life <= 0) { pickup.active = false; continue; }
      const dist = Math.hypot(player.x - pickup.x, player.y - pickup.y);
      if (dist < PICKUP.magnetRange) {
        pickup.x += ((player.x - pickup.x) / Math.max(1, dist)) * PICKUP.magnetSpeed * dt;
        pickup.y += ((player.y - pickup.y) / Math.max(1, dist)) * PICKUP.magnetSpeed * dt;
      }
      if (dist < player.radius + PICKUP.radius + 4) {
        pickup.active = false;
        if (pickup.kind === PICKUP_SPREAD) player.spreadTimer = PICKUP.spreadSeconds;
        else if (pickup.kind === PICKUP_RAPID) player.rapidTimer = PICKUP.rapidSeconds;
        else if (pickup.kind === PICKUP_SHIELD) player.shieldTimer = PICKUP.shieldSeconds;
        else if (pickup.kind === PICKUP_HEAL) player.hp = Math.min(PLAYER.maxHp, player.hp + 1);
        addFloater(player.x, player.y - 26, pickup.kind.toUpperCase(), '#7ef0d4');
        particles.burst(player.x, player.y, '#7ef0d4', 10, 170, 0.4, 2.2);
        events |= EVENT_PICKUP;
      }
    }

    for (const floater of floaters) {
      if (!floater.active) continue;
      floater.life -= dt;
      floater.y -= 34 * dt;
      if (floater.life <= 0) floater.active = false;
    }
    for (const mark of trail) {
      if (!mark.active) continue;
      mark.life -= dt;
      if (mark.life <= 0) mark.active = false;
    }

    state.emberTimer -= dt;
    if (state.emberTimer <= 0) {
      state.emberTimer = 0.24;
      particles.ember(FIELD.margin + random() * (FIELD.width - FIELD.margin * 2), FIELD.height - FIELD.margin - random() * 60);
    }
    particles.update(dt);
    return events;
  }

  /** The title screen's backdrop: a few shadows drift and embers rise, and nothing can score. */
  function demoStep(dt) {
    state.elapsed += dt;
    if (!enemies.some((enemy) => enemy.active)) {
      spawnEnemy(KIND_DRIFTER, 260, 190);
      spawnEnemy(KIND_SPITTER, 1010, 180);
      spawnEnemy(KIND_SPLITTER, 1030, 540);
      spawnEnemy(KIND_DRIFTER, 250, 545);
      spawnEnemy(KIND_DRIFTER, 640, 130);
    }
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      enemy.angle += dt * 0.9;
      enemy.wobble += dt * 1.6;
      enemy.x += Math.cos(enemy.wobble) * 22 * dt;
      enemy.y += Math.sin(enemy.wobble * 0.8) * 16 * dt;
    }
    state.emberTimer -= dt;
    if (state.emberTimer <= 0) {
      state.emberTimer = 0.18;
      particles.ember(random() * FIELD.width, FIELD.height - random() * 90);
    }
    particles.update(dt);
  }

  reset();
  return { state, reset, step, demoStep, spawnEnemy, comboMultiplier };
}
