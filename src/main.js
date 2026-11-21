// Borrowed Gravity — game flow and the Shift mode state machine.
//
// Shift has exactly one meaning at any moment:
//
//   FLIGHT (cyan)   hold = borrow gravity, release = get pulled
//   KINDLE (amber)  hold = pump light into a cold star, release in the band = ignite
//   SLING  (violet) hold = spin up around a spindle star, release = launch on the tangent
//   SHIELD (green)  hold = shield up against flares (drains), release = shield down
//   LENS   (pink)   hold = focus the camera, release = take the photo
//
//   FLIGHT ──zone──▶ [READY] ──tap──▶ MODE ──done──▶ [READY] ──tap──▶ FLIGHT
//
// Every change of meaning passes through a READY gap: a card says what Shift
// will do next (with a how-to the first few times), the colour changes and a
// cue plays. A short hand-over motion runs (≤0.6 s, or the ride to a star's
// exit lane), then time holds until the player taps Shift: no light drains,
// the clock stops, nothing can go wrong while they read. The start tap is
// swallowed (it never acts in the new mode), and a Shift that is still held
// when a mode goes live is ignored until released, so a press can never leak
// from one mode into the next. Zones only trigger in FLIGHT.

import * as THREE from 'three';
import { LEVELS } from './levels.js';
import * as P from './physics.js';
import { World, COLORS } from './world.js';
import { Hud, medalsHtml } from './hud.js';
import { Sfx } from './audio.js';
import { createInput } from './input.js';
import { HOWTO } from './howto.js';

const { PHYS, KINDLE, SLING, SHIELD, LENS } = P;

const LIGHT = { start: 100, drain: 1.9, holdDrain: 0.9, crash: 25, lost: 15, sputter: 6, good: 20, perfect: 32, flare: 10 };
const SAFE = 0.6;          // s a switch card stays up before a tap can start the mode
const HOWTO_VIEWS = 3;     // full how-to cards per mode before they turn compact
const INTRO_TIME = 2.6;
const MENU_HOLD = 0.7;
const OUTRO_TIME = 4.8;
// result screens: where the level's centre sits on screen, as a fraction of the half-height above centre
const RESULT_LIFT = 0.45;

const LOCK = { cls: 'lock', key: 'Locked', name: 'Switching', desc: 'Shift locked' };
const ready = (name) => ({ cls: 'ready', key: 'Tap to start', name, desc: 'tap Shift when ready' });
const MODE_INFO = {
  intro: { ...LOCK, name: 'Ready', desc: 'tap Shift to skip', key: 'Tap to skip' },
  toFlight: ready('Flight'), toKindle: ready('Kindle'), toSling: ready('Sling'), toShield: ready('Shield'), toLens: ready('Lens'),
  flight: { name: 'Flight', desc: 'Shift borrows gravity', cls: 'flight', key: 'Borrow gravity' },
  kindle: { name: 'Kindle', desc: 'Shift pumps light', cls: 'kindle', key: 'Pump light' },
  sling: { name: 'Sling', desc: 'Shift launches you', cls: 'sling', key: 'Tap = launch · hold = spin up' },
  shield: { name: 'Shield', desc: 'Shift raises the shield', cls: 'shield', key: 'Raise shield' },
  lens: { name: 'Lens', desc: 'Shift focuses the camera', cls: 'lens', key: 'Focus · let go to shoot' },
  crashed: { ...LOCK, name: 'Shattered' },
  lost: { ...LOCK, name: 'Lost' },
  outro: { name: 'Complete', desc: 'Constellation relit', cls: 'none', key: '—' },
};
// banner title, banner line, colour, sound cue
const SWITCH = {
  flight: ['Flight', 'Shift <b>borrows gravity</b> again', 'var(--cyan)', 'modeFlight'],
  kindle: ['Kindle', 'Shift now <b>pumps light</b> into the star', 'var(--amber)', 'modeKindle'],
  sling: ['Sling', 'Shift now <b>launches you</b> out of the orbit', 'var(--violet)', 'modeSling'],
  shield: ['Shield', 'Shift now <b>raises your shield</b>', 'var(--green)', 'modeShield'],
  lens: ['Lens', 'Shift now <b>focuses the camera</b> — let go to shoot', 'var(--pink)', 'modeLens'],
};
const ENTER_GAP = { kindle: KINDLE.enterGap, sling: SLING.enterGap, shield: SHIELD.enterGap, lens: LENS.enterGap };
const MODE_COL = { flight: COLORS.cyan, kindle: COLORS.amber, sling: COLORS.violet, shield: COLORS.green, lens: COLORS.pink };
const SPECIAL = new Set(['sling', 'shield', 'lens']);
const COASTING = new Set(['toShield', 'shield', 'toLens', 'lens']);

const SAVE_KEY = 'borrowed-gravity-v1';
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s.unlocked === 'number') return { photos: {}, howto: {}, ...s };
  } catch { /* storage unavailable */ }
  return { unlocked: 1, best: {}, photos: {}, howto: {} };
}
function writeSave(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* ignore (quota / private mode) */ } }

// Two principal axes + normal of a point cloud (for framing constellations).
function principal(points) {
  const n = points.length;
  const c = [0, 0, 0];
  for (const p of points) for (let i = 0; i < 3; i++) c[i] += p[i] / n;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of points) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (p[i] - c[i]) * (p[j] - c[j]);
  const power = (M, v) => {
    for (let k = 0; k < 40; k++) {
      const w = [0, 1, 2].map(i => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]);
      const l = Math.hypot(...w) || 1;
      v = w.map(x => x / l);
    }
    return v;
  };
  const a = power(C, [0.6, 0.5, 0.62]);
  const la = a.reduce((s, x, i) => s + x * [0, 1, 2].reduce((t, j) => t + C[i][j] * a[j], 0), 0);
  const C2 = C.map((row, i) => row.map((x, j) => x - la * a[i] * a[j]));
  let b = power(C2, [-0.3, 0.9, 0.1]);
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  b = b.map((x, i) => x - d * a[i]);
  const bl = Math.hypot(...b) || 1;
  b = b.map(x => x / bl);
  const nrm = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const r = Math.max(...points.map(p => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])));
  return { c, a, b, n: nrm, r };
}

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

