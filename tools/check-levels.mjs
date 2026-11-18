// Offline level checker. Runs the real physics (src/physics.js) and searches
// one-key inputs (press at t0, release after `hold`) between kindle stops to
// prove every level can be completed, and to measure how forgiving each leg is.
//
//   node tools/check-levels.mjs            check all levels
//   node tools/check-levels.mjs 2          check level index 2 only
//   node tools/check-levels.mjs trace 2 "1.2:0.8,4:0.5"   trace scripted inputs
//        (inputs are pressTime:holdSeconds, times relative to the leg start)

import { LEVELS } from '../src/levels.js';
import {
  PHYS, makeBodies, newShip, cloneShip, stepShip, release, makeKindleOrbit, lightEmber, nearWell,
} from '../src/physics.js';

const DT = PHYS.dt;
const HORIZON = 11;

function runLeg(ship0, bodies, bounds, inputs, horizon = HORIZON, trace = null) {
  const s = cloneShip(ship0);
  const steps = Math.round(horizon / DT);
  let holding = false, far = 0;
  for (let i = 0; i < steps; i++) {
    const t = i * DT;
    let want = false;
    for (const [t0, d] of inputs) if (t >= t0 && t < t0 + d) want = true;
    if (holding && !want) release(s);
    holding = want;
    const ev = stepShip(s, bodies, DT, holding, null);
    if (trace && i % 30 === 0) trace.push([t, s.px, s.py, s.pz, s.charge, s.targetId]);
    if (ev) return { ev, s, t };
    // same "lost in the void" rule as the game
    far = nearWell(s, bodies) ? 0 : far + DT;
    const c = bounds.center;
    if (far > PHYS.lostTime || Math.hypot(s.px - c[0], s.py - c[1], s.pz - c[2]) > bounds.radius) {
      return { ev: { type: 'lost', body: { id: -1 } }, s, t };
    }
  }
  return { ev: null, s, t: horizon };
}

function exitShip(s, ember) {
  const o = makeKindleOrbit(s, ember);
  const ns = newShip({ pos: o.E, dir: o.h });
  ns.ignoreCorona = ember.id;
  return ns;
}

function searchLeg(ship, bodies, bounds) {
  const results = new Map(); // emberId -> list of {t0,d,s}
  let total = 0;
  const tryInputs = (inputs) => {
    total++;
    const r = runLeg(ship, bodies, bounds, inputs);
    if (r.ev && r.ev.type === 'corona') {
      const id = r.ev.body.id;
      if (!results.has(id)) results.set(id, []);
      results.get(id).push({ inputs, s: r.s, t: r.t });
    }
  };
  tryInputs([]);
  for (let t0 = 0; t0 <= 8; t0 += 0.1) {
    for (let d = 0.1; d <= 1.61; d += 0.1) tryInputs([[t0, d]]);
  }
  return { results, total };
}

function fmt(n) { return n.toFixed(1).padStart(6); }

function checkLevel(li) {
  const L = LEVELS[li];
  console.log(`\n=== Level ${li + 1}: ${L.name} — ${L.subtitle}`);
  const bodies = makeBodies(L);
  const embers = bodies.filter(b => b.ember);
  let ship = newShip(L.start);
  let clock = 0;
  const order = [];
  // Greedy walk: each leg, pick the reachable ember with the most solutions.
  while (order.length < embers.length) {
    const { results, total } = searchLeg(ship, bodies, L.bounds);
    const opts = [...results.entries()].filter(([id]) => !bodies[id].lit);
    if (!opts.length) {
      console.log(`  ✗ STUCK after [${order.join(', ')}] — no single-release input reaches an unlit ember`);
      return false;
    }
    opts.sort((a, b) => b[1].length - a[1].length);
    const summary = opts.map(([id, l]) => `#${id}:${(100 * l.length / total).toFixed(1)}%`).join('  ');
    const [id, sols] = opts[0];
    const pick = sols[Math.floor(sols.length / 2)];
    const straight = sols.some(x => x.inputs.length === 0);
    console.log(`  leg ${order.length + 1}: reachable ${summary}  → take #${id}` +
      `${straight ? ' (no input needed)' : ` e.g. press@${pick.inputs[0][0].toFixed(1)}s hold ${pick.inputs[0][1].toFixed(1)}s`}` +
      `  arrive t+${pick.t.toFixed(1)}s`);
    clock += pick.t + 5;
    order.push(id);
    lightEmber(bodies[id]);
    ship = exitShip(pick.s, bodies[id]);
    const E = [ship.px, ship.py, ship.pz];
    console.log(`         exit at (${E.map(fmt).join(',')}) heading (${[ship.vx, ship.vy, ship.vz].map(v => (v / PHYS.cruise).toFixed(2)).join(', ')})`);
  }
  console.log(`  ✓ solvable, order ${order.join(' → ')}, ~${clock.toFixed(0)}s incl. kindles`);
  return true;
}

const args = process.argv.slice(2);
if (args[0] === 'trace') {
  const li = +args[1];
  const L = LEVELS[li];
  const bodies = makeBodies(L);
  const inputs = (args[2] || '').split(',').filter(Boolean).map(s => s.split(':').map(Number));
  const tr = [];
  const r = runLeg(newShip(L.start), bodies, L.bounds, inputs, 14, tr);
  for (const [t, x, y, z, c, tid] of tr) console.log(`t=${t.toFixed(2)}  (${fmt(x)},${fmt(y)},${fmt(z)})  charge=${c.toFixed(2)} target=${tid}`);
  console.log('end:', r.ev ? `${r.ev.type} body #${r.ev.body.id}` : 'none', `at t=${r.t.toFixed(2)}`, `(${fmt(r.s.px)},${fmt(r.s.py)},${fmt(r.s.pz)})`);
} else {
  const which = args.length ? [+args[0]] : LEVELS.map((_, i) => i);
  let ok = true;
  for (const li of which) ok = checkLevel(li) && ok;
  process.exit(ok ? 0 : 1);
}
