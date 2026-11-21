// Pure simulation core. No rendering, no DOM: the game, the trajectory
// preview and the offline level checker (tools/check-levels.mjs) all run
// exactly this code, so the preview path never lies.

export const PHYS = {
  dt: 1 / 120,          // fixed physics step (s)
  cruise: 26,           // the comet's natural drift speed (u/s)
  relaxTau: 1.8,        // how fast speed drifts back to cruise after a pulse (s)
  minSpeed: 12,
  maxSpeed: 78,
  pulseTime: 0.9,       // a released charge acts over this long (s)
  chargeTime: 1.25,     // seconds to full charge at chargeRate 1
  cometRadius: 0.9,
  targetHysteresis: 1.1,  // the tether only jumps to a body that pulls 10% harder (no flicker)
  noTargetDecay: 0.7,   // charge leaks away while no gravity well is in range
  lostTime: 6.5,        // seconds away from everything = lost in the void
};

// Per-type gravity behaviour.
//   pull       – delta-v (u/s) a full charge delivers at the reference distance
//                (negative = a repulsor: borrowing it pushes you away)
//   refMul     – reference distance as a multiple of the radius
//   chargeRate – how quickly this body lends its gravity (1 = normal)
//   influence  – radius (× body radius) inside which gravity can be borrowed
//   lethal     – crash radius (× body radius)
export const BODY_TYPES = {
  rock:      { pull: 34, refMul: 3.0, chargeRate: 1.0,  influence: 7.0,  lethal: 1.0, fallCap: 1.6 },
  ice:       { pull: 30, refMul: 3.0, chargeRate: 1.15, influence: 7.5,  lethal: 1.0, fallCap: 1.6 },
  giant:     { pull: 46, refMul: 3.0, chargeRate: 0.75, influence: 5.5,  lethal: 1.0, fallCap: 1.6 },
  moon:      { pull: 24, refMul: 3.0, chargeRate: 1.4,  influence: 9.0,  lethal: 1.0, fallCap: 1.6 },
  star:      { pull: 40, refMul: 3.0, chargeRate: 1.1,  influence: 5.5,  lethal: 1.3, fallCap: 1.6 },
  blackhole: { pull: 78, refMul: 6.0, chargeRate: 2.4,  influence: 16,   lethal: 2.0, fallCap: 1.5 },
  whitehole: { pull: -38, refMul: 3.0, chargeRate: 1.2, influence: 8.0,  lethal: 1.0, fallCap: 1.6 },
};

// Bodies whose zone switches Shift to another function when the spark enters
// it (only ever checked in FLIGHT – see main.js for the lock rules).
//   ember   – cold star, corona → KINDLE (pump light)
//   anchor  – spindle star, sling ring → SLING (spin up, launch)
//   storm   – flare storm front → SHIELD (raise shield against flares)
//   subject – rare sight, lens ring → LENS (focus, take a photo)
export const EMBER = { corona: 3.2 };
export const ANCHOR = { ring: 7.0 };
const MIN_CHORD = 0.9;  // storms/lenses only trigger if you'd cross ≥ 0.9 × their radius

// ---------------------------------------------------------------- bodies

export function makeBodies(level) {
  return level.bodies.map((def, i) => {
    const b = {
      id: i,
      type: def.type,
      x: def.pos[0], y: def.pos[1], z: def.pos[2],
      radius: def.r,
      name: def.name || null,
      def,
      lit: false,
      done: false,
      ember: def.type === 'ember',
      corona: 0,
      zone: 0,
      trigger: null,
    };
    switch (def.type) {
      case 'ember':
        setGravity(b, null);            // no gravity while dormant
        b.corona = b.zone = def.r * EMBER.corona;
        b.trigger = 'kindle';
        b.band = def.band || { center: 0.7, width: 0.13, speed: 0.8, wobble: 0 };
        break;
      case 'anchor':
        setGravity(b, null);
        b.solid = true;
        b.lethalR = def.r * 1.3;
        b.zone = def.zone ?? def.r * ANCHOR.ring;
        b.trigger = 'sling';
        break;
      case 'storm':
        setGravity(b, null);
        b.zone = def.zone;
        b.trigger = 'shield';
        break;
      case 'subject':
        setGravity(b, null);
        b.zone = def.zone;
        b.trigger = 'lens';
        break;
      case 'flarestar':
        setGravity(b, null);
        b.solid = true;
        b.lethalR = def.r * 1.3;
        break;
      default:
        setGravity(b, def.type);
    }
    return b;
  });
}