class Game {
  constructor() {
    const canvas = document.getElementById('view');
    try {
      this.world = new World(canvas);
    } catch (e) {
      console.error(e);
      document.getElementById('nogl').hidden = false;
      return;
    }
    this.canvas = canvas;
    this.hud = new Hud();
    this.sfx = new Sfx();
    this.input = createInput();
    this.save = loadSave();
    this.sel = Math.min(this.save.unlocked - 1, LEVELS.length - 1);
    this.state = 'title';
    this.menu = null;
    this.menuBlock = 0;
    this.requireRelease = false;
    this.now = 0;
    this.real = performance.now() / 1000;
    this.acc = 0;
    this.prev = [0, 0, 0];
    this.previewPts = [];
    this.ghostPts = [];
    this.seen = new Set();
    this.cometVisible = false;
    this.tmpV = new THREE.Vector3();
    this.blurPx = 0;
    // Audio may only start after a user gesture; try on every early input.
    const wake = () => this.sfx.init();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    this.soundNote = document.getElementById('soundNote');
    this.buildMap();
    this.loadBackdrop(this.sel);
    this.toScreen('title');
    this.last = performance.now() / 1000;
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  // ================================================================ screens
  toScreen(name) {
    this.state = name;
    this.hud.showScreen(name);
    this.hud.showHud(false);
    this.hud.hideSwitch();
    this.hud.hideGauge();
    this.hud.hideLens();
    this.hud.setFlareRings([], null);
    this.hud.setMarkers([]);
    this.hud.setBodyMode('none');
    if (name !== 'pause') this.setBlur(0);
    this.menu = null;
    this.menuBlock = this.real + 0.45;
    this.requireRelease = this.input.down;
    this.hud.setHold(0);
    this.sfx.setCharge(0, false);
    this.sfx.setPump(0, false);
    this.sfx.setSpin(1, false);
    this.sfx.setShield(false);
    this.world.setShield(0, 1);
    this.world.setFlares([]);
    this.world.setOrbitRing(null);
  }

  setBlur(px) {
    const v = Math.round(px * 4) / 4;
    if (v === this.blurPx) return;
    this.blurPx = v;
    this.canvas.style.filter = v > 0 ? `blur(${v}px)` : '';
  }

  buildMap() {
    const grid = this.hud.el.mapGrid;
    grid.innerHTML = '';
    this.cards = LEVELS.map((L) => {
      const embers = L.bodies.filter(b => b.type === 'ember').map(b => b.pos);
      const pc = principal(embers);
      const pts = embers.map(p => {
        const d = [p[0] - pc.c[0], p[1] - pc.c[1], p[2] - pc.c[2]];
        return [d[0] * pc.a[0] + d[1] * pc.a[1] + d[2] * pc.a[2], d[0] * pc.b[0] + d[1] * pc.b[1] + d[2] * pc.b[2]];
      });
      const sx = 64 / (Math.max(...pts.map(p => Math.abs(p[0]))) || 1);
      const sy = 30 / (Math.max(...pts.map(p => Math.abs(p[1]))) || 1);
      const P2 = pts.map(p => [80 + p[0] * sx, 48 - p[1] * Math.min(sy, sx * 1.6)]);
      const lines = L.lines.map(([a, b]) => {
        const ia = L.bodies.slice(0, a).filter(x => x.type === 'ember').length;
        const ib = L.bodies.slice(0, b).filter(x => x.type === 'ember').length;
        return `<line x1="${P2[ia][0].toFixed(1)}" y1="${P2[ia][1].toFixed(1)}" x2="${P2[ib][0].toFixed(1)}" y2="${P2[ib][1].toFixed(1)}" class="cl"/>`;
      }).join('');
      const dots = P2.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.4" class="cd"/>`).join('');
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `<svg viewBox="0 0 160 96">${lines}${dots}</svg>
        <div class="c-name">${L.name}</div><div class="c-sub">${L.subtitle}</div><div class="c-med"></div><div class="c-photos"></div>`;
      grid.appendChild(el);
      return el;
    });
    const style = document.createElement('style');
    style.textContent = `.card .cl{stroke:rgba(255,217,138,.25);stroke-width:1.4}.card .cd{fill:rgba(255,217,138,.35)}
      .card.done .cl{stroke:rgba(255,217,138,.85)}.card.done .cd{fill:#ffd98a;filter:drop-shadow(0 0 3px #ffd98a)}
      .card.sel .cd{fill:#ffd98a}`;
    document.head.appendChild(style);
  }

  refreshMap() {
    this.cards.forEach((el, i) => {
      const L = LEVELS[i];
      const best = this.save.best[L.id];
      el.classList.toggle('sel', i === this.sel);
      el.classList.toggle('locked', i >= this.save.unlocked);
      el.classList.toggle('done', !!best);
      el.querySelector('.c-med').innerHTML = best ? medalsHtml(best.medal) : i >= this.save.unlocked ? '<span class="c-lock">locked</span>' : '';
      const nSub = L.bodies.filter(b => b.type === 'subject').length;
      const got = Object.keys(this.save.photos[L.id] || {}).length;
      el.querySelector('.c-photos').textContent = nSub && i < this.save.unlocked ? `◉ photos ${got}/${nSub}` : '';
    });
    // on a phone the map scrolls: keep the selected card on screen as taps cycle it
    this.cards[this.sel]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  loadBackdrop(i) {
    const L = LEVELS[i];
    this.L = L;
    this.bodies = P.makeBodies(L);
    this.world.loadLevel(L, this.bodies);
    this.cometVisible = false;
    const embers = this.bodies.filter(b => b.ember).map(b => [b.x, b.y, b.z]);
    this.backdrop = principal(embers.concat(this.bodies.filter(b => !b.ember && b.type !== 'storm').map(b => [b.x, b.y, b.z])));
    this.backdropT = 0;
  }

  menuTap() {
    switch (this.state) {
      case 'title': this.hud.shakeKey(); break;
      case 'map':
        this.sel = (this.sel + 1) % Math.min(LEVELS.length, this.save.unlocked);
        this.sfx.ui();
        this.refreshMap();
        this.loadBackdrop(this.sel);
        break;
      case 'complete': case 'failed': this.goMap(); break;
      case 'pause': this.resume(); break;
      default: break;
    }
  }

  menuHold() {
    this.sfx.confirm();
    switch (this.state) {
      case 'title': this.goMap(); break;
      case 'map': this.startLevel(this.sel); break;
      case 'complete':
        if (this.li + 1 < LEVELS.length) { this.sel = this.li + 1; this.startLevel(this.li + 1); }
        else this.showVictory();
        break;
      case 'failed': this.startLevel(this.li); break;
      case 'pause': this.loadBackdrop(this.li); this.goMap(); break;
      case 'victory': this.goMap(); break;
      default: break;
    }
  }

  goMap() {
    this.sel = Math.min(this.sel, this.save.unlocked - 1);
    if (this.L !== LEVELS[this.sel]) this.loadBackdrop(this.sel);
    this.toScreen('map');
    this.refreshMap();
  }

  showVictory() {
    this.toScreen('victory');
    const best = Object.values(this.save.best);
    const stars = best.reduce((s, b) => s + b.medal, 0);
    const nSub = LEVELS.reduce((s, L) => s + L.bodies.filter(b => b.type === 'subject').length, 0);
    const got = Object.values(this.save.photos).reduce((s, o) => s + Object.keys(o).length, 0);
    this.hud.el.vicStats.innerHTML =
      `<div class="stat"><b>${best.length}/${LEVELS.length}</b><span>Constellations</span></div>` +
      `<div class="stat"><b>${stars}/${LEVELS.length * 3}</b><span>Medals</span></div>` +
      `<div class="stat"><b>${got}/${nSub}</b><span>Photos</span></div>`;
    this.sfx.complete();
  }

  // ================================================================ level flow
  startLevel(i) {
    this.li = i;
    this.loadBackdrop(i);
    const L = this.L;
    this.ship = P.newShip(L.start);
    this.checkpoint = { pos: [...L.start.pos], dir: [...L.start.dir], ember: -1 };
    this.light = LIGHT.start;
    this.stats = { time: 0, crashes: 0, lost: 0, perfect: 0, good: 0, sputter: 0, blocked: 0, hits: 0 };
    this.photos = [];
    this.progress = -1;  // index of the last route stop done (kindled star or spindle used)
    this.embers = this.bodies.filter(b => b.ember);
    this.subjects = this.bodies.filter(b => b.type === 'subject');
    this.lit = 0;
    this.charging = false;
    this.active = false;
    this.farT = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.cometVisible = true;
    this.prev = [this.ship.px, this.ship.py, this.ship.pz];
    this.state = 'play';
    this.hud.showScreen('intro');
    this.hud.el.introKicker.textContent = `Constellation ${i + 1} of ${LEVELS.length}`;
    this.hud.el.introName.textContent = L.name;
    this.hud.el.introSub.textContent = L.subtitle;
    this.hud.el.introText.textContent = L.intro;
    this.hud.showHud(true);
    this.hud.setLevel(L.name, this.embers.length, 0);
    this.hud.hint(null);
    this.hud.hideGauge();
    this.hud.hideLens();
    this.introCam = this.makeIntroCam();
    this.setMode('intro');
    this.world.rig.snap(this.viewState());
  }

  makeIntroCam() {
    const s = this.ship;
    const d = new THREE.Vector3(s.vx, s.vy, s.vz).normalize();
    const p = new THREE.Vector3(s.px, s.py, s.pz);
    return {
      pos: p.clone().addScaledVector(d, -46).add(new THREE.Vector3(14, 26, 0)),
      look: p.clone().addScaledVector(d, 70),
      up: new THREE.Vector3(0, 1, 0),
    };
  }

  setMode(m, opts = {}) {
    const prev = this.mode;
    this.mode = m;
    this.modeT = 0;
    const info = MODE_INFO[m];
    // Leaving flight always drops any charge – it can never carry over.
    if (prev === 'flight' && m !== 'flight') {
      if (this.charging || this.ship.charge > 0.05) {
        this.sfx.vent();
        this.world.particles.burst(this.ship.px, this.ship.py, this.ship.pz, 40, 18, COLORS.cyan, 0.8, 0.8);
      }
      this.charging = false;
      this.ship.charge = 0;
    }
    this.pumping = false;
    this.active = false;
    this.hud.setBodyMode(info.cls);
    this.hud.setMode(info.name, info.desc);
    this.hud.setModeInfo('');
    this.waiting = false;
    if (m.startsWith('to')) {
      const target = m.slice(2).toLowerCase();
      if (target === 'flight') {
        this.gapDur = opts.dur ?? 0;
        this.gapSource = opts.source || 'frozen';
        this.gapFrom = opts.from || null;
        this.hud.showScreen(null);
      } else {
        this.gapDur = ENTER_GAP[target];
      }
      this.gapT = 0;
      this.armed = false;
      this.showSwitchCard(target, opts);
      this.sfx[SWITCH[target][3]]();
      if (target !== 'flight') this.hud.flash();
      return;
    }
    switch (m) {
      case 'flight': case 'kindle': case 'sling': case 'shield': case 'lens':
        this.hud.hideSwitch();
        // A Shift still held from before does nothing until released.
        this.requireRelease = this.input.down;
        this.sfx.live();
        this.onLive(m);
        break;
      case 'outro':
        this.hud.hideSwitch();
        this.hud.hideGauge();
        this.hud.hint(null);
        break;
      default:
        this.hud.hideSwitch();
    }
  }

  onLive(m) {
    if (m === 'flight' && this.li === 0) {
      if (this.lit === 0) this.showHint('drift', 'You drift in a straight line. No Shift, no gravity.<br>Fly into the <span class="amb">amber ring</span> of the star marked <span class="amb">NEXT</span>.', 0);
      else if (!this.seen.has('borrow')) this.showHint('borrow', 'Near a planet, <b>hold Shift</b> to borrow its gravity.<br>The bright path shows where you go <b>if you let go now</b>.', 0);
    }
    const first = {
      kindle: '<b>Hold Shift</b> to pump light into the star.<br><b>Release</b> while the needle is inside the amber band.',
      sling: '<b>Tap Shift</b> when the violet line points into the ring marked <span class="amb">NEXT</span>.<br>Or <b>hold</b> to spin up first (faster launch), then let go.',
      shield: 'When a red ring closes in on you, <b>hold Shift</b> to raise the shield.<br>It drains fast — raise it just in time.',
      lens: '<b>Hold Shift</b> to focus, <b>let go</b> to take the photo —<br>when the view is sharp and the sight sits in the circle.',
    }[m];
    if (first && !this.seen.has(m)) this.showHint(m, first, m === 'kindle' ? 0 : 7);
  }

  showHint(key, html, secs) {
    this.seen.add(key);
    this.hintKey = key;
    this.hud.hint(html, secs);
  }
  clearHint(key) {
    if (this.hintKey === key) { this.hud.hint(null); this.hintKey = null; }
  }

  // ================================================================ input
  handleInput() {
    for (const ev of this.input.drain()) {
      if (ev === 'blur' || ev === 'pause') {
        if (this.state === 'play' && this.mode !== 'outro') this.pause();
        else if (ev === 'pause' && this.state === 'pause') this.resume();
        continue;
      }
      if (ev === 'press') this.sfx.init();
      if (this.state === 'play') this.playInput(ev);
      else this.menuInput(ev);
    }
  }

  menuInput(ev) {
    if (ev === 'press') {
      this.hud.setPressing(true);
      if (this.requireRelease || this.real < this.menuBlock) return;
      this.menu = { t0: this.real, fired: false };
    } else {
      this.hud.setPressing(false);
      if (this.requireRelease) { this.requireRelease = false; this.menu = null; return; }
      if (ev === 'release' && this.menu && !this.menu.fired) this.menuTap();
      this.menu = null;
      this.hud.setHold(0);
    }
  }

  playInput(ev) {
    const m = this.mode;
    if (ev === 'press') {
      if (this.requireRelease) return;
      if (m === 'flight') {
        this.charging = true;
        if (this.ship.targetId < 0 && !this.seen.has('nograv')) {
          this.showHint('nograv', 'No gravity in range. Get closer to a planet — its <span class="cy">dashed cyan ring</span> shows its reach.', 4);
        }
      } else if (m === 'kindle') {
        if (!this.draining) this.pumping = true;
      } else if (SPECIAL.has(m)) {
        this.active = true;
      } else if (m.startsWith('to')) {
        // a hand-over: this tap starts the next mode and does nothing else
        if (!this.armed) {
          this.armed = true;
          this.requireRelease = true;
          this.sfx.ui();
        }
      } else if (m === 'intro') {
        this.requireRelease = true;
        this.levelStartCard();
      } else {
        // locked (crashed / lost): tell the player, loudly but harmlessly
        this.hud.shakeKey();
        this.sfx.locked();
      }
    } else if (ev === 'release' || ev === 'cancel') {
      if (this.requireRelease) { this.requireRelease = false; return; }
      const cancel = ev === 'cancel';
      if (m === 'flight' && this.charging) {
        this.charging = false;
        if (cancel) { this.ship.charge = 0; return; }
        this.releaseGravity();
      } else if (m === 'kindle' && this.pumping) {
        this.pumping = false;
        if (!cancel) this.judgeKindle();
      } else if (SPECIAL.has(m) && this.active) {
        this.active = false;
        if (cancel) return;
        if (m === 'sling') this.launchSling(false);
        else if (m === 'lens') this.shutter();
      }
    }
  }

  releaseGravity() {
    const s = this.ship;
    const c = s.charge;
    const tgt = s.targetId >= 0 ? this.bodies[s.targetId] : null;
    const pulse = P.release(s);
    if (!pulse || !tgt) { this.sfx.fizzle(); return; }
    this.sfx.release(c);
    this.world.rig.kick = 0.25 + 0.6 * c;
    this.world.addShock(s.px, s.py, s.pz, COLORS.cyan, 6 + 10 * c, 0.6);
    const dx = tgt.x - s.px, dy = tgt.y - s.py, dz = tgt.z - s.pz;
    const d = Math.hypot(dx, dy, dz) || 1;
    const k = tgt.pull < 0 ? -20 : 20;
    this.world.particles.burst(s.px, s.py, s.pz, 30 + 50 * c, 14, COLORS.cyan, 0.9, 0.9, { x: dx / d * k, y: dy / d * k, z: dz / d * k });
    if (this.hintKey === 'borrow') {
      this.showHint('aim', 'The pull curves you toward the planet.<br>Aim the path into the next star’s ring. The <b>faint</b> path shows a full charge.', 7);
    }
  }

  enterZone(mode, b) {
    this.ship.pulses.length = 0;
    this.zb = b;
    this.clearHint('drift'); this.clearHint('aim'); this.clearHint('borrow');
    if (mode === 'kindle') this.enterKindle(b);
    else if (mode === 'sling') this.enterSling(b);
    else if (mode === 'shield') this.enterShield(b);
    else this.enterLens(b);
  }

  // ================================================================ KINDLE
  enterKindle(b) {
    const s = this.ship;
    this.kb = b;
    this.orbit = P.makeKindleOrbit(s, b);
    this.orbitF = 0;
    this.orbitRate = 0.58 / (KINDLE.enterGap + KINDLE.window);
    this.gauge = 0;
    this.draining = false;
    this.kTime = 0;
    this.kMsg = 'get ready';
    // cinematic camera: outside the loop, on the side the chase camera was on
    const o = this.orbit;
    const C = new THREE.Vector3(o.cx, o.cy, o.cz);
    const n = V3(o.n);
    if (this.world.camera.position.clone().sub(C).dot(n) < 0) n.negate();
    const dir = n.multiplyScalar(0.9).addScaledVector(V3(o.u), 0.45).add(new THREE.Vector3(0, 0.25, 0)).normalize();
    this.kCam = { pos: C.clone().addScaledVector(dir, o.Rc * 2.9), look: C.clone(), up: new THREE.Vector3(0, 1, 0) };
    this.hud.showGauge(b.name);
    this.setMode('toKindle');
  }

  judgeKindle() {
    const band = P.bandAt(this.kb.band, this.kTime);
    const g = this.gauge;
    if (g >= band.lo && g <= band.hi) {
      this.finishKindle(Math.abs(g - band.center) <= band.perfect ? 'perfect' : 'good');
    } else this.kindleMiss(g > band.hi);
  }

  kindleMiss(over) {
    this.sfx.miss(over);
    this.kMsg = over ? 'too much — again' : 'too soft — again';
    this.draining = true;
    this.pumping = false;
    if (over && this.input.down) this.requireRelease = true;
  }

  finishKindle(result) {
    const b = this.kb;
    P.lightEmber(b);
    this.world.igniteEmber(b.id);
    this.world.setEmberHeat(b.id, 0);
    this.stats[result]++;
    this.light = Math.min(100, this.light + LIGHT[result]);
    if (result === 'sputter') {
      this.sfx.sputter();
      this.hud.toast('Sputtered alight', 'var(--amber)');
    } else {
      this.sfx.ignite(result === 'perfect');
      this.hud.toast(result === 'perfect' ? 'Perfect' : 'Kindled', result === 'perfect' ? '#fff' : 'var(--gold)');
      this.hud.flash();
    }
    this.clearHint('kindle');
    this.lit++;
    this.progress = Math.max(this.progress, b.id);
    this.hud.setLevel(this.L.name, this.embers.length, this.lit);
    for (const [a, c] of this.L.lines) {
      if ((a === b.id && this.bodies[c].lit) || (c === b.id && this.bodies[a].lit)) this.world.addLine(a, c);
    }
    this.checkpoint = { pos: [...this.orbit.E], dir: [...this.orbit.h], ember: b.id };
    this.pumping = false;
    this.hud.hideGauge();
    if (this.lit >= this.embers.length) {
      this.startOutro();
      return;
    }
    const remainArc = (1 - this.orbitF) * this.orbit.total * this.orbit.Rc;
    const dur = Math.max(KINDLE.exitGap, Math.min(1.8, remainArc / 70));
    this.orbitRate = (1 - this.orbitF) / dur;
    this.setMode('toFlight', { dur, source: 'orbit', from: 'kindle' });
  }

  // ================================================================ SLING
  enterSling(b) {
    const s = this.ship;
    this.sling = P.makeSlingOrbit(s, b);
    this.slT = 0;
    // camera above the orbit plane, travel direction pointing "up" on screen
    const o = this.sling;
    const C = new THREE.Vector3(o.cx, o.cy, o.cz);
    const n = V3(o.n);
    const up = new THREE.Vector3(s.vx, s.vy, s.vz).normalize();
    if (this.world.camera.position.clone().sub(C).dot(n) < 0) n.negate();
    this.slCam = {
      pos: C.clone().addScaledVector(n, b.zone * 4.8).addScaledVector(up, -b.zone * 0.7),
      look: C.clone().addScaledVector(up, b.zone * 0.75),
      up,
    };
    this.setMode('toSling');
  }

  stepSling(dt, holding) {
    const o = this.sling;
    P.slingStep(o, dt, holding);
    const p = P.slingPos(o), d = P.slingDir(o), sp = P.slingOrbitSpeed(o);
    const s = this.ship;
    s.px = p[0]; s.py = p[1]; s.pz = p[2];
    s.vx = d[0] * sp; s.vy = d[1] * sp; s.vz = d[2] * sp;
    this.prev = [s.px, s.py, s.pz];
    this.acc = 0;
  }

  launchSling(auto) {
    const o = this.sling;
    this.progress = Math.max(this.progress, this.zb.id);
    this.ship = P.slingLaunch(o, this.zb);
    this.prev = [this.ship.px, this.ship.py, this.ship.pz];
    this.acc = 0;
    this.sfx.launch(o.spin);
    this.world.rig.kick = 0.4 + 0.4 * (o.spin - 1);
    this.world.addShock(this.ship.px, this.ship.py, this.ship.pz, COLORS.violet, 10, 0.6);
    this.hud.toast(auto ? 'Released' : 'Launch', 'var(--violet)');
    this.clearHint('sling');
    this.world.setOrbitRing(null);
    this.setMode('toFlight', { dur: SLING.exitGap, source: 'live', from: 'sling' });
  }

  updateSling(dt) {
    this.slT += dt;
    this.light -= LIGHT.drain * dt;
    this.stepSling(dt, this.active && !this.requireRelease);
    const left = SLING.window - this.slT;
    this.hud.setModeInfo(`launch ×${this.sling.spin.toFixed(1)} · auto-release ${Math.max(0, left).toFixed(1)}s`);
    if (left <= 0) this.launchSling(true);
  }

  // ================================================================ SHIELD
  enterShield(b) {
    this.src = b.def.from != null ? this.bodies[b.def.from] : null;
    this.sh = { energy: 1, up: false, amt: 0, flares: [], next: 0.7, t: 0, rate: b.def.rate || 1.1 };
    this.setMode('toShield');
  }

  updateShield(dt) {
    const sh = this.sh, s = this.ship, b = this.zb;
    sh.t += dt;
    this.light -= LIGHT.drain * dt;
    // raise / lower – energy drains while up
    const want = this.active && !this.requireRelease;
    if (want && sh.energy > (sh.up ? 0 : SHIELD.minRaise)) {
      sh.up = true;
      sh.energy -= SHIELD.drain * dt;
      if (sh.energy <= 0) {
        sh.energy = 0; sh.up = false; this.active = false;
        this.requireRelease = this.input.down;
        this.hud.toast('Shield drained', 'var(--green)');
      }
    } else {
      sh.up = false;
      sh.energy = Math.min(1, sh.energy + SHIELD.regen * dt);
    }
    // time until we leave the storm (straight line)
    const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
    const hx = s.vx / sp, hy = s.vy / sp, hz = s.vz / sp;
    const ox = s.px - b.x, oy = s.py - b.y, oz = s.pz - b.z;
    const bb = hx * ox + hy * oy + hz * oz, cc = ox * ox + oy * oy + oz * oz - b.zone * b.zone;
    const remain = (-bb + Math.sqrt(Math.max(0, bb * bb - cc))) / sp;
    // new flares
    if (sh.t >= sh.next && remain > SHIELD.warn + 0.4) {
      const src = this.src;
      const o = src ? src.radius : 0;
      const from = src
        ? [src.x + (Math.random() - 0.5) * o, src.y + (Math.random() - 0.5) * o, src.z + (Math.random() - 0.5) * o]
        : [b.x + 200, b.y + 80, b.z];
      sh.flares.push({ from, spawn: sh.t, hit: sh.t + SHIELD.warn, done: false });
      sh.next = sh.t + sh.rate * (0.7 + Math.random() * 0.6);
      this.sfx.flareWarn();
    }
    // resolve hits
    for (const f of sh.flares) {
      if (f.done || sh.t < f.hit) continue;
      f.done = true;
      f.doneT = sh.t;
      if (sh.up) {
        this.stats.blocked++;
        this.sfx.blocked();
        this.world.particles.burst(s.px, s.py, s.pz, 50, 26, COLORS.green, 0.9, 0.7);
        this.world.addShock(s.px, s.py, s.pz, COLORS.green, 6, 0.4);
      } else {
        this.stats.hits++;
        this.light -= LIGHT.flare;
        this.sfx.zap();
        this.world.rig.shake = Math.max(this.world.rig.shake, 0.7);
        this.world.particles.burst(s.px, s.py, s.pz, 70, 30, COLORS.storm, 1.1, 0.9);
        this.hud.toast('Flare hit', 'var(--red)');
      }
    }
    sh.flares = sh.flares.filter(f => !f.done || sh.t - f.doneT < 0.3);
    this.hud.setModeInfo(`shield ${Math.round(sh.energy * 100)}% · blocked ${this.stats.blocked}`);
    if (Math.hypot(ox, oy, oz) > b.zone) this.endShield();
  }

  endShield() {
    const total = this.stats.blocked + this.stats.hits;
    this.sh.up = false;
    this.sh.flares = [];
    this.world.setFlares([]);
    this.hud.setFlareRings([], null);
    if (total) this.hud.toast(`Storm passed`, 'var(--green)');
    this.clearHint('shield');
    this.setMode('toFlight', { dur: SHIELD.exitGap, source: 'live', from: 'shield' });
  }

  shieldVisuals() {
    const sh = this.sh;
    if (!sh || !(this.mode === 'shield' || this.mode === 'toShield')) {
      this.world.setShield(0, 1);
      this.world.setFlares([]);
      this.hud.setFlareRings([], null);
      this.sfx.setShield(false);
      return;
    }
    sh.amt += ((sh.up ? 1 : 0) - sh.amt) * Math.min(1, 0.016 * 25);
    this.world.setShield(sh.amt, sh.energy);
    this.sfx.setShield(sh.up);
    const s = this.ship;
    const list = [], rings = [];
    const cam = this.world.camera;
    const W = window.innerWidth, H = window.innerHeight;
    const sp = this.tmpV.set(s.px, s.py, s.pz).project(cam);
    const sx = (sp.x * 0.5 + 0.5) * W, sy = (-sp.y * 0.5 + 0.5) * H;
    for (const f of sh.flares) {
      if (f.done) continue;
      const tl = f.hit - sh.t;
      const b = [s.px + s.vx * tl, s.py + s.vy * tl, s.pz + s.vz * tl];
      const bolt = tl < 0.28 ? 1 - tl / 0.28 : -1;
      list.push({ a: f.from, b, warn: 1 - tl / SHIELD.warn, bolt });
      rings.push({ x: sx, y: sy, scale: 1 + 3.2 * Math.max(0, tl) / SHIELD.warn, near: tl < 0.22 });
    }
    this.world.setFlares(list);
    this.hud.setFlareRings(rings, this.mode === 'shield' ? { x: sx, y: sy } : null);
  }

  // ================================================================ LENS
  enterLens(b) {
    this.ln = { f: 0, t: 0, ph: Math.random() * 6, ticks: 0, frame: 0, sharp: 0 };
    this.hud.showLens(b.def.name || 'A rare sight', b.def.focus ?? 0.65);
    this.setMode('toLens');
  }

  lensSway(t) {
    const ph = this.ln.ph;
    const yaw = LENS.sway * (0.7 * Math.sin(t * 1.15 + ph) + 0.3 * Math.sin(t * 2.3 + ph * 2));
    const pitch = LENS.sway * 0.65 * (0.6 * Math.sin(t * 0.85 + ph * 3) + 0.4 * Math.sin(t * 1.9));
    return [yaw, pitch];
  }

  updateLens(dt) {
    const ln = this.ln, b = this.zb;
    ln.t += dt;
    const target = b.def.focus ?? 0.65;
    if (this.active && !this.requireRelease) {
      ln.f = Math.min(1.5, ln.f + LENS.focusRate * dt);
      const k = Math.floor(ln.f * 10);
      if (k !== ln.ticks) { ln.ticks = k; this.sfx.focusTick(); }
    }
    const [yaw, pitch] = this.lensSway(this.now);
    ln.frame = Math.max(0, Math.min(1, 1 - Math.hypot(yaw, pitch) / (LENS.sway * 1.05)));
    ln.sharp = Math.max(0, Math.min(1, 1 - Math.abs(ln.f - target) / 0.3));
    const status = !this.active ? (ln.f > 0 ? 'hold to refocus' : 'hold Shift to focus')
      : ln.sharp > 0.85 && ln.frame > 0.7 ? 'now!' : ln.sharp > 0.85 ? 'sharp — wait for the frame' : ln.f > target ? 'too far' : 'focusing…';
    this.hud.updateLens(ln.f, status);
    this.hud.setModeInfo(`${b.def.name || 'sight'} · ${Math.max(0, LENS.window - ln.t).toFixed(1)}s`);
    const out = Math.hypot(this.ship.px - b.x, this.ship.py - b.y, this.ship.pz - b.z) > b.zone;
    if (ln.t >= LENS.window || out) this.endLens(null);
  }

  shutter() {
    const ln = this.ln, b = this.zb;
    const score = 0.5 * ln.frame + 0.5 * ln.sharp;
    const stars = score >= 0.85 ? 3 : score >= 0.6 ? 2 : 1;
    this.light = Math.min(100, this.light + 6 + 14 * score);
    this.sfx.shutter();
    this.hud.flash();
    this.pendingCapture = { blur: this.blurPx, name: b.def.name || 'A rare sight', stars, id: b.id };
    this.endLens(stars);
  }

  endLens(stars) {
    const b = this.zb;
    b.done = true;
    if (stars == null) this.hud.toast('Missed the shot', 'var(--pink)');
    this.clearHint('lens');
    this.hud.hideLens();
    this.setMode('toFlight', { dur: LENS.exitGap, source: 'live', from: 'lens' });
  }

  storePhoto(img) {
    const c = this.pendingCapture;
    this.pendingCapture = null;
    this.photos.push({ img, name: c.name, stars: c.stars });
    this.hud.showPhoto(img, c.name, c.stars);
    const lv = this.save.photos[this.L.id] || (this.save.photos[this.L.id] = {});
    if (!lv[c.id] || lv[c.id].stars <= c.stars) lv[c.id] = { img, name: c.name, stars: c.stars };
    writeSave(this.save);
  }

  // ================================================================ mishaps
  crash(body) {
    const s = this.ship;
    this.stats.crashes++;
    this.light -= LIGHT.crash;
    this.sfx.crash();
    this.world.particles.burst(s.px, s.py, s.pz, 220, 40, COLORS.cyan, 1.2, 1.6);
    this.world.particles.burst(s.px, s.py, s.pz, 80, 25, COLORS.red, 1.6, 1.2);
    this.world.addShock(s.px, s.py, s.pz, COLORS.red, 20, 0.8);
    this.world.rig.shake = 1.1;
    this.cometVisible = false;
    this.hud.toast(body.type === 'blackhole' ? 'Swallowed' : 'Shattered', 'var(--red)');
    this.setMode('crashed');
    if (!this.seen.has('crash')) this.showHint('crash', 'A <span style="color:var(--red)">red</span> path end means impact.<br>Let go at another moment, or charge less.', 6);
  }

  getLost() {
    this.stats.lost++;
    this.light -= LIGHT.lost;
    this.sfx.lost();
    this.hud.toast('Lost in the void', 'var(--dim)');
    this.cometVisible = false;
    this.world.particles.burst(this.ship.px, this.ship.py, this.ship.pz, 60, 10, COLORS.cyan, 0.8, 1.2);
    this.setMode('lost');
    if (!this.seen.has('lost')) this.showHint('lost', 'Drifted too far from every gravity well. You return to the last star you kindled.', 5);
  }

  respawn() {
    if (this.light <= 0) { this.failLevel(); return; }
    const cp = this.checkpoint;
    this.ship = P.newShip({ pos: cp.pos, dir: cp.dir });
    if (cp.ember >= 0) this.ship.ignore = [cp.ember];
    this.progress = cp.ember;
    this.prev = [this.ship.px, this.ship.py, this.ship.pz];
    this.cometVisible = true;
    this.farT = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.sfx.respawn();
    this.world.particles.burst(cp.pos[0], cp.pos[1], cp.pos[2], 60, 12, COLORS.white, 0.8, 0.8);
    this.world.rig.snap(this.viewState());
    this.setMode('toFlight', { source: 'frozen', sub: cp.ember >= 0 ? 'Back at the last star you kindled' : 'Back at the start' });
  }

  failLevel() {
    this.sfx.fail();
    this.toScreen('failed');
  }

  startOutro() {
    const pts = this.embers.map(b => [b.x, b.y, b.z]);
    const pc = principal(pts);
    const C = V3(pc.c);
    const n = V3(pc.n);
    if (n.dot(this.world.camera.position.clone().sub(C)) < 0) n.negate();
    this.outroCam = {
      pos: C.clone().addScaledVector(n, pc.r * 2.1 + 40).add(new THREE.Vector3(0, pc.r * 0.25, 0)),
      look: C,
      up: new THREE.Vector3(0, 1, 0),
    };
    this.sfx.complete();
    this.setMode('outro');
  }

  completeLevel() {
    const L = this.L;
    const medal = this.light >= 60 ? 3 : this.light >= 30 ? 2 : 1;
    const prev = this.save.best[L.id];
    if (!prev || medal > prev.medal || (medal === prev.medal && this.stats.time < prev.time)) {
      this.save.best[L.id] = { medal, time: Math.round(this.stats.time * 10) / 10 };
    }
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(LEVELS.length, this.li + 2));
    writeSave(this.save);
    this.toScreen('complete');
    this.hud.el.resName.textContent = L.name;
    this.hud.el.resMedals.innerHTML = medalsHtml(medal);
    const st = this.stats;
    const stats = [
      [Math.max(0, Math.round(this.light)), 'Light left'],
      [`${st.time.toFixed(1)}s`, 'Time'],
      [`${st.perfect}/${this.embers.length}`, 'Perfect kindles'],
      [st.crashes + st.lost, 'Mishaps'],
    ];
    if (st.blocked + st.hits) stats.push([`${st.blocked}/${st.blocked + st.hits}`, 'Flares blocked']);
    if (this.subjects.length) stats.push([`${this.photos.length}/${this.subjects.length}`, 'Photos']);
    this.hud.el.resStats.innerHTML = stats.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
    this.hud.el.resPhotos.innerHTML = this.photos.map(p =>
      `<figure><img src="${p.img}" alt=""><figcaption>${p.name}<span>${'★'.repeat(p.stars)}</span></figcaption></figure>`).join('');
    this.hud.el.resHelp.innerHTML = this.li + 1 < LEVELS.length
      ? '<span class="k">hold</span> next constellation <span class="sep">·</span> <span class="k">tap</span> sky map'
      : '<span class="k">hold</span> finish <span class="sep">·</span> <span class="k">tap</span> sky map';
  }

  pause() {
    this.charging = false;
    this.pumping = false;
    this.active = false;
    if (this.ship) this.ship.charge = 0;
    this.toScreen('pause');
  }

  resume() {
    const m = this.mode;
    this.state = 'play';
    this.hud.showScreen(m === 'intro' ? 'intro' : null);
    this.hud.showHud(true);
    this.hud.setBodyMode(MODE_INFO[m].cls);
    if (m.startsWith('to')) this.hud.showSwitch(...this.card);
    if (m === 'kindle' || m === 'toKindle') this.hud.showGauge(this.kb.name);
    if (m === 'lens' || m === 'toLens') this.hud.showLens(this.zb.def.name || 'A rare sight', this.zb.def.focus ?? 0.65);
    if (m === 'flight') this.setMode('toFlight', { source: 'frozen', sub: 'Paused mid-flight. You fly on when you tap.' });
    else this.requireRelease = this.input.down;
  }

  // ================================================================ per frame
  frame(tms) {
    requestAnimationFrame(this.frame);
    const t = tms / 1000;
    let dt = t - this.last;
    this.last = t;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);
    this.now += dt;
    this.real = t;
    this.frames = (this.frames || 0) + 1;
    this.handleInput();

    if (this.state === 'play') this.updatePlay(dt);
    else this.updateMenu(dt);
    // A lone Shift press does not count as a user gesture for browser audio.
    const audioOn = !!(this.sfx.ctx && this.sfx.ctx.state === 'running');
    if (this.soundNote.hidden !== audioOn) this.soundNote.hidden = audioOn;

    this.hud.tick(dt);
    this.world.update(dt, this.viewState());
    if (this.state === 'play') {
      this.updateMarkers();
      this.shieldVisuals();
    }
    this.world.render();
    if (this.pendingCapture) this.storePhoto(this.world.capture(this.pendingCapture.blur));
  }

