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
  targetHysteresis: 1.25,
  voidAccel: 18,        // pull back toward the level when beyond its edge
  noTargetDecay: 0.7,   // charge leaks away while no gravity well is in range
  lostTime: 6.5,        // seconds away from every gravity well = lost in the void
};

// Is the comet anywhere near something that matters (a gravity field or a
// cold star)? Too long without this and the game calls it "lost".
export function nearWell(s, bodies) {
  for (const b of bodies) {
    const d = Math.hypot(b.x - s.px, b.y - s.py, b.z - s.pz);
    if ((b.solid && d < b.influence * 1.2) || (b.ember && !b.lit && d < b.corona * 2.5)) return true;
  }
  return false;
}

// Per-type gravity behaviour.
//   pull       – delta-v (u/s) a full charge delivers at the reference distance
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
};

// Dormant stars ("embers") lend no gravity until they are kindled.
export const EMBER = { corona: 3.2 };

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
      ember: def.type === 'ember',
      corona: 0,
    };
    if (b.ember) {
      b.corona = def.r * EMBER.corona;
      b.band = def.band || { center: 0.7, width: 0.13, speed: 0.8, wobble: 0 };
      setGravity(b, null); // no gravity while dormant
    } else {
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
    ignoreCorona: -1,
    outside: false,
  };
}

export function cloneShip(s) {
  return {
    px: s.px, py: s.py, pz: s.pz,
    vx: s.vx, vy: s.vy, vz: s.vz,
    charge: s.charge, targetId: s.targetId,
    pulses: s.pulses.map(p => ({ ...p })),
    ignoreCorona: s.ignoreCorona,
    outside: s.outside,
  };
}

// Gravity score of a body at the ship's position (0 when out of range).
function score(b, s) {
  if (!b.solid || b.pull <= 0) return 0;
  const dx = b.x - s.px, dy = b.y - s.py, dz = b.z - s.pz;
  const r = Math.hypot(dx, dy, dz);
  if (r > b.influence) return 0;
  return b.pull * Math.min(b.fallCap, b.refDist / r);
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

// One fixed physics step. Returns null or an event object.
export function stepShip(s, bodies, dt, holding, bounds) {
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

  s.outside = false;
  if (bounds) {
    const dx = bounds.center[0] - s.px, dy = bounds.center[1] - s.py, dz = bounds.center[2] - s.pz;
    const d = Math.hypot(dx, dy, dz);
    if (d > bounds.radius) {
      s.outside = true;
      const k = PHYS.voidAccel * Math.min(1.6, 0.4 + (d - bounds.radius) / 40) / d;
      ax += dx * k; ay += dy * k; az += dz * k;
    }
  }

  s.vx += ax * dt; s.vy += ay * dt; s.vz += az * dt;
  let sp = Math.hypot(s.vx, s.vy, s.vz);
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
    } else if (b.ember && !b.lit) {
      if (b.id === s.ignoreCorona) {
        if (d2 > (b.corona * 1.08) ** 2) s.ignoreCorona = -1;
      } else if (d2 < b.corona * b.corona) {
        return { type: 'corona', body: b };
      }
    }
  }
  return null;
}

// "If I let go right now, where will I go?"  Simulates a release of the
// current charge and returns the path plus how it ends.
// With holdUntilFull, it first keeps holding until the charge is full
// (the faint "potential" path), so both previews are exact.
export function predict(s, bodies, bounds, horizon = 4.6, every = 3, out = null, holdUntilFull = false) {
  const sim = cloneShip(s);
  const pts = out || [];
  pts.length = 0;
  pts.push(sim.px, sim.py, sim.pz);
  let i = 1;
  const steps = Math.round(horizon / PHYS.dt);
  if (holdUntilFull) {
    for (let k = 0; k < 2.5 / PHYS.dt && sim.charge < 0.999; k++, i++) {
      const ev = stepShip(sim, bodies, PHYS.dt, true, bounds);
      if (ev) {
        pts.push(sim.px, sim.py, sim.pz);
        return { pts, end: { type: ev.type, body: ev.body, x: sim.px, y: sim.py, z: sim.pz }, pulsed: false };
      }
      if (i % every === 0) pts.push(sim.px, sim.py, sim.pz);
    }
  }
  const pulse = release(sim);
  let end = null;
  for (; i <= steps; i++) {
    const ev = stepShip(sim, bodies, PHYS.dt, false, bounds);
    if (ev) {
      pts.push(sim.px, sim.py, sim.pz);
      end = { type: ev.type, body: ev.body, x: sim.px, y: sim.py, z: sim.pz };
      break;
    }
    if (i % every === 0) pts.push(sim.px, sim.py, sim.pz);
  }
  return { pts, end, pulsed: !!pulse };
}

// ---------------------------------------------------------------- kindle orbit
// While kindling, the star holds the comet in a scripted loop, then flings it
// out along the star's exit lane (shown as a beam on every dormant star).
// The lane makes each star a reliable checkpoint: however you arrive, you
// leave the same way. Stars without a lane let you out on the far side, on
// your entry heading.

const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

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
  // phi is the angle from u to e about +n (u×e direction); flip if needed
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
  // Rodrigues: rotate u about n by th (u ⟂ n)
  const kx = ny * uz - nz * uy, ky = nz * ux - nx * uz, kz = nx * uy - ny * ux;
  const r = o.Rc * (1 - 0.28 * Math.sin(Math.PI * f));
  let x = o.cx + (ux * c + kx * s) * r;
  let y = o.cy + (uy * c + ky * s) * r;
  let z = o.cz + (uz * c + kz * s) * r;
  const arc = o.total * o.Rc;
  // ease in from the straight entry line …
  const bi = 0.08;
  if (f < bi) {
    let w = 1 - f / bi;
    w = w * w * (3 - 2 * w);
    const d = f * arc;
    const lx = o.P[0] + o.hin[0] * d, ly = o.P[1] + o.hin[1] * d, lz = o.P[2] + o.hin[2] * d;
    x += (lx - x) * w; y += (ly - y) * w; z += (lz - z) * w;
  }
  // … and out along the exit lane
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
  enterGap: 1.7,   // s of "Shift does nothing" before the pump goes live
  exitGap: 1.7,    // s of "Shift does nothing" before flight control returns
  window: 6.5,     // s the star stays receptive
  overload: 1.12,  // gauge value that bursts on its own
  drain: 2.6,      // gauge fall speed after a miss (per s)
};

export function bandAt(band, t) {
  const c = band.center + (band.wobble || 0) * Math.sin(t * (band.wobbleSpeed || 2.2));
  return { lo: c - band.width / 2, hi: c + band.width / 2, center: c, perfect: band.width * 0.22 };
}
