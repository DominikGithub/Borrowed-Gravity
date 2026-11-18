// Offline level checker. Runs the real physics (src/physics.js) and searches
// one-key inputs to prove every level can be completed, and measures how
// forgiving each leg is.
//
// A "leg" is free flight from a known state. In it we try every single
// press (press at t0, hold d) on a grid. Whatever the leg runs into decides
// what comes next, mirroring the game's mode rules:
//   cold star   → KINDLE → the star throws you out along its lane
//   spindle     → SLING  → we also search the launch moment and spin
//   storm/lens  → SHIELD/LENS → straight through the zone, then the lock
//
//   node tools/check-levels.mjs            check all levels
//   node tools/check-levels.mjs 5          check level index 5 only
//   node tools/check-levels.mjs trace 2 "1.2:0.8"   trace a scripted first leg

import { LEVELS } from '../src/levels.js';
import * as P from '../src/physics.js';

const { PHYS, SLING, SHIELD, LENS } = P;
const DT = PHYS.dt;
const HORIZON = 11;

function world(L, lit, done) {
  const bodies = P.makeBodies(L);
  for (const id of lit) P.lightEmber(bodies[id]);
  for (const id of done) bodies[id].done = true;
  return bodies;
}

// Fly with optional inputs until something happens.
function run(ship0, bodies, bounds, inputs, horizon = HORIZON, lockFor = 0) {
  const s = P.cloneShip(ship0);
  const steps = Math.round(horizon / DT);
  const lockSteps = Math.round(lockFor / DT);
  let holding = false, far = 0;
  for (let i = 0; i < steps; i++) {
    const t = i * DT;
    let want = false;
    for (const [t0, d] of inputs) if (t >= t0 && t < t0 + d) want = true;
    if (holding && !want) P.release(s);
    holding = want;
    const ev = P.stepShip(s, bodies, DT, holding, i >= lockSteps);
    if (ev) return { ev, s, t };
    far = P.nearWell(s, bodies) ? 0 : far + DT;
    const c = bounds.center;
    if (far > PHYS.lostTime || Math.hypot(s.px - c[0], s.py - c[1], s.pz - c[2]) > bounds.radius) {
      return { ev: { type: 'lost' }, s, t };
    }
  }
  return { ev: null, s, t: horizon };
}

const keyOf = (ev) => (ev && ev.type === 'zone' ? `${ev.mode}:${ev.body.id}` : null);

// Group outcomes of many attempts by which zone they reach.
function collect(attempts) {
  const out = new Map();
  for (const a of attempts) {
    const k = keyOf(a.r.ev);
    if (!k) continue;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(a);
  }
  return out;
}

function freeLeg(ship, bodies, bounds) {
  const attempts = [{ inputs: [], r: run(ship, bodies, bounds, []) }];
  for (let t0 = 0; t0 <= 8.001; t0 += 0.1) {
    for (let d = 0.1; d <= 1.601; d += 0.1) {
      const inputs = [[t0, d]];
      attempts.push({ inputs, r: run(ship, bodies, bounds, inputs) });
    }
  }
  return { groups: collect(attempts), total: attempts.length };
}

function slingLeg(entry, anchor, bodies, bounds) {
  const attempts = [];
  for (let wait = 0; wait <= SLING.window - 0.01; wait += 0.1) {
    for (const hold of [0, 0.5, 1.3]) {
      if (wait + hold > SLING.window) continue;
      const o = P.makeSlingOrbit(entry, anchor);
      for (let i = 0; i < Math.round((SLING.enterGap + wait) / DT); i++) P.slingStep(o, DT, false);
      for (let i = 0; i < Math.round(hold / DT); i++) P.slingStep(o, DT, true);
      const launch = P.slingLaunch(o, anchor);
      // the lock after launch: straight flight, no zones
      attempts.push({ inputs: [['launch', wait, hold]], r: run(launch, bodies, bounds, [], HORIZON, SLING.exitGap) });
    }
  }
  return { groups: collect(attempts), total: attempts.length };
}

// Coast straight through a storm/lens zone, then sit out the exit lock.
function throughZone(s0, zone, bodies, mode) {
  const s = P.cloneShip(s0);
  s.ignore.push(zone.id);
  for (let i = 0; i < 30 / DT; i++) {
    const ev = P.stepShip(s, bodies, DT, false, false);
    if (ev && ev.type === 'crash') return null;
    if (Math.hypot(s.px - zone.x, s.py - zone.y, s.pz - zone.z) > zone.zone) break;
  }
  return { ship: s, lock: mode === 'shield' ? SHIELD.exitGap : LENS.exitGap };
}

const pct = (n, total) => `${(100 * n / total).toFixed(1)}%`;