  updateMenu(dt) {
    if (this.menu && !this.menu.fired && this.input.down) {
      const p = (this.real - this.menu.t0) / MENU_HOLD;
      this.hud.setHold(Math.min(1, p));
      if (p >= 1) {
        this.menu.fired = true;
        this.hud.setHold(0);
        this.menuHold();
      }
    }
    this.backdropT += dt;
    this.world.setPreview(null);
    this.world.setTether(0, 0, 0, null);
  }

  // ================================================================ hand-overs
  // A switch between Shift functions. The hand-over motion plays first (the catch
  // into an orbit, the ride to a kindled star's exit lane, or a short straight
  // coast with zones off); then time holds until the player taps Shift. Waiting
  // costs nothing: no light drain, the clock stops, nothing can hit you.
  updateGap(dt) {
    const m = this.mode;
    const target = m.slice(2).toLowerCase();
    const left = this.gapDur - this.gapT;
    if (left > 0) {
      // once the player has tapped, the ride round to the exit lane hurries up
      const step = Math.min(left, dt * (this.armed && this.gapSource === 'orbit' ? 2.5 : 1));
      this.gapT += step;
      if (m === 'toKindle' || (m === 'toFlight' && this.gapSource === 'orbit')) this.advanceOrbit(step);
      else if (m === 'toSling') this.stepSling(step, false);
      else if (COASTING.has(m) || (m === 'toFlight' && this.gapSource === 'live')) this.coast(step);
      if (this.mode !== m) return; // crashed while coasting
    } else if (m === 'toSling') {
      // the spindle keeps turning you: watch the launch line sweep before you start
      this.stepSling(dt, false);
    }
    const moving = this.gapT < this.gapDur;
    const safe = this.modeT >= SAFE;
    this.waiting = !moving && !this.armed;
    if (m === 'toKindle') this.updateGaugeView(true);
    if (m === 'toLens') this.updateLensView();
    const note = this.armed ? 'Starting…'
      : this.input.down ? 'Let go of Shift, then tap to start'
      : safe ? 'Tap Shift when you’re ready' : 'Get ready…';
    const state = this.armed ? 'go' : this.input.down ? 'warn' : safe ? 'ready' : '';
    this.hud.updateSwitch(Math.min(1, this.modeT / SAFE), note, state);
    if (this.armed && safe && !moving) this.goLive(target);
  }

