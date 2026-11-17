// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 arena
// is scaled to fit the window and centred, the margin filled with the backdrop colour.
// Everything is drawn in code — glowing shapes on a night grid — so the game ships no image
// files. Screen shake is a function of the world's own clock, never Math.random, so a
// staged screenshot frame is the same every time it is taken.

import { FIELD, FONT, PALETTE, PLAYER } from './config.js';
import { KIND_DRIFTER, KIND_SPITTER, KIND_SPLITTER, KIND_WARDEN, PICKUP_HEAL, PICKUP_RAPID, PICKUP_SHIELD, PICKUP_SPREAD } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PICKUP_STYLE = {
  [PICKUP_SPREAD]: { color: PALETTE.spread, label: 'S', name: 'SPREAD' },
  [PICKUP_RAPID]: { color: PALETTE.rapid, label: 'R', name: 'RAPID' },
  [PICKUP_SHIELD]: { color: PALETTE.shield, label: 'O', name: 'SHIELD' },
  [PICKUP_HEAL]: { color: PALETTE.heal, label: '+', name: 'HEAL' },
};

const ENEMY_COLOR = {
  [KIND_DRIFTER]: PALETTE.drifter,
  [KIND_SPITTER]: PALETTE.spitter,
  [KIND_SPLITTER]: PALETTE.splitter,
  [KIND_WARDEN]: PALETTE.warden,
};

