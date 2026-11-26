// Keyboard and mouse, read as one controls object the flight model trusts.
// Arrows (or WASD) pitch and bank, W/S or PageUp/PageDown work the throttle,
// the mouse steers when it is held down, and Enter starts or restarts.

export function createInput() {
  const keys = new Set();
  const tapped = new Set();
  const state = { mouseSteer: null };

  addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (!event.repeat) tapped.add(event.code); // a tap shorter than a frame still counts
    keys.add(event.code);
  });
  addEventListener('keyup', (event) => keys.delete(event.code));
  addEventListener('blur', () => keys.clear());
  addEventListener('pointerdown', (event) => {
    state.mouseSteer = { x: event.clientX, y: event.clientY };
  });
  addEventListener('pointermove', (event) => {
    if (state.mouseSteer) state.mouseSteer = { x: event.clientX, y: event.clientY };
  });
  addEventListener('pointerup', () => {
    state.mouseSteer = null;
  });

  /** The current controls: pitch/roll in -1..1, throttleDelta in -1..1. */
  function read(view) {
    let pitch = 0;
    let roll = 0;
    let throttleDelta = 0;
    if (keys.has('ArrowDown')) pitch += 1; // stick back, nose up
    if (keys.has('ArrowUp')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
    if (keys.has('KeyW')) throttleDelta += 1;
    if (keys.has('KeyS') && !keys.has('ShiftLeft')) throttleDelta -= 1;
    if (state.mouseSteer && view) {
      roll = Math.max(-1, Math.min(1, (state.mouseSteer.x / view.width - 0.5) * 2.4));
      pitch = Math.max(-1, Math.min(1, (0.5 - state.mouseSteer.y / view.height) * 1.6));
    }
    return { pitch, roll, throttleDelta };
  }

  function pressed(code) {
    return keys.has(code);
  }

  /** True once per tap of a key, however short; the frame loop consumes it. */
  function consumeTap(code) {
    const was = tapped.has(code);
    tapped.delete(code);
    return was;
  }

  return { read, pressed, consumeTap };
}