  goLive(target) {
    if (target !== 'flight') { this.setMode(target); return; }
    if (this.gapSource === 'orbit') {
      this.ship = P.newShip({ pos: this.orbit.E, dir: this.orbit.h });
      this.ship.ignore = [this.kb.id];
      this.prev = [this.ship.px, this.ship.py, this.ship.pz];
      this.acc = 0;
    }
    this.farT = 0;
    this.setMode('flight');
  }

  // the switch card: full how-to for the first few times each mode comes up
  showSwitchCard(target, opts = {}) {
    const [title, sub, col] = SWITCH[target];
    const seen = this.save.howto[target] || 0;
    const how = seen < HOWTO_VIEWS ? HOWTO[target] : null;
    this.save.howto[target] = seen + 1;
    writeSave(this.save);
    this.card = [title, opts.sub || sub, col, how, opts.kicker];
    this.hud.showSwitch(...this.card);
  }

  levelStartCard() {
    this.setMode('toFlight', { source: 'frozen', kicker: `Constellation ${this.li + 1} · ${this.L.name}`, sub: this.L.intro });
  }

  // straight coasting (shield, lens, and the hand-over after a launch): zones off
  coast(dt) {
    this.acc += dt * this.timeScale;
    const s = this.ship;
    while (this.acc >= PHYS.dt) {
      this.acc -= PHYS.dt;
      this.prev[0] = s.px; this.prev[1] = s.py; this.prev[2] = s.pz;
      const ev = P.stepShip(s, this.bodies, PHYS.dt, false, false);
      if (ev && ev.type === 'crash') { this.crash(ev.body); return; }
    }
  }

