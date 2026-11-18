// Borrowed Gravity — game flow and the Shift mode state machine.
//
// Shift has exactly one meaning at any moment:
//
//   FLIGHT  ──corona──▶  [LOCK ~1.7s]  ──▶  KINDLE  ──ignite──▶  [LOCK 1.7–3s]  ──▶  FLIGHT
//   (borrow gravity)     Shift inert        (pump light)          Shift inert        (borrow gravity)
//
// Every change of meaning passes through a LOCK gap with a banner + countdown,
// a colour change (cyan → grey → amber) and its own sound. A Shift that is
// still held when a mode goes live is ignored until it is released and pressed
// again, so a press can never leak from one mode into the next.

import * as THREE from 'three';
import { LEVELS } from './levels.js';
import * as P from './physics.js';
import { World, COLORS } from './world.js';
import { Hud, medalsHtml } from './hud.js';
import { Sfx } from './audio.js';
import { createInput } from './input.js';

const { PHYS, KINDLE } = P;

const LIGHT = { start: 100, drain: 1.9, holdDrain: 0.9, crash: 25, lost: 15, sputter: 6, good: 20, perfect: 32 };
const START_GAP = 1.6;     // lock before control at level start / after respawn
const INTRO_TIME = 2.6;
const MENU_HOLD = 0.7;
const OUTRO_TIME = 4.8;

const MODE_INFO = {
  intro: { name: 'Ready', desc: 'Shift locked', cls: 'lock', key: 'Locked' },
  toFlight: { name: 'Switching', desc: 'Shift locked', cls: 'lock', key: 'Locked' },
  flight: { name: 'Flight', desc: 'Shift borrows gravity', cls: 'flight', key: 'Borrow gravity' },
  toKindle: { name: 'Switching', desc: 'Shift locked', cls: 'lock', key: 'Locked' },
  kindle: { name: 'Kindle', desc: 'Shift pumps light', cls: 'kindle', key: 'Pump light' },
  crashed: { name: 'Shattered', desc: 'Shift locked', cls: 'lock', key: 'Locked' },
  lost: { name: 'Lost', desc: 'Shift locked', cls: 'lock', key: 'Locked' },
  outro: { name: 'Complete', desc: 'Constellation relit', cls: 'none', key: '—' },
};

