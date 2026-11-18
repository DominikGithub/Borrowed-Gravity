// The whole game is played with one key: Shift (left or right).
// Touch / mouse press is a fallback so it also works on tablets.
// Escape / P only pause (system keys, never gameplay).
//
// Produces a queue of edge events: 'press' | 'release' | 'cancel' | 'pause' | 'blur'.

export function createInput() {
  const st = {
    down: false,
    since: 0,
    queue: [],
  };
  const keys = new Set();
  let pointer = false;

  const set = (v) => {
    if (v === st.down) return;
    st.down = v;
    st.since = performance.now() / 1000;
    st.queue.push(v ? 'press' : 'release');
  };
  const sync = () => set(keys.size > 0 || pointer);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') {
      e.preventDefault();
      keys.add(e.code || 'Shift');
      sync();
    } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      st.queue.push('pause');
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      e.preventDefault();
      keys.delete(e.code || 'Shift');
      // some platforms report the code of the other Shift on release
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (!e.getModifierState || !e.getModifierState('Shift')) keys.clear();
      }
      sync();
    }
  });

  const isUi = (e) => e.target && e.target.closest && e.target.closest('[data-ui]');
  window.addEventListener('pointerdown', (e) => {
    if (isUi(e)) return;
    pointer = true;
    sync();
  });
  const up = () => { pointer = false; sync(); };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  const lose = () => {
    keys.clear();
    pointer = false;
    if (st.down) {
      st.down = false;
      st.queue.push('cancel'); // focus lost: drop the charge, never fire it
    }
    st.queue.push('blur');
  };
  window.addEventListener('blur', lose);
  document.addEventListener('visibilitychange', () => { if (document.hidden) lose(); });

  st.drain = () => st.queue.splice(0, st.queue.length);
  return st;
}