  updatePlay(dt) {
    const m = this.mode;
    this.modeT += dt;
    if (m !== 'outro' && m !== 'intro' && !this.waiting) this.stats.time += dt;  // reading a card is free
    // LENS slows the spark down; everything else runs at full speed
    const wantScale = m === 'lens' || m === 'toLens' ? LENS.slow : 1;
    this.timeScale += (wantScale - this.timeScale) * Math.min(1, dt * 2.5);

    if (m.startsWith('to')) {
      this.updateGap(dt);
      if (this.mode !== m) return;
    } else {
      switch (m) {
        case 'intro':
          if (this.modeT > INTRO_TIME) this.levelStartCard();
          break;
        case 'flight': this.updateFlight(dt); break;
        case 'kindle': this.updateKindle(dt); break;
        case 'sling': this.updateSling(dt); break;
        case 'shield': this.coast(dt); if (this.mode === 'shield') this.updateShield(dt); break;
        case 'lens': this.coast(dt); if (this.mode === 'lens') { this.updateLens(dt); this.updateLensView(); } break;
        case 'crashed': if (this.modeT > 1.4) this.respawn(); break;
        case 'lost': if (this.modeT > 1.3) this.respawn(); break;
        case 'outro':
          this.advanceOrbit(dt * 0.6);
          if (this.modeT > OUTRO_TIME) this.completeLevel();
          break;
        default: break;
      }
    }
    if (this.state !== 'play') return;
    if (this.light <= 0 && (this.mode === 'sling' || this.mode === 'shield')) { this.light = 0; this.failLevel(); return; }
    if (!(this.mode === 'lens' || this.mode === 'toLens' || (this.mode === 'toFlight' && this.gapFrom === 'lens' && this.modeT < 0.5))) this.setBlur(0);

    // HUD key + light
    const info = MODE_INFO[this.mode];
    const gap = info.cls === 'ready';
    const locked = info.cls === 'lock' || (gap ? this.modeT < SAFE : this.requireRelease);
    let label = this.requireRelease && info.cls !== 'lock' && !gap ? 'Release Shift first' : info.key;
    let fill = 0;
    if (gap) {
      label = this.armed ? 'Starting…' : this.input.down ? 'Let go, then tap' : this.modeT < SAFE ? 'Get ready' : 'Tap to start';
      fill = Math.min(1, this.modeT / SAFE);
    }
    switch (this.mode) {
      case 'flight':
        fill = this.ship.charge;
        if (!this.requireRelease && this.ship.targetId < 0) label = 'No gravity in range';
        break;
      case 'kindle': fill = this.gauge / 1.2; break;
      case 'sling': fill = (this.sling.spin - 1) / (SLING.maxSpin - 1); break;
      case 'shield': fill = this.sh.energy; if (this.sh.energy < SHIELD.minRaise && !this.sh.up) label = 'Recharging…'; break;
      case 'lens': fill = Math.min(1, this.ln.f / 1.4); break;
      default: break;
    }
    this.hud.setKey(this.input.down, locked, fill, label, gap && !this.armed && !this.input.down && this.modeT >= SAFE);
    this.hud.setLight(this.light);
    this.sfx.setCharge(this.ship.charge, this.mode === 'flight' && this.charging);
    this.sfx.setPump(this.gauge || 0, this.mode === 'kindle' && this.pumping);
    this.sfx.setSpin(this.sling ? this.sling.spin : 1, this.mode === 'sling');

    // previews
    const s = this.ship;
    if (this.mode === 'flight' && this.cometVisible) {
      const tgt = s.targetId >= 0 ? this.bodies[s.targetId] : null;
      if (tgt) {
        let r = null;
        if (this.charging) r = P.predict(s, this.bodies, { out: this.previewPts });
        const g = s.charge < 0.985 ? P.predict(s, this.bodies, { horizon: 5.6, out: this.ghostPts, holdUntilFull: true }) : null;
        this.world.setPreview(r && r.pts, r && r.end, s.charge, g && g.pts, g && g.end, !!g);
        this.previewEnd = r && r.end ? (r.end.mode || r.end.type) : null;
      } else this.world.setPreview(null);
      const ip = this.interp();
      this.world.setTether(ip[0], ip[1], ip[2], tgt, s.charge, this.charging);
      this.world.setOrbitRing(null);
    } else if (this.mode === 'sling' || this.mode === 'toSling') {
      // the launch line: exactly where you go if you let go now
      const launch = P.slingLaunch(this.sling, this.zb);
      const r = P.predict(launch, this.bodies, { horizon: 4.2, out: this.previewPts, noRelease: true, lockFor: SLING.exitGap });
      const live = this.mode === 'sling';
      // brighter once the orbit has settled: while you get ready, you watch it sweep
      this.world.setPreview(r.pts, r.end, live ? 0.6 + 0.4 * (this.sling.spin - 1) : this.gapT >= this.gapDur ? 0.5 : 0.2, null, null, false, COLORS.violet);
      this.previewEnd = r.end ? (r.end.mode || r.end.type) : null;
      this.world.setOrbitRing(this.sling, P.slingRadius(this.sling));
      this.world.setTether(0, 0, 0, null);
    } else {
      this.world.setPreview(null);
      this.world.setTether(0, 0, 0, null);
      this.world.setOrbitRing(null);
    }
  }

