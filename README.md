# Emberfall Arena

An original top-down arena shooter for a desktop browser. You are the lantern keeper,
holding the last light against a swarm of shadow shapes. Chain kills to raise your combo
multiplier, dash through danger, grab weapon and shield pickups, and face the Umbral
Warden — a radial-burst boss — every fifth wave.

## Play

Serve the game folder with any static file server, for example from this repository:

```sh
node serve.ts
# then open http://localhost:8080
```

Or run the entry program, which copies `game/` and `screenshots/` to the output
directory and writes the make.fun dossier:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

- **WASD / arrows** — move
- **Mouse** — aim
- **Hold click** — fire
- **Space / Shift** — dash (brief invulnerability, short cooldown)
- **P / Esc** — pause

## Rules

- 5 hearts. Enemy contact and shadow orbs cost one heart (a shield pickup absorbs one hit).
- Kills within 3 seconds chain a combo: every 5 chain raises the score multiplier, to x8.
  Taking a hit resets the chain.
- Pickups drop from scattered shadows: **S** spread shot (12s), **R** rapid fire (10s),
  **O** shield (15s), **+** heal one heart.
- Waves grow and mix three shadow kinds — drifters chase, spitters keep their distance
  and shoot, splitters break into two drifters — and every 5th wave ends with the Warden.

## Structure

- `main.ts` — the entry program: copies the game and screenshots out, writes `dossier.json`
- `vendor/makefun-game.ts` — make.fun's dossier library, copied from the kit unchanged
- `game/index.html` — the page, the canvas, no network requests
- `game/src/config.js` — every tuning number and colour
- `game/src/world.js` — the rules: keeper, enemies, waves, combo, boss (no drawing)
- `game/src/render.js` — canvas drawing, HUD, panels (no rules)
- `game/src/input.js` — keyboard and pointer
- `game/src/audio.js` — WebAudio-synthesized effects and ambient pad (no audio files)
- `game/src/particles.js` — pooled particles
- `game/src/random.js` — seeded RNG, so screenshot scenes repeat
- `game/src/shots.js` — the deterministic `?shot=` scenes behind `screenshots/`
- `game/src/main.js` — boot, the fixed-step loop, screens, sound wiring

## License

MIT — see `LICENSE`.