const SAVE_KEY = 'borrowed-gravity-v1';
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s.unlocked === 'number') return s;
  } catch { /* storage unavailable */ }
  return { unlocked: 1, best: {} };
}
function writeSave(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* ignore */ } }

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
    this.vel = new THREE.Vector3();
    this.tmpV = new THREE.Vector3();
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
    this.hud.setMarkers([]);
    this.hud.setBodyMode('none');
    this.menu = null;
    this.menuBlock = this.real + 0.45;
    this.requireRelease = this.input.down;
    this.hud.setHold(0);
    this.sfx.setCharge(0, false);
    this.sfx.setPump(0, false);
  }

  buildMap() {
    const grid = this.hud.el.mapGrid;
    grid.innerHTML = '';
    this.cards = LEVELS.map((L, i) => {
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
        <div class="c-name">${L.name}</div><div class="c-sub">${L.subtitle}</div><div class="c-med"></div>`;
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
      const best = this.save.best[LEVELS[i].id];
      el.classList.toggle('sel', i === this.sel);
      el.classList.toggle('locked', i >= this.save.unlocked);
      el.classList.toggle('done', !!best);
      el.querySelector('.c-med').innerHTML = best ? medalsHtml(best.medal) : i >= this.save.unlocked ? '<span class="c-lock">locked</span>' : '';
    });
  }

  loadBackdrop(i) {
    const L = LEVELS[i];
    this.L = L;
    this.bodies = P.makeBodies(L);
    this.world.loadLevel(L, this.bodies);
    this.cometVisible = false;
    const embers = this.bodies.filter(b => b.ember).map(b => [b.x, b.y, b.z]);
    this.backdrop = principal(embers.concat(this.bodies.filter(b => !b.ember).map(b => [b.x, b.y, b.z])));
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
    this.hud.el.vicStats.innerHTML =
      `<div class="stat"><b>${best.length}/${LEVELS.length}</b><span>Constellations</span></div>` +
      `<div class="stat"><b>${stars}/${LEVELS.length * 3}</b><span>Medals</span></div>`;
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
    this.stats = { time: 0, crashes: 0, lost: 0, perfect: 0, good: 0, sputter: 0 };
    this.embers = this.bodies.filter(b => b.ember);
    this.lit = 0;
    this.charging = false;
    this.farT = 0;
    this.acc = 0;
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
    this.hud.setBodyMode(info.cls);
    this.hud.setMode(info.name, info.desc);
    switch (m) {
      case 'intro':
        this.hud.hideSwitch();
        break;
      case 'toFlight':
        this.gapDur = opts.dur ?? KINDLE.exitGap;
        this.gapSource = opts.source || 'frozen';
        this.hud.showScreen(null);
        this.hud.showSwitch('Flight', 'Shift <b>borrows gravity</b> again', 'var(--cyan)');
        this.sfx.modeFlight();
        this.lastTick = -1;
        break;
      case 'toKindle':
        this.gapDur = KINDLE.enterGap;
        this.hud.showSwitch('Kindle', 'Shift now <b>pumps light</b> into the star', 'var(--amber)');
        this.sfx.modeKindle();
        this.hud.flash();
        this.lastTick = -1;
        break;
      case 'flight':
      case 'kindle':
        this.hud.hideSwitch();
        // A Shift still held from before does nothing until released.
        this.requireRelease = this.input.down;
        this.sfx.live();
        if (m === 'flight') this.onFlightLive();
        else this.onKindleLive();
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

  onFlightLive() {
    if (this.li === 0) {
      if (this.lit === 0) this.showHint('drift', 'You drift in a straight line. No Shift, no gravity.<br>Fly into the <span class="amb">amber ring</span> of the cold star ahead.', 0);
      else if (!this.seen.has('borrow')) this.showHint('borrow', 'Near a planet, <b>hold Shift</b> to borrow its gravity.<br>The bright path shows where you go <b>if you let go now</b>.', 0);
    }
  }
  onKindleLive() {
    if (!this.seen.has('pump')) this.showHint('pump', '<b>Hold Shift</b> to pump light into the star.<br><b>Release</b> while the needle is inside the amber band.', 0);
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
        if (!this.draining) { this.pumping = true; }
      } else {
        // locked: tell the player, loudly but harmlessly
        this.hud.shakeKey();
        this.sfx.locked();
      }
    } else if (ev === 'release' || ev === 'cancel') {
      if (this.requireRelease) { this.requireRelease = false; return; }
      if (m === 'flight' && this.charging) {
        this.charging = false;
        if (ev === 'cancel') { this.ship.charge = 0; return; }
        this.releaseGravity();
      } else if (m === 'kindle' && this.pumping) {
        this.pumping = false;
        if (ev === 'cancel') return;
        this.judgeKindle();
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
    this.world.particles.burst(s.px, s.py, s.pz, 30 + 50 * c, 14, COLORS.cyan, 0.9, 0.9, { x: dx / d * 20, y: dy / d * 20, z: dz / d * 20 });
    if (this.hintKey === 'borrow') {
      this.showHint('aim', 'The pull curves you toward the planet.<br>Aim the path into the next star’s ring. The <b>faint</b> path shows a full charge.', 7);
    }
  }

  // ================================================================ kindle
  enterKindle(b) {
    const s = this.ship;
    s.pulses.length = 0;
    this.kb = b;
    this.orbit = P.makeKindleOrbit(s, b);
    this.orbitF = 0;
    this.orbitRate = 0.58 / (KINDLE.enterGap + KINDLE.window);
    this.gauge = 0;
    this.draining = false;
    this.kTime = 0;
    this.kMsg = 'get ready';
    this.clearHint('drift');
    this.clearHint('aim');
    this.clearHint('borrow');
    // cinematic camera: outside the loop, on the side the chase camera was on
    const o = this.orbit;
    const C = new THREE.Vector3(o.cx, o.cy, o.cz);
    const n = new THREE.Vector3(...o.n);
    const toCam = this.world.camera.position.clone().sub(C);
    if (toCam.dot(n) < 0) n.negate();
    const u = new THREE.Vector3(...o.u);
    const dir = n.multiplyScalar(0.9).addScaledVector(u, 0.45).add(new THREE.Vector3(0, 0.25, 0)).normalize();
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
    this.clearHint('pump');
    this.lit++;
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
    const dur = Math.max(KINDLE.exitGap, Math.min(3.0, remainArc / 60));
    this.orbitRate = (1 - this.orbitF) / dur;
    this.setMode('toFlight', { dur, source: 'orbit' });
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
    this.ship.ignoreCorona = cp.ember;
    this.prev = [this.ship.px, this.ship.py, this.ship.pz];
    this.cometVisible = true;
    this.farT = 0;
    this.acc = 0;
    this.sfx.respawn();
    this.world.particles.burst(cp.pos[0], cp.pos[1], cp.pos[2], 60, 12, COLORS.white, 0.8, 0.8);
    this.world.rig.snap(this.viewState());
    this.setMode('toFlight', { dur: START_GAP, source: 'frozen' });
  }

  failLevel() {
    this.sfx.fail();
    this.toScreen('failed');
  }

  startOutro() {
    const pts = this.embers.map(b => [b.x, b.y, b.z]);
    const pc = principal(pts);
    const C = new THREE.Vector3(...pc.c);
    const n = new THREE.Vector3(...pc.n);
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
    this.hud.el.resStats.innerHTML = [
      [Math.max(0, Math.round(this.light)), 'Light left'],
      [`${st.time.toFixed(1)}s`, 'Time'],
      [`${st.perfect}/${this.embers.length}`, 'Perfect kindles'],
      [st.crashes + st.lost, 'Mishaps'],
    ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
    this.hud.el.resHelp.innerHTML = this.li + 1 < LEVELS.length
      ? '<span class="k">hold</span> next constellation <span class="sep">·</span> <span class="k">tap</span> sky map'
      : '<span class="k">hold</span> finish <span class="sep">·</span> <span class="k">tap</span> sky map';
  }

  pause() {
    this.pausedMode = this.mode;
    this.charging = false;
    this.pumping = false;
    if (this.ship) this.ship.charge = 0;
    this.toScreen('pause');
  }

  resume() {
    const m = this.mode;
    this.state = 'play';
    this.hud.showScreen(m === 'intro' ? 'intro' : null);
    this.hud.showHud(true);
    this.hud.setBodyMode(MODE_INFO[m].cls);
    if (m === 'toFlight') this.hud.showSwitch('Flight', 'Shift <b>borrows gravity</b> again', 'var(--cyan)');
    if (m === 'toKindle') this.hud.showSwitch('Kindle', 'Shift now <b>pumps light</b> into the star', 'var(--amber)');
    if (m === 'kindle' || m === 'toKindle') this.hud.showGauge(this.kb.name);
    if (m === 'flight') this.setMode('toFlight', { dur: 1.3, source: 'frozen' });
    else if (m === 'kindle') this.requireRelease = this.input.down;
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
    if (this.state === 'play') this.updateMarkers();
    this.world.render();
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

  updatePlay(dt) {
    const m = this.mode;
    this.modeT += dt;
    if (m !== 'outro') this.stats.time += dt;
    switch (m) {
      case 'intro':
        if (this.modeT > INTRO_TIME) this.setMode('toFlight', { dur: START_GAP, source: 'frozen' });
        break;
      case 'toFlight':
      case 'toKindle': {
        const p = this.modeT / this.gapDur;
        const left = Math.max(0, this.gapDur - this.modeT);
        const held = this.input.down;
        this.hud.updateSwitch(p, held ? 'Release Shift — it is locked' : `Shift locked · ${left.toFixed(1)}s`, held);
        const tick = Math.floor(left);
        if (tick !== this.lastTick && this.lastTick >= 0) this.sfx.tick();
        this.lastTick = tick;
        if (m === 'toKindle' || this.gapSource === 'orbit') this.advanceOrbit(dt);
        if (m === 'toKindle') this.updateGaugeView(true);
        if (this.modeT >= this.gapDur) {
          if (m === 'toKindle') this.setMode('kindle');
          else {
            if (this.gapSource === 'orbit') {
              this.ship = P.newShip({ pos: this.orbit.E, dir: this.orbit.h });
              this.ship.ignoreCorona = this.kb.id;
              this.prev = [this.ship.px, this.ship.py, this.ship.pz];
              this.acc = 0;
            }
            this.farT = 0;
            this.setMode('flight');
          }
        }
        break;
      }
      case 'flight':
        this.updateFlight(dt);
        break;
      case 'kindle':
        this.updateKindle(dt);
        break;
      case 'crashed':
        if (this.modeT > 1.4) this.respawn();
        break;
      case 'lost':
        if (this.modeT > 1.3) this.respawn();
        break;
      case 'outro':
        this.advanceOrbit(dt * 0.6);
        if (this.modeT > OUTRO_TIME) this.completeLevel();
        break;
      default: break;
    }
    if (this.state !== 'play') return;

    // HUD key + light
    const info = MODE_INFO[this.mode];
    const locked = info.cls === 'lock' || this.requireRelease;
    let label = info.key;
    let fill = 0;
    if (this.mode === 'flight') {
      fill = this.ship.charge;
      if (this.requireRelease) label = 'Release Shift first';
      else if (this.ship.targetId < 0) label = 'No gravity in range';
    } else if (this.mode === 'kindle') {
      fill = this.gauge / 1.2;
      if (this.requireRelease) label = 'Release Shift first';
    }
    this.hud.setKey(this.input.down, locked, fill, label);
    this.hud.setLight(this.light);
    this.sfx.setCharge(this.ship.charge, this.mode === 'flight' && this.charging);
    this.sfx.setPump(this.gauge || 0, this.mode === 'kindle' && this.pumping);

    // previews
    if (this.mode === 'flight' && this.cometVisible) {
      const s = this.ship;
      const tgt = s.targetId >= 0 ? this.bodies[s.targetId] : null;
      if (tgt) {
        let r = null;
        if (this.charging) r = P.predict(s, this.bodies, null, 4.6, 3, this.previewPts);
        const g = s.charge < 0.985 ? P.predict(s, this.bodies, null, 5.6, 3, this.ghostPts, true) : null;
        this.world.setPreview(r && r.pts, r && r.end, s.charge, g && g.pts, g && g.end, !!g);
        this.previewEnd = r && r.end ? r.end.type : null;
      } else this.world.setPreview(null);
      const ip = this.interp();
      this.world.setTether(ip[0], ip[1], ip[2], tgt, s.charge, this.charging);
    } else {
      this.world.setPreview(null);
      this.world.setTether(0, 0, 0, null);
    }
  }

  updateFlight(dt) {
    this.acc += dt;
    const s = this.ship;
    while (this.acc >= PHYS.dt) {
      this.acc -= PHYS.dt;
      this.prev[0] = s.px; this.prev[1] = s.py; this.prev[2] = s.pz;
      const ev = P.stepShip(s, this.bodies, PHYS.dt, this.charging, null);
      this.light -= PHYS.dt * (LIGHT.drain + (this.charging ? LIGHT.holdDrain : 0));
      if (ev && ev.type === 'crash') { this.crash(ev.body); return; }
      if (ev && ev.type === 'corona') { this.enterKindle(ev.body); return; }
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

  interp() {
    const s = this.ship;
    if (this.mode !== 'flight') return [s.px, s.py, s.pz];
    const a = this.acc / PHYS.dt;
    return [this.prev[0] + (s.px - this.prev[0]) * a, this.prev[1] + (s.py - this.prev[1]) * a, this.prev[2] + (s.pz - this.prev[2]) * a];
  }

  viewState() {
    const v = this._vs || (this._vs = {});
    if (this.state !== 'play' || !this.ship) {
      // slow orbit around the level as a menu backdrop
      const pc = this.backdrop;
      const a = (this.backdropT || 0) * 0.045;
      const C = new THREE.Vector3(...pc.c);
      const A = new THREE.Vector3(...pc.a), N = new THREE.Vector3(...pc.n);
      const pos = C.clone().addScaledVector(N, Math.cos(a) * pc.r * 1.7).addScaledVector(A, Math.sin(a) * pc.r * 1.7).add(new THREE.Vector3(0, pc.r * 0.35, 0));
      Object.assign(v, {
        cx: pc.c[0], cy: pc.c[1], cz: pc.c[2], vx: 0, vy: 0, vz: -1,
        cometVisible: false, charge: 0, charging: false, targetId: -1, focusEmber: -1,
        modeColor: COLORS.cyan, cine: { pos, look: C, up: new THREE.Vector3(0, 1, 0) },
      });
      return v;
    }
    const s = this.ship;
    const [cx, cy, cz] = this.interp();
    const m = this.mode;
    let cine = null;
    if (m === 'intro') cine = this.introCam;
    else if (m === 'toKindle' || m === 'kindle') cine = this.kCam;
    else if (m === 'outro') cine = this.outroCam;
    else if (m === 'toFlight' && this.gapSource === 'orbit' && this.modeT < this.gapDur * 0.45) cine = this.kCam;
    let modeColor = COLORS.cyan;
    if (m === 'kindle' || m === 'toKindle') modeColor = COLORS.amber;
    if (m === 'outro') modeColor = COLORS.gold;
    const forming = (m === 'toFlight' && this.gapSource === 'frozen') || m === 'intro';
    Object.assign(v, {
      cx, cy, cz, vx: s.vx, vy: s.vy, vz: s.vz,
      frozen: forming || m === 'crashed' || m === 'lost',
      cometVisible: this.cometVisible,
      charge: m === 'flight' ? s.charge : m === 'kindle' ? Math.min(1, this.gauge) * 0.6 : 0,
      charging: m === 'flight' && this.charging,
      targetId: m === 'flight' ? s.targetId : -1,
      focusEmber: m === 'toKindle' || m === 'kindle' ? this.kb.id : -1,
      modeColor,
      cometScale: forming ? 0.6 + 0.4 * Math.min(1, this.modeT / (this.gapDur || 1)) : 1,
      cine,
    });
    return v;
  }

  updateMarkers() {
    const cam = this.world.camera;
    const W = window.innerWidth, H = window.innerHeight;
    const list = [];
    const show = this.mode === 'flight' || this.mode === 'toFlight' || this.mode === 'intro';
    if (show) {
      cam.updateMatrixWorld();
      const s = this.ship;
      for (const b of this.embers) {
        if (b.lit) continue;
        const p = this.tmpV.set(b.x, b.y, b.z).applyMatrix4(cam.matrixWorldInverse);
        const dist = Math.max(0, Math.hypot(b.x - s.px, b.y - s.py, b.z - s.pz) - b.corona);
        const label = `${b.name} ${Math.round(dist)}`;
        const behind = p.z > 0;
        const ndc = this.tmpV.set(b.x, b.y, b.z).project(cam);
        let x = (ndc.x * 0.5 + 0.5) * W, y = (-ndc.y * 0.5 + 0.5) * H;
        const M = 50, MT = 96, MB = 175;
        const off = behind || x < M || x > W - M || y < MT || y > H - MB;
        let angle = 0;
        if (off) {
          let dx = p.x, dy = -p.y;
          if (behind && Math.abs(dx) + Math.abs(dy) < 1e-3) dy = 1;
          const l = Math.hypot(dx, dy) || 1;
          dx /= l; dy /= l;
          const cy0 = (MT + H - MB) / 2, hh = (H - MB - MT) / 2;
          const k = Math.min((W / 2 - M) / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
          x = W / 2 + dx * k; y = cy0 + dy * k;
          angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
        }
        list.push({ x, y, off, angle, label, dist });
      }
    }
    // keep on-screen stars, plus arrows for the two nearest off-screen ones
    let offCount = 0;
    const shown = list.sort((a, b) => a.dist - b.dist).filter(m => !m.off || offCount++ < 2);
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