  updateFlight(dt) {
    this.acc += dt;
    const s = this.ship;
    const before = s.targetId;
    this.flightSteps(dt);
    // the tether jumped from one body to another: make that moment impossible to miss
    if (this.mode === 'flight' && before >= 0 && s.targetId >= 0 && s.targetId !== before) this.retarget(this.bodies[s.targetId]);
  }

  retarget(b) {
    this.sfx.retarget();
    this.world.addShock(b.x, b.y, b.z, COLORS.cyan, b.radius * 2.6, 0.7);
    if (!this.seen.has('retarget')) {
      this.showHint('retarget', 'The pull <b>switched</b> to another body: the tether shows which one you borrow from.<br>Hold now and the path bends toward the new one.', 6);
    }
  }

  flightSteps() {
    const s = this.ship;
    while (this.acc >= PHYS.dt) {
      this.acc -= PHYS.dt;
      this.prev[0] = s.px; this.prev[1] = s.py; this.prev[2] = s.pz;
      const ev = P.stepShip(s, this.bodies, PHYS.dt, this.charging);
      this.light -= PHYS.dt * (LIGHT.drain + (this.charging ? LIGHT.holdDrain : 0));
      if (ev && ev.type === 'crash') { this.crash(ev.body); return; }
      if (ev && ev.type === 'zone') { this.enterZone(ev.mode, ev.body); return; }
      // lost in the void?
      this.farT = P.nearWell(s, this.bodies) ? 0 : this.farT + PHYS.dt;
      const bc = this.L.bounds.center;
      const out = Math.hypot(s.px - bc[0], s.py - bc[1], s.pz - bc[2]) > this.L.bounds.radius;
      if (this.farT > PHYS.lostTime || out) { this.getLost(); return; }
      if (this.light <= 0) { this.light = 0; this.failLevel(); return; }
    }
  }

