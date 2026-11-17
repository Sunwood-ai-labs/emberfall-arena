// Keyboard and pointer input for a twin-stick arena: held keys give a movement vector, the
// pointer gives an aim point (in client pixels; main converts it to world coordinates with
// the renderer's transform), holding the pointer fires, and one-shot presses (confirm,
// pause, dash) are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;

const KEYS = {
  left: new Set(['ArrowLeft', 'KeyA']),
  right: new Set(['ArrowRight', 'KeyD']),
  up: new Set(['ArrowUp', 'KeyW']),
  down: new Set(['ArrowDown', 'KeyS']),
  confirm: new Set(['Enter']),
  pause: new Set(['KeyP', 'Escape']),
  dash: new Set(['Space', 'ShiftLeft', 'ShiftRight']),
};

export function createInput(target) {
  const held = { left: false, right: false, up: false, down: false };
  let actions = 0;
  let firing = false;
  let aimClient = { x: window.innerWidth / 2, y: window.innerHeight / 3 };

  function directionOf(event) {
    for (const name of Object.keys(KEYS)) if (KEYS[name].has(event.code)) return name;
    return null;
  }

  window.addEventListener('keydown', (event) => {
    const name = directionOf(event);
    if (name === null) return;
    if (name in held) held[name] = true;
    else if (!event.repeat) {
      if (name === 'confirm') actions |= ACTION_CONFIRM;
      else if (name === 'pause') actions |= ACTION_PAUSE;
      else if (name === 'dash') actions |= ACTION_DASH;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    const name = directionOf(event);
    if (name !== null && name in held) held[name] = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.left = false;
    held.right = false;
    held.up = false;
    held.down = false;
    firing = false;
  });

  target.addEventListener('pointermove', (event) => {
    aimClient = { x: event.clientX, y: event.clientY };
  });
  target.addEventListener('pointerdown', (event) => {
    aimClient = { x: event.clientX, y: event.clientY };
    firing = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => { firing = false; });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Movement as a vector; main normalises it, so diagonals are not faster. */
    moveVector() {
      return {
        x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
      };
    },
    /** The pointer's last position, in client pixels. */
    aimClient() { return aimClient; },
    /** True while the pointer is held down: the keeper's lantern is firing. */
    firing() { return firing; },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
