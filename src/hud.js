// DOM overlay: HUD, mode-switch banner, kindle gauge, menus.
import { KINDLE } from './physics.js';

const $ = (id) => document.getElementById(id);
const GMAX = 1.2;  // gauge full scale

function polar(r, v) {
  const a = (-135 + (v / GMAX) * 270) * Math.PI / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
}
function arc(v0, v1, r = 95) {
  v0 = Math.max(0, Math.min(GMAX, v0));
  v1 = Math.max(0, Math.min(GMAX, v1));
  if (v1 - v0 < 1e-4) return '';
  const [x0, y0] = polar(r, v0), [x1, y1] = polar(r, v1);
  const large = (v1 - v0) / GMAX * 270 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

export class Hud {
  constructor() {
    const ids = ['hud', 'hudLevel', 'hudPips', 'hudLight', 'hudLightNum', 'hudModeName', 'hudModeDesc', 'key', 'keyFill', 'keyLabel',
      'hint', 'toast', 'markers', 'switch', 'switchKicker', 'switchTitle', 'switchSub', 'switchHow', 'switchFill', 'switchNote',
      'gauge', 'gTrack', 'gBand', 'gPerfect', 'gOver', 'gFill', 'gNeedle', 'gStar', 'gMsg', 'gTime', 'flash',
      'mapGrid', 'introKicker', 'introName', 'introSub', 'introText', 'resName', 'resMedals', 'resStats', 'resHelp', 'vicStats', 'failText',
      'modeInfo', 'flares', 'lens', 'lensName', 'lensTarget', 'lensNeedle', 'lensStatus', 'photo', 'photoImg', 'photoName', 'photoStars', 'resPhotos'];
    this.el = {};
    for (const id of ids) this.el[id] = $(id);
    this.screens = {
      title: $('scrTitle'), map: $('scrMap'), intro: $('scrIntro'), complete: $('scrComplete'),
      failed: $('scrFailed'), pause: $('scrPause'), victory: $('scrVictory'),
    };
    this.el.gTrack.setAttribute('d', arc(0, GMAX));
    this.el.gOver.setAttribute('d', arc(KINDLE.overload, GMAX));
    this.markerEls = [];
    this.flareEls = [];
    this.photoTimer = 0;
    this.hintTimer = 0;
    this.cache = {};
  }

  set(key, val, fn) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    fn(val);
  }

  // ------------------------------------------------------------ screens
  showScreen(name) {
    for (const [k, s] of Object.entries(this.screens)) s.hidden = k !== name;
  }
  showHud(on) { this.el.hud.hidden = !on; }
  setHold(p) { this.set('hold', Math.round(p * 100), v => document.body.style.setProperty('--hold', (v / 100).toFixed(2))); }
  setPressing(on) { document.body.classList.toggle('pressing', on); }

  // ------------------------------------------------------------ mode
  setBodyMode(m) {
    this.set('bodymode', m, v => {
      const cl = document.body.classList;
      for (const c of [...cl]) if (c.startsWith('m-')) cl.remove(c);
      cl.add(`m-${v}`);
    });
  }
  setMode(name, desc) {
    this.el.hudModeName.textContent = name;
    this.el.hudModeDesc.textContent = desc;
  }
  setKey(down, locked, fill, label, ready = false) {
    this.set('kdown', down, v => this.el.key.classList.toggle('down', v));
    this.set('klock', locked, v => this.el.key.classList.toggle('locked', v));
    this.set('kready', ready, v => this.el.key.classList.toggle('ready', v));
    this.set('kfill', Math.round(fill * 200), v => { this.el.keyFill.style.width = `${v / 2}%`; });
    this.set('klabel', label, v => { this.el.keyLabel.textContent = v; });
  }
  shakeKey() {
    const k = this.el.key;
    k.classList.remove('shake');
    void k.offsetWidth;
    k.classList.add('shake');
  }

  setLight(v) {
    const p = Math.max(0, Math.min(100, v));
    this.set('light', Math.round(p), r => {
      this.el.hudLight.style.width = `${r}%`;
      this.el.hudLightNum.textContent = r;
      this.el.hudLight.classList.toggle('low', r < 25);
    });
  }
  setLevel(name, total, lit) {
    this.el.hudLevel.textContent = name;
    this.set('pips', `${name}/${total}/${lit}`, () => {
      this.el.hudPips.innerHTML = Array.from({ length: total }, (_, i) => `<div class="pip${i < lit ? ' lit' : ''}"></div>`).join('');
    });
  }

  hint(html, seconds = 0) {
    const h = this.el.hint;
    if (!html) { h.classList.remove('on'); this.cache.hint = null; return; }
    if (this.cache.hint !== html) { h.innerHTML = html; this.cache.hint = html; }
    h.classList.add('on');
    this.hintTimer = seconds;
  }
  tick(dt) {
    if (this.photoTimer > 0) {
      this.photoTimer -= dt;
      if (this.photoTimer <= 0) this.el.photo.hidden = true;
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hint(null);
    }
  }
  toast(text, color = 'var(--ink)') {
    const t = this.el.toast;
    t.textContent = text;
    t.style.color = color;
    t.classList.remove('go');
    void t.offsetWidth;
    t.classList.add('go');
  }
  flash() {
    const f = this.el.flash;
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }

  // ------------------------------------------------------------ switch banner
  // how: { svg, steps } for the full how-to, or null for the compact card
  showSwitch(title, sub, color, how = null, kicker = 'Shift changes function') {
    const s = this.el.switch;
    document.body.style.setProperty('--next', color);
    this.el.switchKicker.textContent = kicker;
    this.el.switchTitle.textContent = title;
    this.el.switchSub.innerHTML = sub;
    this.el.switchHow.innerHTML = how
      ? `<div class="how-art">${how.svg}</div><ol class="how-steps">${how.steps.map(t => `<li>${t}</li>`).join('')}</ol>`
      : '';
    this.el.switchHow.hidden = !how;
    s.classList.toggle('full', !!how);
    s.hidden = false;
    s.style.animation = 'none';
    void s.offsetWidth;
    s.style.animation = '';
  }
  // state: '' (get ready), 'ready' (tap to start), 'go' (starting), 'warn' (release first)
  updateSwitch(p, note, state = '') {
    this.el.switchFill.style.width = `${(Math.min(1, p) * 100).toFixed(1)}%`;
    this.set('snote', note, v => { this.el.switchNote.textContent = v; });
    this.set('sstate', state, v => { this.el.switchNote.className = `switch-note ${v}`; this.el.switch.classList.toggle('is-ready', v === 'ready'); });
  }
  hideSwitch() { this.el.switch.hidden = true; }

  // ------------------------------------------------------------ kindle gauge
  showGauge(name) {
    this.el.gStar.textContent = name || 'Star';
    this.el.gauge.hidden = false;
  }
  hideGauge() { this.el.gauge.hidden = true; }
  updateGauge(g, band, msg, timeLeft, idle) {
    this.el.gauge.classList.toggle('idle', idle);
    this.el.gBand.setAttribute('d', arc(band.lo, band.hi));
    this.el.gPerfect.setAttribute('d', arc(band.center - band.perfect, band.center + band.perfect, 95));
    this.el.gFill.setAttribute('d', arc(0, Math.max(0.0001, g), 95));
    const ang = -135 + (Math.min(GMAX, g) / GMAX) * 270;
    this.el.gNeedle.setAttribute('transform', `rotate(${ang.toFixed(1)})`);
    this.set('gmsg', msg, v => { this.el.gMsg.textContent = v; });
    this.el.gTime.style.width = `${(Math.max(0, Math.min(1, timeLeft)) * 100).toFixed(1)}%`;
  }

  setModeInfo(text) { this.set('minfo', text || '', v => { this.el.modeInfo.textContent = v; }); }

  // ------------------------------------------------------------ SHIELD
  // list: { x, y, scale, near } – a ring that closes onto the spark
  setFlareRings(list, target) {
    while (this.flareEls.length < 6) {
      const d = document.createElement('div');
      d.className = 'flare-ring';
      this.el.flares.appendChild(d);
      this.flareEls.push(d);
    }
    if (!this.flareTarget) {
      this.flareTarget = document.createElement('div');
      this.flareTarget.className = 'flare-target';
      this.el.flares.appendChild(this.flareTarget);
    }
    this.flareTarget.style.display = target ? '' : 'none';
    if (target) this.flareTarget.style.transform = `translate(${target.x.toFixed(1)}px, ${target.y.toFixed(1)}px)`;
    this.flareEls.forEach((el, i) => {
      const f = list[i];
      if (!f) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.transform = `translate(${f.x.toFixed(1)}px, ${f.y.toFixed(1)}px) scale(${f.scale.toFixed(3)})`;
      el.classList.toggle('near', f.near);
    });
  }

  // ------------------------------------------------------------ LENS
  showLens(name, target) {
    this.el.lens.hidden = false;
    this.el.lensName.textContent = name;
    const H = 200, MAXF = 1.4, half = 0.08;
    this.el.lensTarget.style.top = `${((1 - (target + half) / MAXF) * H).toFixed(1)}px`;
    this.el.lensTarget.style.height = `${(2 * half / MAXF * H).toFixed(1)}px`;
  }
  updateLens(focus, status) {
    this.el.lensNeedle.style.top = `${((1 - Math.min(1.4, focus) / 1.4) * 200).toFixed(1)}px`;
    this.set('lstatus', status, v => { this.el.lensStatus.textContent = v; });
  }
  hideLens() { this.el.lens.hidden = true; }
  showPhoto(img, name, stars) {
    this.el.photoImg.src = img;
    this.el.photoName.textContent = name;
    this.el.photoStars.innerHTML = medalsHtml(stars);
    const p = this.el.photo;
    p.hidden = false;
    p.style.animation = 'none';
    void p.offsetWidth;
    p.style.animation = '';
    this.photoTimer = 4.5;
  }

  // ------------------------------------------------------------ markers
  setMarkers(list) {
    while (this.markerEls.length < list.length) {
      const m = document.createElement('div');
      m.className = 'marker';
      m.innerHTML = '<div class="dia"></div><div class="arrow"></div><div class="dist"></div>';
      this.el.markers.appendChild(m);
      this.markerEls.push(m);
    }
    this.markerEls.forEach((m, i) => {
      const d = list[i];
      if (!d) { m.style.display = 'none'; return; }
      m.style.display = '';
      m.style.transform = `translate(${d.x.toFixed(1)}px, ${d.y.toFixed(1)}px)`;
      m.classList.toggle('off', d.off);
      m.classList.toggle('subject', !!d.subject);
      m.classList.toggle('anchor', !!d.anchor);
      m.classList.toggle('next', !!d.next);
      if (d.off) m.children[1].style.transform = `rotate(${d.angle.toFixed(1)}deg)`;
      const txt = d.label;
      if (m._t !== txt) { m.children[2].textContent = txt; m._t = txt; }
    });
  }
}

export function medalsHtml(n, total = 3) {
  return Array.from({ length: total }, (_, i) => (i < n ? '★' : '<span class="off">★</span>')).join('');
}