  advanceOrbit(dt) {
    if (!this.orbit) return;
    this.orbitF = Math.min(1, this.orbitF + dt * this.orbitRate);
    const p = P.kindleOrbitPos(this.orbit, this.orbitF, [0, 0, 0]);
    const s = this.ship;
    if (dt > 0) {
      s.vx = (p[0] - s.px) / dt; s.vy = (p[1] - s.py) / dt; s.vz = (p[2] - s.pz) / dt;
    }
    s.px = p[0]; s.py = p[1]; s.pz = p[2];
    this.prev = [s.px, s.py, s.pz];
    this.acc = 0;
  }

  updateKindle(dt) {
    this.kTime += dt;
    this.advanceOrbit(dt);
    const band = this.kb.band;
    if (this.draining) {
      this.gauge -= KINDLE.drain * dt;
      if (this.gauge <= 0) {
        this.gauge = 0;
        this.draining = false;
        if (this.input.down && !this.requireRelease) this.pumping = true;
      }
    } else if (this.pumping) {
      this.gauge += band.speed * dt;
      if (this.gauge >= KINDLE.overload) this.kindleMiss(true);
    }
    if (this.pumping) this.kMsg = 'pumping…';
    this.world.setEmberHeat(this.kb.id, Math.min(1, this.gauge));
    if (this.pumping && Math.random() < 0.8) {
      const s = this.ship, b = this.kb;
      this.world.particles.emit(s.px, s.py, s.pz, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8,
        COLORS.amber, 0.9, 1.5, 2, b.x, b.y, b.z);
    }
    this.updateGaugeView(false);
    if (this.kTime >= KINDLE.window) this.finishKindle('sputter');
  }

  updateGaugeView(idle) {
    const band = P.bandAt(this.kb.band, this.kTime || 0);
    const left = idle ? 1 : 1 - this.kTime / KINDLE.window;
    this.hud.updateGauge(this.gauge || 0, band, idle ? 'get ready' : this.kMsg, left, idle);
  }

  // the viewfinder: blur follows focus, and during the lock it fades in
  updateLensView() {
    const ln = this.ln, b = this.zb;
    const target = b.def.focus ?? 0.65;
    const px = Math.min(14, Math.abs(ln.f - target) * 40);
    const k = this.mode === 'toLens' ? Math.min(1, this.modeT / this.gapDur) : 1;
    this.setBlur(px * k);
    if (this.mode === 'toLens') this.hud.updateLens(ln.f, 'get ready');
  }

  interp() {
    const s = this.ship;
    const m = this.mode;
    const smooth = m === 'flight' || COASTING.has(m) || (m === 'toFlight' && this.gapSource === 'live');
    if (!smooth) return [s.px, s.py, s.pz];
    const a = Math.min(1, this.acc / PHYS.dt);
    return [this.prev[0] + (s.px - this.prev[0]) * a, this.prev[1] + (s.py - this.prev[1]) * a, this.prev[2] + (s.pz - this.prev[2]) * a];
  }