function setGravity(b, type) {
  if (!type) {
    b.pull = 0; b.refDist = 1; b.chargeRate = 0; b.influence = 0;
    b.lethalR = 0; b.fallCap = 0; b.solid = false;
    return;
  }
  const t = BODY_TYPES[type];
  const ov = b.def;
  b.pull = ov.pull ?? t.pull;
  b.refDist = b.radius * t.refMul;
  b.chargeRate = t.chargeRate;
  b.influence = b.radius * (ov.influence ?? t.influence);
  b.lethalR = b.radius * t.lethal;
  b.fallCap = t.fallCap;
  b.solid = true;
}

export function lightEmber(b) {
  b.lit = true;
  setGravity(b, 'star');
}

function zoneActive(b) {
  if (b.trigger === 'kindle') return !b.lit;
  if (b.trigger === 'lens') return !b.done;
  return true;
}

// Is the comet anywhere near something that matters? Too long without this
// and the game calls it "lost".
export function nearWell(s, bodies) {
  for (const b of bodies) {
    const d = Math.hypot(b.x - s.px, b.y - s.py, b.z - s.pz);
    if (b.solid && b.influence > 0 && d < b.influence * 1.2) return true;
    if (b.trigger && zoneActive(b) && d < b.zone * (b.trigger === 'kindle' ? 2.5 : 1.6)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- ship

export function newShip(start) {
  const [x, y, z] = start.pos;
  const [vx, vy, vz] = start.dir;
  const l = Math.hypot(vx, vy, vz);
  const sp = start.speed ?? PHYS.cruise;
  return {
    px: x, py: y, pz: z,
    vx: vx / l * sp, vy: vy / l * sp, vz: vz / l * sp,
    charge: 0,
    targetId: -1,
    pulses: [],
    ignore: [],      // zones we are inside of but must not re-trigger
  };
}

export function cloneShip(s) {
  return {
    px: s.px, py: s.py, pz: s.pz,
    vx: s.vx, vy: s.vy, vz: s.vz,
    charge: s.charge, targetId: s.targetId,
    pulses: s.pulses.map(p => ({ ...p })),
    ignore: s.ignore.slice(),
  };
}

// Gravity score of a body at the ship's position (0 when out of range).
function score(b, s) {
  if (!b.solid || b.pull === 0) return 0;
  const dx = b.x - s.px, dy = b.y - s.py, dz = b.z - s.pz;
  const r = Math.hypot(dx, dy, dz);
  if (r > b.influence) return 0;
  return Math.abs(b.pull) * Math.min(b.fallCap, b.refDist / r);
}

export function selectTarget(s, bodies) {
  let best = -1, bestScore = 0;
  for (const b of bodies) {
    const sc = score(b, s);
    if (sc > bestScore) { bestScore = sc; best = b.id; }
  }
  if (s.targetId >= 0 && best !== s.targetId) {
    const cur = score(bodies[s.targetId], s);
    if (cur > 0 && cur * PHYS.targetHysteresis >= bestScore) best = s.targetId;
  }
  s.targetId = best;
  return best;
}

// Turn the stored charge into a gravity pulse toward the current target.
// Returns the pulse, or null if nothing was released.
export function release(s) {
  const c = s.charge;
  s.charge = 0;
  if (c < 0.03 || s.targetId < 0) return null;
  const p = { bodyId: s.targetId, c, t: 0 };
  s.pulses.push(p);
  return p;
}

// Remaining straight-line chord through a zone (for storms / lenses).
function chordAhead(s, b) {
  const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
  const hx = s.vx / sp, hy = s.vy / sp, hz = s.vz / sp;
  const ox = s.px - b.x, oy = s.py - b.y, oz = s.pz - b.z;
  const bb = hx * ox + hy * oy + hz * oz;
  const cc = ox * ox + oy * oy + oz * oz - b.zone * b.zone;
  const disc = bb * bb - cc;
  return disc > 0 ? -bb + Math.sqrt(disc) : 0;
}

// One fixed physics step. Returns null or an event:
//   { type: 'crash', body }  or  { type: 'zone', mode, body }
// With triggers=false (used during mode-switch locks) zones are ignored.
export function stepShip(s, bodies, dt, holding, triggers = true) {
  const tid = selectTarget(s, bodies);
  if (holding) {
    if (tid >= 0) s.charge = Math.min(1, s.charge + dt * bodies[tid].chargeRate / PHYS.chargeTime);
    else s.charge = Math.max(0, s.charge - dt * PHYS.noTargetDecay);
  }

  let ax = 0, ay = 0, az = 0;
  for (let i = s.pulses.length - 1; i >= 0; i--) {
    const pu = s.pulses[i];
    const b = bodies[pu.bodyId];
    const dx = b.x - s.px, dy = b.y - s.py, dz = b.z - s.pz;
    const r = Math.max(0.001, Math.hypot(dx, dy, dz));
    const u = pu.t / PHYS.pulseTime;
    const env = (Math.PI / 2) * Math.sin(Math.PI * u); // integrates to 1 over the pulse
    const fall = Math.min(b.fallCap, b.refDist / r);
    const mag = pu.c * b.pull * fall * env / PHYS.pulseTime;
    ax += dx / r * mag; ay += dy / r * mag; az += dz / r * mag;
    pu.t += dt;
    if (pu.t >= PHYS.pulseTime) s.pulses.splice(i, 1);
  }

  s.vx += ax * dt; s.vy += ay * dt; s.vz += az * dt;
  const sp = Math.hypot(s.vx, s.vy, s.vz);
  let target = sp;
  if (s.pulses.length === 0) target = sp + (PHYS.cruise - sp) * (1 - Math.exp(-dt / PHYS.relaxTau));
  target = Math.min(PHYS.maxSpeed, Math.max(PHYS.minSpeed, target));
  if (sp > 1e-6 && target !== sp) {
    const k = target / sp;
    s.vx *= k; s.vy *= k; s.vz *= k;
  }
  s.px += s.vx * dt; s.py += s.vy * dt; s.pz += s.vz * dt;

  for (const b of bodies) {
    const dx = b.x - s.px, dy = b.y - s.py, dz = b.z - s.pz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (b.solid) {
      const lr = b.lethalR + PHYS.cometRadius;
      if (d2 < lr * lr) return { type: 'crash', body: b };
    }
    if (!b.trigger) continue;
    const ig = s.ignore.indexOf(b.id);
    if (ig >= 0) {
      if (d2 > (b.zone * 1.08) ** 2) s.ignore.splice(ig, 1);
      continue;
    }
    if (!triggers || !zoneActive(b) || d2 >= b.zone * b.zone) continue;
    if ((b.trigger === 'shield' || b.trigger === 'lens') && chordAhead(s, b) < b.zone * MIN_CHORD) {
      s.ignore.push(b.id); // only grazing the edge: no mode switch
      continue;
    }
    return { type: 'zone', mode: b.trigger, body: b };
  }
  return null;
}

// "If I let go right now, where will I go?"  Simulates a release of the
// current charge and returns the path plus how it ends.
//   holdUntilFull – first keep holding until the charge is full (faint path)
//   noRelease     – just coast (used for the sling launch line)
//   lockFor       – seconds at the start during which zones can't trigger
export function predict(s, bodies, opts = {}) {
  const { horizon = 4.6, every = 3, out = null, holdUntilFull = false, noRelease = false, lockFor = 0 } = opts;
  const sim = cloneShip(s);
  const pts = out || [];
  pts.length = 0;
  pts.push(sim.px, sim.py, sim.pz);
  let i = 1;
  const steps = Math.round(horizon / PHYS.dt);
  const lockSteps = Math.round(lockFor / PHYS.dt);
  const endOf = (ev) => ({ type: ev.type, mode: ev.mode, body: ev.body, x: sim.px, y: sim.py, z: sim.pz });
  if (holdUntilFull) {
    for (let k = 0; k < 2.5 / PHYS.dt && sim.charge < 0.999; k++, i++) {
      const ev = stepShip(sim, bodies, PHYS.dt, true, i > lockSteps);
      if (ev) { pts.push(sim.px, sim.py, sim.pz); return { pts, end: endOf(ev), pulsed: false }; }
      if (i % every === 0) pts.push(sim.px, sim.py, sim.pz);
    }
  }
  const pulse = noRelease ? null : release(sim);
  let end = null;
  for (; i <= steps; i++) {
    const ev = stepShip(sim, bodies, PHYS.dt, false, i > lockSteps);
    if (ev) { pts.push(sim.px, sim.py, sim.pz); end = endOf(ev); break; }
    if (i % every === 0) pts.push(sim.px, sim.py, sim.pz);
  }
  return { pts, end, pulsed: !!pulse };
}

// ---------------------------------------------------------------- vectors

const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const smooth01 = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- kindle orbit
// While kindling, the star holds the comet in a scripted loop, then flings it
// out along the star's exit lane (shown as a beam on every dormant star).
// The lane makes each star a reliable checkpoint: however you arrive, you
// leave the same way. Stars without a lane let you out on the far side, on
// your entry heading.

export function kindleExit(s, b) {
  const Rc = b.corona;
  if (b.def.lane) {
    const h = norm3(...b.def.lane);
    return { E: [b.x + h[0] * Rc, b.y + h[1] * Rc, b.z + h[2] * Rc], h };
  }
  const h = norm3(s.vx, s.vy, s.vz);
  const o = [s.px - b.x, s.py - b.y, s.pz - b.z];
  const bb = dot3(h, o), cc = dot3(o, o) - Rc * Rc;
  const t = -bb + Math.sqrt(Math.max(0, bb * bb - cc));
  return { E: [s.px + h[0] * t, s.py + h[1] * t, s.pz + h[2] * t], h };
}

export function makeKindleOrbit(s, b) {
  const Rc = b.corona;
  const hin = norm3(s.vx, s.vy, s.vz);
  const u = norm3(s.px - b.x, s.py - b.y, s.pz - b.z);
  const P = [b.x + u[0] * Rc, b.y + u[1] * Rc, b.z + u[2] * Rc];
  const { E, h } = kindleExit(s, b);
  const e = norm3(E[0] - b.x, E[1] - b.y, E[2] - b.z);
  // Orbit plane holds both the entry and exit radials. Pick the turning sense
  // that best continues the comet's entry motion.
  let n = cross3(u, e);
  if (Math.hypot(...n) < 0.05) n = cross3(u, hin);
  if (Math.hypot(...n) < 0.05) n = cross3(u, Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  n = norm3(...n);
  let phi = Math.acos(Math.max(-1, Math.min(1, dot3(u, e))));
  if (dot3(cross3(u, e), n) < 0) phi = 2 * Math.PI - phi;
  const tan = cross3(n, u);
  if (dot3(tan, hin) < 0) { n = n.map(v => -v); phi = 2 * Math.PI - phi; }
  return {
    cx: b.x, cy: b.y, cz: b.z, Rc,
    u, n, P, hin,
    total: phi + Math.PI * 2,  // travel round to the exit, plus one full lap
    E, h,
  };
}

// Position on the kindle loop for normalised progress f in [0,1].
export function kindleOrbitPos(o, f, out) {
  const th = o.total * f;
  const [ux, uy, uz] = o.u, [nx, ny, nz] = o.n;
  const c = Math.cos(th), s = Math.sin(th);
  const kx = ny * uz - nz * uy, ky = nz * ux - nx * uz, kz = nx * uy - ny * ux;
  const r = o.Rc * (1 - 0.28 * Math.sin(Math.PI * f));
  let x = o.cx + (ux * c + kx * s) * r;
  let y = o.cy + (uy * c + ky * s) * r;
  let z = o.cz + (uz * c + kz * s) * r;
  const arc = o.total * o.Rc;
  const bi = 0.08;
  if (f < bi) {
    let w = 1 - f / bi;
    w = w * w * (3 - 2 * w);
    const d = f * arc;
    const lx = o.P[0] + o.hin[0] * d, ly = o.P[1] + o.hin[1] * d, lz = o.P[2] + o.hin[2] * d;
    x += (lx - x) * w; y += (ly - y) * w; z += (lz - z) * w;
  }
  const bs = 0.84;
  if (f > bs) {
    let w = (f - bs) / (1 - bs);
    w = w * w * (3 - 2 * w);
    const remain = (1 - f) * arc;
    const lx = o.E[0] - o.h[0] * remain, ly = o.E[1] - o.h[1] * remain, lz = o.E[2] - o.h[2] * remain;
    x += (lx - x) * w; y += (ly - y) * w; z += (lz - z) * w;
  }
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}

// ---------------------------------------------------------------- kindle gauge
// In KINDLE mode Shift no longer touches the comet. Holding it pumps light
// into the star (the gauge rises); releasing inside the band ignites it.

export const KINDLE = {
  enterGap: 0.6,   // s the catch into orbit takes before the gauge can start
  exitGap: 0.6,    // shortest ride round the orbit to the exit lane
  window: 6.5,     // s the star stays receptive
  overload: 1.12,  // gauge value that bursts on its own
  drain: 2.6,      // gauge fall speed after a miss (per s)
};

export function bandAt(band, t) {
  const c = band.center + (band.wobble || 0) * Math.sin(t * (band.wobbleSpeed || 2.2));
  return { lo: c - band.width / 2, hi: c + band.width / 2, center: c, perfect: band.width * 0.22 };
}

// ---------------------------------------------------------------- sling
// SLING mode: a spindle star catches the spark in a tight orbit. Holding Shift
// spins you up (faster, and the launch line sweeps round faster too); letting
// go launches you along the tangent. It is the one way to aim in any direction.

export const SLING = {
  enterGap: 0.6,   // catch before the sling can start (the orbit keeps turning while you get ready)
  exitGap: 0.7,    // straight flight after launch, zones off
  window: 7.0,     // auto-launch if you never let go
  orbitMul: 0.62,  // orbit radius as a fraction of the ring
  settle: 1.2,     // s for the orbit radius to settle
  spinTime: 1.3,   // s of holding to reach full spin
  maxSpin: 2.0,    // launch speed multiplier at full spin
  baseOrbit: 0.55, // orbit speed (× cruise) before spinning up – slow enough to aim
  spinOrbit: 0.9,  // extra orbit speed per unit of spin
};

export function slingOrbitSpeed(o) { return PHYS.cruise * (SLING.baseOrbit + (o.spin - 1) * SLING.spinOrbit); }

export function makeSlingOrbit(s, b) {
  const u = norm3(s.px - b.x, s.py - b.y, s.pz - b.z);
  const r0 = Math.hypot(s.px - b.x, s.py - b.y, s.pz - b.z);
  const v = norm3(s.vx, s.vy, s.vz);
  let n = cross3(u, v);
  if (Math.hypot(...n) < 0.05) n = cross3(u, Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  n = norm3(...n);
  const k = cross3(n, u);
  return { cx: b.x, cy: b.y, cz: b.z, u, k, n, r0, r: b.zone * SLING.orbitMul, theta: 0, t: 0, holdT: 0, spin: 1 };
}

export function slingRadius(o) { return o.r0 + (o.r - o.r0) * smooth01(o.t / SLING.settle); }

export function slingStep(o, dt, holding) {
  if (holding) o.holdT += dt;
  o.spin = 1 + (SLING.maxSpin - 1) * Math.min(1, o.holdT / SLING.spinTime);
  o.theta += slingOrbitSpeed(o) / slingRadius(o) * dt;
  o.t += dt;
}

export function slingPos(o, out = [0, 0, 0]) {
  const rad = slingRadius(o), c = Math.cos(o.theta), s = Math.sin(o.theta);
  out[0] = o.cx + rad * (o.u[0] * c + o.k[0] * s);
  out[1] = o.cy + rad * (o.u[1] * c + o.k[1] * s);
  out[2] = o.cz + rad * (o.u[2] * c + o.k[2] * s);
  return out;
}

export function slingDir(o) {
  const c = Math.cos(o.theta), s = Math.sin(o.theta);
  return norm3(-o.u[0] * s + o.k[0] * c, -o.u[1] * s + o.k[1] * c, -o.u[2] * s + o.k[2] * c);
}

// The free-flying spark you get if you let go right now.
export function slingLaunch(o, b) {
  const ship = newShip({ pos: slingPos(o), dir: slingDir(o), speed: PHYS.cruise * o.spin });
  ship.ignore = [b.id];
  return ship;
}

// ---------------------------------------------------------------- shield / lens
// SHIELD and LENS modes don't steer: the spark coasts straight through the
// zone (LENS in slow motion) while Shift does something else entirely.

// enterGap / exitGap: seconds of straight coasting (zones off) around the switch.
// After that, time holds until the player taps Shift to start the next mode.
export const SHIELD = {
  enterGap: 0.6, exitGap: 0.6,
  drain: 0.48,      // shield energy per second while held
  regen: 0.32,      // per second while lowered
  minRaise: 0.12,   // energy needed to raise it
  warn: 1.0,        // seconds of warning before a flare hits
};

export const LENS = {
  enterGap: 0.6, exitGap: 0.6,
  slow: 0.42,       // the spark coasts at this fraction of normal speed
  window: 6.0,      // seconds to take the shot
  focusRate: 0.62,  // focus per second while held
  sway: 0.11,       // camera sway amplitude (radians)
};
