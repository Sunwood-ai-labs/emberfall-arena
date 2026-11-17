// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between four screens: title, play, paused and game over. World
// events become sounds and screen-reader announcements here, the only place that knows
// about either.
//
// ?seed=N fixes the shadow pattern. ?shot=title|play|boss|over (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_BIG_EXPLOSION, EVENT_BOSS, EVENT_DASH, EVENT_ENEMY_HIT, EVENT_EXPLOSION,
  EVENT_HURT, EVENT_OVER, EVENT_PICKUP, EVENT_SHIELD_BREAK, EVENT_SHOOT, EVENT_WAVE,
} from './world.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const state = world.state;
  const aim = { x: state.player.x + Math.cos(state.player.aim) * 120, y: state.player.y + Math.sin(state.player.aim) * 120 };
  window.__shotInfo = {
    shot: name, score: state.score, hp: state.player.hp, wave: state.wave,
    kills: state.kills, bossActive: state.boss !== null && state.boss.active,
    enemiesActive: state.enemies.filter((enemy) => enemy.active).length,
  };
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, scene.best, aim, world.comboMultiplier());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let dashQueued = false;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Wave 1. Hold the light.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.gameOver();
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function playEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_ENEMY_HIT) audio.enemyHit();
    if (events & EVENT_BIG_EXPLOSION) audio.bigExplosion();
    else if (events & EVENT_EXPLOSION) audio.explosion();
    if (events & EVENT_SHIELD_BREAK) audio.shieldBreak();
    else if (events & EVENT_HURT) audio.playerHurt();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_BOSS) audio.bossWarn();
    else if (events & EVENT_WAVE) audio.waveStart();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_DASH) dashQueued = true;
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.demoStep(STEP);
      return;
    }
    const move = input.moveVector();
    const aimClient = input.aimClient();
    const aim = renderer.toWorld(aimClient.x, aimClient.y);
    const events = world.step(STEP, {
      moveX: move.x,
      moveY: move.y,
      aimX: aim.x,
      aimY: aim.y,
      firing: input.firing(),
      dash: dashQueued,
    });
    dashQueued = false;
    playEvents(events);
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_HURT) announce(world.state.player.hp === 1 ? 'Hit. One heart left.' : `Hit. ${world.state.player.hp} hearts left.`);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const aimClient = input.aimClient();
    const aim = renderer.toWorld(aimClient.x, aimClient.y);
    renderer.draw(world.state, screen, best, aim, world.comboMultiplier());
  }

  // Leaving the tab pauses a running game rather than letting shadows swarm unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberfall Arena. Click or press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