  lensCam(cx, cy, cz) {
    const b = this.zb;
    const pos = new THREE.Vector3(cx, cy, cz);
    const to = new THREE.Vector3(b.x, b.y, b.z).sub(pos);
    const d = to.length() || 1;
    to.divideScalar(d);
    const right = new THREE.Vector3().crossVectors(to, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, to).normalize();
    const [yaw, pitch] = this.lensSway(this.now);
    const look = new THREE.Vector3(b.x, b.y, b.z).addScaledVector(right, Math.tan(yaw) * d).addScaledVector(up, Math.tan(pitch) * d);
    // frame the sight at roughly a third of the view, like a real lens would
    const fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(b.radius * 3.4 / d)), 28, 64);
    return { pos, look, up, direct: true, fov };
  }

  viewState() {
    const v = this._vs || (this._vs = {});
    if (this.state !== 'play' || !this.ship) {
      // slow orbit around the level as a menu backdrop
      const pc = this.backdrop;
      const a = (this.backdropT || 0) * 0.045;
      const C = V3(pc.c);
      const A = V3(pc.a), N = V3(pc.n);
      // result screens put their text in the lower half, so pull back a little and
      // aim below the level: the constellation then sits in the upper part of the frame
      const result = this.state === 'complete' || this.state === 'failed' || this.state === 'victory';
      const dist = pc.r * (result ? 2.3 : 1.7);
      const pos = C.clone().addScaledVector(N, Math.cos(a) * dist).addScaledVector(A, Math.sin(a) * dist).add(new THREE.Vector3(0, pc.r * 0.35, 0));
      const up = new THREE.Vector3(0, 1, 0);
      let look = C;
      let fov;
      if (result) {
        fov = 60;
        const f = C.clone().sub(pos);
        const D = f.length();
        f.divideScalar(D);
        const camUp = up.clone().addScaledVector(f, -f.y).normalize();
        look = C.clone().addScaledVector(camUp, -RESULT_LIFT * D * Math.tan(fov * Math.PI / 360));
      }
      Object.assign(v, {
        cx: pc.c[0], cy: pc.c[1], cz: pc.c[2], vx: 0, vy: 0, vz: -1,
        cometVisible: false, hideComet: false, charge: 0, charging: false, targetId: -1, focusEmber: -1, focusZone: -1, nextId: -1,
        modeColor: COLORS.cyan, cine: { pos, look, up, fov },
      });
      return v;
    }
    const s = this.ship;
    const [cx, cy, cz] = this.interp();
    const m = this.mode;
    const early = m === 'toFlight' && this.modeT < this.gapDur * 0.45;
    let cine = null;
    let lensView = false;
    if (m === 'intro') cine = this.introCam;
    else if (m === 'toKindle' || m === 'kindle' || (early && this.gapFrom === 'kindle')) cine = this.kCam;
    else if (m === 'toSling' || m === 'sling') cine = this.slCam;
    else if (m === 'toLens' || m === 'lens' || (m === 'toFlight' && this.gapFrom === 'lens' && this.modeT < 0.5)) {
      cine = this.lensCam(cx, cy, cz);
      lensView = true;
    } else if (m === 'outro') cine = this.outroCam;
    const base = m.startsWith('to') ? (m === 'toFlight' ? null : m.slice(2).toLowerCase()) : m;
    let modeColor = MODE_COL[base] || COLORS.cyan;
    if (m === 'outro') modeColor = COLORS.gold;
    const forming = (m === 'toFlight' && this.gapSource === 'frozen') || m === 'intro';
    const zoneMode = m === 'sling' || m === 'toSling' || m === 'shield' || m === 'toShield' || m === 'lens' || m === 'toLens';
    Object.assign(v, {
      cx, cy, cz, vx: s.vx, vy: s.vy, vz: s.vz,
      frozen: forming || this.waiting || m === 'crashed' || m === 'lost',
      cometVisible: this.cometVisible,
      hideComet: lensView,
      charge: m === 'flight' ? s.charge : m === 'kindle' ? Math.min(1, this.gauge) * 0.6 : m === 'sling' ? (this.sling.spin - 1) * 0.6 : 0,
      charging: m === 'flight' && this.charging,
      targetId: m === 'flight' ? s.targetId : -1,
      focusEmber: m === 'toKindle' || m === 'kindle' ? this.kb.id : -1,
      focusZone: zoneMode ? this.zb.id : -1,
      nextId: this.guideTarget()?.id ?? -1,
      modeColor,
      cometScale: forming ? 0.6 + 0.4 * Math.min(1, this.modeT / (this.gapDur || 1)) : 1,
      cine,
    });
    return v;
  }

  // Test helper (used by the automated screenshot tour): where would the
  // spark end up if nobody touched Shift?
  debugStraight() {
    const r = P.predict(this.ship, this.bodies, { noRelease: true, horizon: 8 });
    return r.end ? (r.end.mode || r.end.type) : null;
  }

  // The next stop on the level's route: the next cold star, or a spindle the
  // route swings through on the way. Bodies are listed in route order.
  nextTarget(from = this.progress) {
    const B = this.bodies;
    for (let k = from + 1; k < B.length; k++) {
      const b = B[k];
      if ((b.ember && !b.lit) || b.type === 'anchor') return b;
    }
    return this.embers.find(b => !b.lit) || null;
  }

  // what the NEXT marker and beacon point at in the current mode (null = hide them)
  guideTarget() {
    const m = this.mode;
    if (m === 'sling' || m === 'toSling') return this.nextTarget(Math.max(this.progress, this.zb.id));
    if (m === 'flight' || m === 'toFlight' || m === 'intro') return this.nextTarget();
    return null;
  }

  updateMarkers() {
    const cam = this.world.camera;
    const W = window.innerWidth, H = window.innerHeight;
    const list = [];
    const m = this.mode;
    const next = this.guideTarget();
    // while the switch card sits on the left, edge arrows stay to its right
    const M = 50, MT = 96, MB = 175;
    let ML = M;
    const card = this.hud.el.switch;
    if (next && !card.hidden) {
      const r = card.getBoundingClientRect();
      if (r.right < W * 0.5) ML = r.right + 40;
    }
    if (next) {
      cam.updateMatrixWorld();
      const s = this.ship;
      const targets = this.embers.filter(b => !b.lit);
      if (next.type === 'anchor') targets.push(next);
      if (m === 'flight') targets.push(...this.subjects.filter(b => !b.done));
      for (const b of targets) {
        const p = this.tmpV.set(b.x, b.y, b.z).applyMatrix4(cam.matrixWorldInverse);
        const subject = b.type === 'subject';
        const anchor = b.type === 'anchor';
        const isNext = b === next;
        const dist = Math.max(0, Math.hypot(b.x - s.px, b.y - s.py, b.z - s.pz) - (b.ember ? b.corona : b.zone));
        const name = subject ? `◉ ${b.def.name || 'photo'}` : anchor ? 'Spindle' : b.name;
        const label = `${isNext ? 'NEXT · ' : ''}${name} ${Math.round(dist)}`;
        const behind = p.z > 0;
        const ndc = this.tmpV.set(b.x, b.y, b.z).project(cam);
        let x = (ndc.x * 0.5 + 0.5) * W, y = (-ndc.y * 0.5 + 0.5) * H;
        const off = behind || x < ML || x > W - M || y < MT || y > H - MB;
        let angle = 0;
        if (off) {
          let dx = p.x, dy = -p.y;
          if (behind && Math.abs(dx) + Math.abs(dy) < 1e-3) dy = 1;
          const l = Math.hypot(dx, dy) || 1;
          dx /= l; dy /= l;
          const cx0 = (ML + W - M) / 2, hw = (W - M - ML) / 2;
          const cy0 = (MT + H - MB) / 2, hh = (H - MB - MT) / 2;
          const k = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
          x = cx0 + dx * k; y = cy0 + dy * k;
          angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
        }
        list.push({ x, y, off, angle, label, dist: isNext ? -1 : dist + (subject ? 1e4 : 0), subject, anchor, next: isNext });
      }
    }
    // the next stop on the route always shows (an edge arrow when off screen);
    // other stars and sights only while they're in view
    const shown = list.sort((a, b) => a.dist - b.dist).filter(mk => !mk.off || mk.next);
    // nudge labels apart so they never print on top of each other
    for (let i = 0; i < shown.length; i++) {
      for (let j = 0; j < i; j++) {
        if (Math.abs(shown[i].x - shown[j].x) < 90 && Math.abs(shown[i].y - shown[j].y) < 20) shown[i].y = shown[j].y + 20;
      }
    }
    this.hud.setMarkers(shown);
  }
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => { window.game = new Game(); });
else window.game = new Game();
