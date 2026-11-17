// A pooled particle system: bursts on kills, dash trails, pickup sparkles and the slow ember
// motes that drift over the arena. The pool is allocated once at boot and reused, so a busy
// fight allocates nothing. Particles are pure decoration: the world spawns them, the
// renderer draws them, and nothing in the rules reads them back.

const POOL_SIZE = 320;

export function createParticles(random) {
  const pool = [];
  for (let i = 0; i < POOL_SIZE; i += 1) {
    pool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff', drag: 1, gravity: 0 });
  }
  let cursor = 0;

  function spawn(x, y, vx, vy, life, size, color, drag = 2.2, gravity = 0) {
    const p = pool[cursor];
    cursor = (cursor + 1) % POOL_SIZE;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.color = color;
    p.drag = drag;
    p.gravity = gravity;
  }

  function burst(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const v = speed * (0.25 + random() * 0.95);
      spawn(x, y, Math.cos(angle) * v, Math.sin(angle) * v, life * (0.5 + random() * 0.8), size * (0.6 + random() * 0.9), color);
    }
  }

  function ember(x, y) {
    spawn(x, y, (random() - 0.5) * 14, -12 - random() * 22, 2.4 + random() * 2.4, 1.6 + random() * 1.6, '#ffd166', 0.15);
  }

  function update(dt) {
    for (let i = 0; i < POOL_SIZE; i += 1) {
      const p = pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      const dragFactor = Math.max(0, 1 - p.drag * dt);
      p.vx *= dragFactor;
      p.vy = p.vy * dragFactor + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  return { pool, spawn, burst, ember, update };
}
