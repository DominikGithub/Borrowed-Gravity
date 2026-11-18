// Tiny WebAudio synth: every sound is generated, no asset files.
// Each mode has its own sonic identity so a mode switch is heard, not just seen:
//   FLIGHT charge = low saw hum rising,  KINDLE pump = bright sine with vibrato.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    // reverb-ish send
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.4);
    const vg = ctx.createGain();
    vg.gain.value = 0.35;
    this.verb.connect(vg).connect(this.master);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // ambient drone
    const dr = ctx.createGain();
    dr.gain.value = 0.045;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    [55, 82.4, 110.3].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      o.detune.value = (i - 1) * 6;
      o.connect(lp);
      o.start();
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 160;
    lfo.connect(lg).connect(lp.frequency);
    lfo.start();
    lp.connect(dr).connect(this.master);
    dr.connect(this.verb);

    // charge hum (flight)
    this.hum = ctx.createOscillator();
    this.hum.type = 'sawtooth';
    this.humF = ctx.createBiquadFilter();
    this.humF.type = 'lowpass';
    this.humF.frequency.value = 300;
    this.humG = ctx.createGain();
    this.humG.gain.value = 0;
    this.hum.connect(this.humF).connect(this.humG).connect(this.master);
    this.hum.start();

    // pump tone (kindle)
    this.pump = ctx.createOscillator();
    this.pump.type = 'sine';
    this.pumpG = ctx.createGain();
    this.pumpG.gain.value = 0;
    const vib = ctx.createOscillator();
    vib.frequency.value = 7;
    const vibG = ctx.createGain();
    vibG.gain.value = 9;
    vib.connect(vibG).connect(this.pump.frequency);
    vib.start();
    this.pump.connect(this.pumpG).connect(this.master);
    this.pumpG.connect(this.verb);
    this.pump.start();
  }

  impulse(sec) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  get ok() { return this.ctx && this.ctx.state === 'running' && !this.muted; }

  tone(freq, dur, { type = 'sine', gain = 0.2, at = 0, attack = 0.005, verb = 0.4, slide = 0 } = {}) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    if (verb) { const vg = ctx.createGain(); vg.gain.value = verb; g.connect(vg).connect(this.verb); }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, { gain = 0.3, f0 = 400, f1 = 2400, q = 1.2, type = 'bandpass', at = 0 } = {}) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // continuous controls --------------------------------------------------
  setCharge(c, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.hum.frequency.setTargetAtTime(55 + 140 * c, t, 0.05);
    this.humF.frequency.setTargetAtTime(240 + 1600 * c, t, 0.05);
    this.humG.gain.setTargetAtTime(on && !this.muted ? 0.05 + 0.07 * c : 0, t, 0.04);
  }
  setPump(g, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.pump.frequency.setTargetAtTime(330 + 520 * g, t, 0.03);
    this.pumpG.gain.setTargetAtTime(on && !this.muted ? 0.07 : 0, t, 0.03);
  }

  // one-shots --------------------------------------------------------------
  release(c) {
    this.noise(0.5 + c * 0.4, { gain: 0.25 + 0.3 * c, f0: 300, f1: 2600, q: 0.8 });
    this.tone(110 + 90 * c, 0.6, { type: 'triangle', gain: 0.18, slide: 2.2, verb: 0.2 });
  }
  fizzle() { this.tone(180, 0.18, { type: 'square', gain: 0.05, slide: 0.5, verb: 0 }); }
  vent() { this.noise(0.45, { gain: 0.12, f0: 3000, f1: 600, q: 0.7 }); }
  modeKindle() { [392, 523.3, 659.3, 784].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', gain: 0.12, at: i * 0.08 })); }
  modeFlight() { [784, 587.3, 440, 293.7].forEach((f, i) => this.tone(f, 0.45, { type: 'sine', gain: 0.13, at: i * 0.08 })); }
  live() { this.tone(1046.5, 0.25, { type: 'sine', gain: 0.12 }); this.tone(1568, 0.3, { type: 'sine', gain: 0.06, at: 0.05 }); }
  locked() { this.tone(140, 0.09, { type: 'square', gain: 0.04, verb: 0 }); }
  tick() { this.tone(880, 0.05, { type: 'sine', gain: 0.05, verb: 0 }); }
  miss(over) { this.tone(over ? 520 : 260, 0.35, { type: 'sawtooth', gain: 0.07, slide: over ? 0.4 : 0.6, verb: 0.2 }); }
  ignite(perfect) {
    const base = perfect ? [523.3, 659.3, 784, 987.8, 1318.5] : [440, 554.4, 659.3, 880];
    base.forEach((f, i) => this.tone(f, 2.6, { type: 'sine', gain: 0.1, at: i * 0.04, attack: 0.01, verb: 0.8 }));
    this.noise(1.2, { gain: 0.2, f0: 6000, f1: 800, q: 0.5 });
  }
  sputter() { [330, 311.1].forEach((f, i) => this.tone(f, 0.9, { type: 'triangle', gain: 0.1, at: i * 0.12 })); }
  crash() {
    this.noise(1.1, { gain: 0.5, f0: 1600, f1: 90, q: 0.6, type: 'lowpass' });
    this.tone(90, 0.9, { type: 'sine', gain: 0.35, slide: 0.35, verb: 0.3 });
  }
  lost() { this.tone(220, 1.2, { type: 'sine', gain: 0.14, slide: 0.5 }); }
  respawn() { [261.6, 392, 523.3].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', gain: 0.08, at: i * 0.06 })); }
  ui() { this.tone(660, 0.08, { type: 'sine', gain: 0.08, verb: 0.1 }); }
  confirm() { [523.3, 784].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', gain: 0.12, at: i * 0.07 })); }
  complete() {
    [523.3, 659.3, 784, 1046.5, 1318.5, 1568].forEach((f, i) => this.tone(f, 3.2, { type: 'sine', gain: 0.08, at: i * 0.12, verb: 0.9 }));
  }
  fail() { [392, 349.2, 293.7, 196].forEach((f, i) => this.tone(f, 0.9, { type: 'triangle', gain: 0.1, at: i * 0.18 })); }
}