function polygon(context, x, y, radius, sides, rotation) {
  context.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  /** Client pixels (a pointer event) to world coordinates in the 1280x720 field. */
  function toWorld(clientX, clientY) {
    const ratio = window.devicePixelRatio || 1;
    return {
      x: (clientX * ratio - view.x) / view.scale,
      y: (clientY * ratio - view.y) / view.scale,
    };
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight = 600) {
    const key = `${weight}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function drawArena(state) {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.arenaTop);
    gradient.addColorStop(1, PALETTE.arenaBottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = FIELD.margin; x <= FIELD.width - FIELD.margin; x += 56) {
      context.moveTo(x, FIELD.margin);
      context.lineTo(x, FIELD.height - FIELD.margin);
    }
    for (let y = FIELD.margin; y <= FIELD.height - FIELD.margin; y += 56) {
      context.moveTo(FIELD.margin, y);
      context.lineTo(FIELD.width - FIELD.margin, y);
    }
    context.stroke();
    context.strokeStyle = PALETTE.border;
    context.lineWidth = 3;
    context.shadowColor = PALETTE.border;
    context.shadowBlur = 14;
    context.strokeRect(FIELD.margin, FIELD.margin, FIELD.width - FIELD.margin * 2, FIELD.height - FIELD.margin * 2);
    context.shadowBlur = 0;
    // A soft pool of lantern light around the keeper.
    const player = state.player;
    const light = context.createRadialGradient(player.x, player.y, 20, player.x, player.y, 250);
    light.addColorStop(0, 'rgba(255, 209, 102, 0.13)');
    light.addColorStop(1, 'rgba(255, 209, 102, 0)');
    context.fillStyle = light;
    context.fillRect(player.x - 250, player.y - 250, 500, 500);
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawPickups(state) {
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      if (pickup.life < 3 && Math.floor(pickup.life * 6) % 2 === 0) continue;
      const style = PICKUP_STYLE[pickup.kind];
      const y = pickup.y + Math.sin(pickup.bob) * 3;
      context.strokeStyle = style.color;
      context.fillStyle = 'rgba(10, 8, 24, 0.85)';
      context.lineWidth = 2;
      context.shadowColor = style.color;
      context.shadowBlur = 10;
      context.beginPath();
      context.arc(pickup.x, y, 13, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.shadowBlur = 0;
      text(style.label, pickup.x, y + 6, 15, style.color, 'center', 800);
    }
  }

  function drawEnemies(state) {
    for (const enemy of state.enemies) {
      if (!enemy.active) continue;
      const color = enemy.flash > 0 ? '#ffffff' : ENEMY_COLOR[enemy.kind];
      context.fillStyle = color;
      context.strokeStyle = color;
      context.shadowColor = color;
      context.shadowBlur = 12;
      if (enemy.kind === KIND_DRIFTER) {
        polygon(context, enemy.x, enemy.y, enemy.radius, 3, enemy.angle);
        context.fill();
      } else if (enemy.kind === KIND_SPITTER) {
        polygon(context, enemy.x, enemy.y, enemy.radius, 4, enemy.angle);
        context.fill();
        context.shadowBlur = 0;
        context.fillStyle = '#0b0918';
        context.beginPath();
        context.arc(enemy.x, enemy.y, 5.5, 0, Math.PI * 2);
        context.fill();
      } else if (enemy.kind === KIND_SPLITTER) {
        polygon(context, enemy.x, enemy.y, enemy.radius, 6, enemy.angle);
        context.fill();
        context.shadowBlur = 0;
        context.fillStyle = 'rgba(11, 9, 24, 0.55)';
        polygon(context, enemy.x, enemy.y, enemy.radius * 0.55, 6, -enemy.angle);
        context.fill();
      } else if (enemy.kind === KIND_WARDEN) {
        polygon(context, enemy.x, enemy.y, enemy.radius, 6, enemy.angle * 0.6);
        context.fill();
        context.shadowBlur = 0;
        context.strokeStyle = PALETTE.wardenCore;
        context.lineWidth = 3;
        polygon(context, enemy.x, enemy.y, enemy.radius * 0.72, 6, -enemy.angle * 0.9);
        context.stroke();
        context.fillStyle = PALETTE.wardenCore;
        context.beginPath();
        context.arc(enemy.x, enemy.y, 11 + Math.sin(state.elapsed * 4) * 2, 0, Math.PI * 2);
        context.fill();
      }
      context.shadowBlur = 0;
      if (enemy.kind !== KIND_WARDEN && enemy.hp < enemy.maxHp) {
        context.fillStyle = 'rgba(255,255,255,0.28)';
        context.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 10, enemy.radius * 2, 3.5);
        context.fillStyle = color;
        context.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 10, enemy.radius * 2 * (enemy.hp / enemy.maxHp), 3.5);
      }
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    for (const mark of state.trail) {
      if (!mark.active) continue;
      context.globalAlpha = mark.life / 0.28 * 0.35;
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(mark.x, mark.y, player.radius * 0.9, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    if (player.invulnerable > 0 && player.dashTimer <= 0 && Math.floor(player.invulnerable * 12) % 2 === 0) return;
    // The lantern: a bright core in a teal ring, with a wedge toward the aim.
    context.shadowColor = PALETTE.player;
    context.shadowBlur = 16;
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = PALETTE.playerCore;
    context.beginPath();
    context.arc(player.x, player.y, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.bullet;
    context.beginPath();
    const tipX = player.x + Math.cos(player.aim) * (player.radius + 9);
    const tipY = player.y + Math.sin(player.aim) * (player.radius + 9);
    const leftX = player.x + Math.cos(player.aim + 2.5) * 9;
    const leftY = player.y + Math.sin(player.aim + 2.5) * 9;
    const rightX = player.x + Math.cos(player.aim - 2.5) * 9;
    const rightY = player.y + Math.sin(player.aim - 2.5) * 9;
    context.moveTo(tipX, tipY);
    context.lineTo(leftX, leftY);
    context.lineTo(rightX, rightY);
    context.closePath();
    context.fill();
    if (player.shieldTimer > 0) {
      context.strokeStyle = PALETTE.shield;
      context.globalAlpha = 0.65 + Math.sin(state.elapsed * 5) * 0.2;
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(player.x, player.y, player.radius + 8, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  function drawProjectiles(state) {
    context.fillStyle = PALETTE.bullet;
    context.shadowColor = PALETTE.bullet;
    context.shadowBlur = 9;
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      context.beginPath();
      context.arc(bullet.x, bullet.y, PLAYER.bulletRadius, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = PALETTE.orb;
    context.shadowColor = PALETTE.orb;
    for (const orb of state.orbs) {
      if (!orb.active) continue;
      context.beginPath();
      context.arc(orb.x, orb.y, 6.5, 0, Math.PI * 2);
      context.fill();
    }
    context.shadowBlur = 0;
  }

  function drawFloaters(state) {
    context.textBaseline = 'alphabetic';
    for (const floater of state.floaters) {
      if (!floater.active) continue;
      context.globalAlpha = Math.max(0, Math.min(1, floater.life / 0.9));
      text(floater.text, floater.x, floater.y, 17, floater.color, 'center', 800);
    }
    context.globalAlpha = 1;
  }

  function drawHud(state, best, multiplier) {
    context.textBaseline = 'top';
    for (let i = 0; i < PLAYER.maxHp; i += 1) {
      const x = 30 + i * 30;
      context.fillStyle = i < state.player.hp ? PALETTE.heart : 'rgba(255,255,255,0.14)';
      polygon(context, x + 9, 40, 10, 4, Math.PI / 4);
      context.fill();
    }
    text('HP', 30, 52, 13, PALETTE.muted, 'left', 700);
    text(`SCORE ${state.score}`, 30, 74, 25, PALETTE.text, 'left', 800);
    if (state.combo > 1) {
      text(`COMBO x${multiplier}  (${state.combo})`, 30, 106, 17, PALETTE.combo, 'left', 800);
      context.fillStyle = 'rgba(255,255,255,0.16)';
      context.fillRect(30, 130, 150, 5);
      context.fillStyle = PALETTE.combo;
      context.fillRect(30, 130, 150 * Math.max(0, state.comboTimer / 3), 5);
    }
    text(`WAVE ${Math.max(1, state.wave)}`, FIELD.width / 2, 34, 26, PALETTE.text, 'center', 800);
    text(`BEST ${best}`, FIELD.width - 30, 36, 20, PALETTE.muted, 'right', 700);
    text(`KILLS ${state.kills}`, FIELD.width - 30, 62, 16, PALETTE.muted, 'right', 700);
    // Active pickup timers and the dash cooldown, bottom left where a player glances.
    context.textBaseline = 'alphabetic';
    let timerY = FIELD.height - 58;
    const timers = [];
    if (state.player.spreadTimer > 0) timers.push(['SPREAD', state.player.spreadTimer, PALETTE.spread]);
    if (state.player.rapidTimer > 0) timers.push(['RAPID', state.player.rapidTimer, PALETTE.rapid]);
    if (state.player.shieldTimer > 0) timers.push(['SHIELD', state.player.shieldTimer, PALETTE.shield]);
    for (const [name, left, color] of timers) {
      text(`${name} ${left.toFixed(0)}s`, 30, timerY, 16, color, 'left', 800);
      timerY -= 22;
    }
    const dashReady = state.player.dashCooldown <= 0;
    text(dashReady ? 'DASH READY (SPACE)' : 'DASH …', 30, FIELD.height - 32, 14, dashReady ? PALETTE.shield : PALETTE.muted, 'left', 700);
    if (state.boss !== null && state.boss.active) {
      const width = 520;
      const x = (FIELD.width - width) / 2;
      text('UMBRAL WARDEN', FIELD.width / 2, 74, 15, PALETTE.warden, 'center', 800);
      context.fillStyle = 'rgba(255,255,255,0.15)';
      context.fillRect(x, 82, width, 9);
      context.fillStyle = PALETTE.warden;
      context.fillRect(x, 82, width * Math.max(0, state.boss.hp / state.boss.maxHp), 9);
    }
  }

  function drawBanner(state) {
    if (state.bannerTimer <= 0 || state.banner === '') return;
    const alpha = Math.min(1, state.bannerTimer / 0.5, (2 - state.bannerTimer) / 0.4 + 0.4);
    context.globalAlpha = Math.max(0, Math.min(1, alpha));
    context.textBaseline = 'alphabetic';
    text(state.banner, FIELD.width / 2, 150, state.banner.length > 24 ? 30 : 38, PALETTE.text, 'center', 800);
    context.globalAlpha = 1;
  }

  function drawCrosshair(aim) {
    context.strokeStyle = PALETTE.bullet;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(aim.x, aim.y, 10, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(aim.x - 15, aim.y);
    context.lineTo(aim.x - 5, aim.y);
    context.moveTo(aim.x + 5, aim.y);
    context.lineTo(aim.x + 15, aim.y);
    context.moveTo(aim.x, aim.y - 15);
    context.lineTo(aim.x, aim.y - 5);
    context.moveTo(aim.x, aim.y + 5);
    context.lineTo(aim.x, aim.y + 15);
    context.stroke();
  }

  function drawPanel(title, titleColor, lines, prompt, titleSize = 52) {
    const width = 660;
    const height = 150 + lines.length * 31 + 78;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(7, 6, 14, 0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.globalAlpha = 0.94;
    context.beginPath();
    context.roundRect(x, y, width, height, 16);
    context.fill();
    context.globalAlpha = 1;
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(x, y, width, height, 16);
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 84, titleSize, titleColor, 'center', 800);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 138 + i * 31, 20, PALETTE.muted, 'center', 600);
    }
    text(prompt, FIELD.width / 2, y + height - 34, 22, PALETTE.bullet, 'center', 800);
  }

  /** Paint one frame: the arena, the fight, then the HUD or the screen's panel. */
  function draw(state, screen, best, aim, multiplier) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? Math.sin(state.elapsed * 91) * state.shake : 0;
    const shakeY = state.shake > 0 ? Math.cos(state.elapsed * 113) * state.shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawArena(state);
    drawParticles(state);
    drawPickups(state);
    drawEnemies(state);
    drawProjectiles(state);
    drawPlayer(state);
    drawFloaters(state);
    if (screen === SCREEN_TITLE) {
      drawPanel('EMBERFALL ARENA', PALETTE.bullet, [
        'The lantern keeper holds the last light against the shadow swarm.',
        'WASD move · Mouse aim · Hold click to fire · Space to dash',
        'Chain kills for combo multipliers. Grab S / R / O / + pickups.',
        'Survive the waves — the Umbral Warden comes every 5th wave.',
        `Best score: ${best}`,
      ], 'Click or press Enter to play');
      return;
    }
    drawHud(state, best, multiplier);
    drawBanner(state);
    if (screen === SCREEN_PLAY && aim) drawCrosshair(aim);
    else if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', PALETTE.text, ['The shadows wait for no keeper — but they will wait for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('THE LIGHT GOES OUT', PALETTE.drifter, [
        `Score ${state.score}   ·   Best ${best}`,
        `Reached wave ${Math.max(1, state.wave)}   ·   ${state.kills} shadows scattered`,
        `Best combo chain: ${state.bestCombo}`,
      ], 'Click or press Enter to play again', 44);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toWorld };
}