function checkLevel(li) {
  const L = LEVELS[li];
  console.log(`\n=== Level ${li + 1}: ${L.name} — ${L.subtitle}`);
  const base = P.makeBodies(L);
  const nEmbers = base.filter(b => b.ember).length;
  const subjects = base.filter(b => b.trigger === 'lens').length;
  let best = null;

  // depth-first search; prefers the most forgiving option at every step
  function solve(ship, lock, lit, done, log, depth) {
    if (lit.length === nEmbers) { best = { log, done }; return true; }
    if (depth > 24) return false;
    const bodies = world(L, lit, done);
    // a pending lock (after a sling launch or a zone) is flown first
    if (lock > 0) {
      const r = run(ship, bodies, L.bounds, [], lock + 0.01, lock + 1);
      if (r.ev && r.ev.type === 'crash') return false;
      ship = r.s;
    }
    const { groups, total } = freeLeg(ship, bodies, L.bounds);
    const opts = [...groups.entries()].sort((a, b) => {
      const pa = a[0].startsWith('kindle') ? 1 : 0, pb = b[0].startsWith('kindle') ? 1 : 0;
      return pb - pa || b[1].length - a[1].length;
    });
    for (const [k, sols] of opts.slice(0, 3)) {
      const pick = sols[Math.floor(sols.length / 2)];
      const ev = pick.r.ev, b = ev.body;
      const how = pick.inputs.length ? `press@${pick.inputs[0][0].toFixed(1)}s hold ${pick.inputs[0][1].toFixed(1)}s` : 'no input';
      const line = `${k.padEnd(10)} ${pct(sols.length, total).padStart(6)} of inputs  (${how})`;
      if (ev.mode === 'kindle') {
        const nb = world(L, lit, done);
        const o = P.makeKindleOrbit(pick.r.s, nb[b.id]);
        const next = P.newShip({ pos: o.E, dir: o.h });
        next.ignore = [b.id];
        if (solve(next, 0, [...lit, b.id], done, [...log, line], depth + 1)) return true;
      } else if (ev.mode === 'sling') {
        const sl = slingLeg(pick.r.s, b, bodies, L.bounds);
        const sOpts = [...sl.groups.entries()].sort((a, c) => c[1].length - a[1].length);
        for (const [sk, ss] of sOpts.slice(0, 3)) {
          const sp = ss[Math.floor(ss.length / 2)];
          const sev = sp.r.ev;
          const sline = `  sling → ${sk.padEnd(10)} ${pct(ss.length, sl.total).padStart(6)} of launches (wait ${sp.inputs[0][1].toFixed(1)}s, hold ${sp.inputs[0][2]}s)`;
          // continue from the launch outcome as if it were reached by a free leg
          const sub = continueFrom(sev, sp.r.s, lit, done, [...log, line, sline], depth + 1);
          if (sub) return true;
        }
      } else {
        const z = throughZone(pick.r.s, b, bodies, ev.mode);
        if (!z) continue;
        const nd = ev.mode === 'lens' ? [...done, b.id] : done;
        if (solve(z.ship, z.lock, lit, nd, [...log, line], depth + 1)) return true;
      }
    }
    return false;
  }

  function continueFrom(ev, s, lit, done, log, depth) {
    const bodies = world(L, lit, done);
    const b = bodies[ev.body.id];
    if (ev.mode === 'kindle') {
      const o = P.makeKindleOrbit(s, b);
      const next = P.newShip({ pos: o.E, dir: o.h });
      next.ignore = [b.id];
      return solve(next, 0, [...lit, b.id], done, log, depth);
    }
    if (ev.mode === 'shield' || ev.mode === 'lens') {
      const z = throughZone(s, b, bodies, ev.mode);
      return z && solve(z.ship, z.lock, lit, ev.mode === 'lens' ? [...done, b.id] : done, log, depth);
    }
    if (ev.mode === 'sling') {
      // chained spindles: hand the entry back to solve() via a tiny free leg
      return solve(s, 0, lit, done, log, depth);
    }
    return false;
  }

  const ok = solve(P.newShip(L.start), 0, [], [], [], 0);
  if (!ok) { console.log('  ✗ NOT SOLVABLE with single presses between stops'); return false; }
  best.log.forEach((l, i) => console.log(`  ${String(i + 1).padStart(2)}. ${l}`));
  const photos = best.done.length;
  console.log(`  ✓ solvable${subjects ? ` (photo subjects passed on this route: ${photos}/${subjects})` : ''}`);
  return true;
}

const args = process.argv.slice(2);
if (args[0] === 'trace') {
  const L = LEVELS[+args[1]];
  const bodies = P.makeBodies(L);
  const inputs = (args[2] || '').split(',').filter(Boolean).map(s => s.split(':').map(Number));
  const s = P.newShip(L.start);
  let holding = false;
  for (let i = 0; i < 14 / DT; i++) {
    const t = i * DT;
    let want = false;
    for (const [t0, d] of inputs) if (t >= t0 && t < t0 + d) want = true;
    if (holding && !want) P.release(s);
    holding = want;
    const ev = P.stepShip(s, bodies, DT, holding);
    if (i % 30 === 0) console.log(`t=${t.toFixed(2)} (${[s.px, s.py, s.pz].map(v => v.toFixed(1)).join(', ')}) charge=${s.charge.toFixed(2)} target=${s.targetId}`);
    if (ev) { console.log('event:', ev.type, ev.mode || '', `#${ev.body.id}`, `t=${t.toFixed(2)}`); break; }
  }
} else {
  const which = args.length ? [+args[0]] : LEVELS.map((_, i) => i);
  let ok = true;
  for (const li of which) ok = checkLevel(li) && ok;
  process.exit(ok ? 0 : 1);
}
