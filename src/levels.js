// Level data. Positions are in world units (the comet drifts at ~26 u/s).
// Embers are dormant stars: fly into their corona to kindle them.
// Every level here was laid out along real flight paths and is verified by
// `npm run check-levels`, which searches one-key inputs with the game physics.

export const LEVELS = [
  {
    id: 'lantern', name: 'The Lantern', subtitle: 'First Light',
    intro: 'Four cold stars. Fly into a star’s ring to kindle it.',
    start: { pos: [0, 0, 0], dir: [0, 0, -1] },
    bodies: [
      {type: 'ember', pos: [4, 0, -82], r: 7.5, lane: [0, 0, -1], name: 'Ves', band: {center: 0.56, width: 0.22, speed: 0.62, wobble: 0}},
      {type: 'rock', pos: [40, 0, -176.2], r: 9, palette: 'teal'},
      {type: 'ember', pos: [67.3, -2, -231.2], r: 7.5, lane: [0.811, 0, -0.586], name: 'Orra', band: {center: 0.62, width: 0.22, speed: 0.62, wobble: 0}},
      {type: 'ice', pos: [137.3, 30, -286.7], r: 7, palette: 'mint'},
      {type: 'ember', pos: [182.9, 39.7, -323], r: 7.5, lane: [0.579, 0.631, -0.516], name: 'Talin', band: {center: 0.68, width: 0.22, speed: 0.62, wobble: 0}},
      {type: 'moon', pos: [214, 90.9, -382.8], r: 3.5, palette: 'moon'},
      {type: 'ember', pos: [262.7, 132.9, -407.1], r: 7.5, lane: [0.4, 0.612, -0.682], name: 'Mey', band: {center: 0.59, width: 0.22, speed: 0.62, wobble: 0}},
    ],
  },
  {
    id: 'heron', name: 'The Heron', subtitle: 'Long Neck Down',
    intro: 'The heron dives. Borrow from below to follow it.',
    start: { pos: [0, 0, 0], dir: [0, 0, -1] },
    bodies: [
      {type: 'rock', pos: [-34, 0, -85], r: 8, palette: 'rust'},
      {type: 'ember', pos: [-62.1, 2, -143.2], r: 6, lane: [-0.785, 0, -0.619], name: 'Quill', band: {center: 0.62, width: 0.17, speed: 0.75, wobble: 0}},
      {type: 'giant', pos: [-144.2, -24, -263.9], r: 14, palette: 'storm'},
      {type: 'ember', pos: [-162.2, -45.4, -325.9], r: 6, lane: [0.156, -0.463, -0.873], name: 'Sora', band: {center: 0.68, width: 0.17, speed: 0.75, wobble: 0}},
      {type: 'moon', pos: [-133.4, -73.9, -384.9], r: 3.2, palette: 'ash'},
      {type: 'ember', pos: [-118.6, -104.7, -449.9], r: 6, lane: [0.46, -0.378, -0.803], name: 'Hesk', band: {center: 0.74, width: 0.17, speed: 0.75, wobble: 0}},
      {type: 'rock', pos: [-75.5, -181.2, -525.2], r: 10, palette: 'teal'},
      {type: 'ember', pos: [-56.5, -224.4, -562.4], r: 6, lane: [0.099, -0.98, -0.175], name: 'Ilu', band: {center: 0.65, width: 0.17, speed: 0.75, wobble: 0}},
      {type: 'ice', pos: [-68, -319.6, -603.1], r: 7, palette: 'mint'},
      {type: 'ember', pos: [-61.2, -369, -613.6], r: 6, lane: [-0.355, -0.712, -0.606], name: 'Dun', band: {center: 0.71, width: 0.17, speed: 0.75, wobble: 0}},
    ],
  },
  {
    id: 'twins', name: 'Twin Wells', subtitle: 'Two Giants, One Gap',
    intro: 'Between two giants the pull switches sides. Watch the tether.',
    start: { pos: [0, 0, 0], dir: [0, 0, -1] },
    bodies: [
      {type: 'giant', pos: [-42, 0, -105], r: 13, palette: 'storm'},
      {type: 'giant', pos: [42, 6, -150], r: 13, palette: 'amber', rings: true},
      {type: 'ember', pos: [78.2, 14.1, -186.1], r: 6, lane: [0.947, 0.135, -0.292], name: 'Pallas', band: {center: 0.66, width: 0.15, speed: 0.85, wobble: 0.04}},
      {type: 'rock', pos: [167.7, 61.2, -213.7], r: 9, palette: 'teal'},
      {type: 'ember', pos: [214.1, 91.9, -231.1], r: 6, lane: [0.435, 0.891, -0.134], name: 'Rhee', band: {center: 0.72, width: 0.15, speed: 0.85, wobble: 0.04}},
      {type: 'moon', pos: [251.2, 157.9, -263.4], r: 3, palette: 'ash'},
      {type: 'ember', pos: [286.5, 227.7, -268.7], r: 6, lane: [0.45, 0.82, -0.353], name: 'Kest', band: {center: 0.78, width: 0.15, speed: 0.85, wobble: 0.04}},
      {type: 'giant', pos: [390.3, 358.3, -284], r: 15, palette: 'amber'},
      {type: 'ember', pos: [409.4, 393.4, -296.3], r: 6, lane: [0.763, 0.449, 0.464], name: 'Yva', band: {center: 0.69, width: 0.15, speed: 0.85, wobble: 0.04}},
      {type: 'ice', pos: [482.9, 407.5, -251.6], r: 6, palette: 'mint'},
      {type: 'ember', pos: [528.9, 430.8, -223.6], r: 6, lane: [0.85, -0.103, 0.517], name: 'Orun', band: {center: 0.75, width: 0.15, speed: 0.85, wobble: 0.04}},
    ],
  },
  {
    id: 'horizon', name: 'Event Horizon', subtitle: 'Do Not Linger',
    intro: 'Black holes lend gravity fast — very fast. Tap, don’t hold.',
    start: { pos: [0, 0, 0], dir: [0, 0, -1] },
    bodies: [
      {type: 'rock', pos: [28, 0, -80], r: 8, palette: 'sand'},
      {type: 'ember', pos: [37.9, 2, -130.5], r: 6, lane: [0.657, 0, -0.754], name: 'Teth', band: {center: 0.64, width: 0.13, speed: 0.95, wobble: 0.07}},
      {type: 'blackhole', pos: [98.1, 2, -236.1], r: 2.5},
      {type: 'ember', pos: [87.2, 5, -263.6], r: 6, lane: [-0.782, 0, -0.623], name: 'Lio', band: {center: 0.7, width: 0.13, speed: 0.95, wobble: 0.07}},
      {type: 'moon', pos: [25.3, -17, -313], r: 3.2, palette: 'moon'},
      {type: 'ember', pos: [-28.8, -10, -353.5], r: 6, lane: [-0.757, -0.247, -0.604], name: 'Marr', band: {center: 0.76, width: 0.13, speed: 0.95, wobble: 0.07}},
      {type: 'blackhole', pos: [-112, -34.2, -453.1], r: 2.5},
      {type: 'ember', pos: [-134, -44.9, -463.2], r: 6, lane: [-0.038, 0.073, -0.997], name: 'Asa', band: {center: 0.67, width: 0.13, speed: 0.95, wobble: 0.07}},
      {type: 'giant', pos: [-139.5, 9.9, -608.7], r: 13, palette: 'storm', rings: true},
      {type: 'ember', pos: [-140.7, 21.8, -640.2], r: 6, lane: [-0.009, 0.963, -0.27], name: 'Wren', band: {center: 0.73, width: 0.13, speed: 0.95, wobble: 0.07}},
    ],
  },
  {
    id: 'crown', name: 'The Sleeping Crown', subtitle: 'Six Stars',
    intro: 'Everything you have learned. Wake the crown.',
    start: { pos: [0, 0, 0], dir: [0, 0, -1] },
    bodies: [
      {type: 'ember', pos: [-3, 3, -87.2], r: 6, lane: [0, 0, -1], name: 'Calo', band: {center: 0.66, width: 0.12, speed: 1.05, wobble: 0.09}},
      {type: 'giant', pos: [-55, 3, -226.4], r: 14, palette: 'rose'},
      {type: 'ember', pos: [-71.8, 3, -274.6], r: 6, lane: [-0.924, 0, -0.383], name: 'Iri', band: {center: 0.72, width: 0.12, speed: 1.05, wobble: 0.09}},
      {type: 'blackhole', pos: [-174.3, -17, -338.7], r: 2.5},
      {type: 'ember', pos: [-198.2, -20.8, -355.5], r: 6, lane: [-0.133, -0.645, -0.752], name: 'Bex', band: {center: 0.78, width: 0.12, speed: 1.05, wobble: 0.09}},
      {type: 'rock', pos: [-215, -60.4, -450.5], r: 9, palette: 'rust'},
      {type: 'ember', pos: [-226.3, -73.6, -502.7], r: 6, lane: [-0.165, 0.323, -0.932], name: 'Nolu', band: {center: 0.69, width: 0.12, speed: 1.05, wobble: 0.09}},
      {type: 'moon', pos: [-255.4, -51.3, -564.1], r: 3, palette: 'moon'},
      {type: 'ice', pos: [-224.4, -15.2, -664.3], r: 7, palette: 'mint'},
      {type: 'ember', pos: [-306, 3.5, -712.8], r: 6, lane: [-0.422, 0.31, -0.852], name: 'Fen', band: {center: 0.75, width: 0.12, speed: 1.05, wobble: 0.09}},
      {type: 'blackhole', pos: [-379.6, 40.5, -802.8], r: 2.5},
      {type: 'ember', pos: [-404.8, 46.4, -810.3], r: 6, lane: [-0.944, 0.043, 0.328], name: 'Oska', band: {center: 0.66, width: 0.12, speed: 1.05, wobble: 0.09}},
    ],
  },
  {
    id: 'spindle', name: 'The Spindle', subtitle: 'Wind Up, Let Go',
    intro: 'Violet spindle stars swing you round in orbit. Tap when the violet line points at the next star, and you launch that way.',
    start: { pos: [0, 0, 0], dir: [0, 0, -1] },
    bodies: [
      {type: 'rock', pos: [30, 0, -80], r: 8, palette: 'violet'},
      {type: 'ember', pos: [37.1, 0, -126.5], r: 6, lane: [0.736, 0, -0.677], name: 'Tamsin', band: {center: 0.62, width: 0.15, speed: 0.85, wobble: 0.03}},
      {type: 'anchor', pos: [109.5, 0, -179.5], r: 2.2, zone: 24},
      {type: 'ember', pos: [218.9, 2, -152.7], r: 7.5, lane: [0.931, 0, 0.364], name: 'Oro', band: {center: 0.68, width: 0.15, speed: 0.85, wobble: 0.03}},
      {type: 'moon', pos: [299.8, 8, -142.6], r: 3.2, palette: 'ash'},
      {type: 'ember', pos: [362.5, 6.5, -114.9], r: 6, lane: [0.992, 0.082, 0.095], name: 'Velle', band: {center: 0.74, width: 0.15, speed: 0.85, wobble: 0.03}},
      {type: 'anchor', pos: [456.6, 18.2, -115.9], r: 2.2, zone: 24},
      {type: 'ember', pos: [338.4, 23.1, -164.8], r: 7.5, lane: [-0.96, -0.005, -0.281], name: 'Ashk', band: {center: 0.65, width: 0.15, speed: 0.85, wobble: 0.03}},
    ],
  },
  {
    id: 'wind', name: 'Solar Wind', subtitle: 'Shields Up',
    intro: 'Storm fronts throw flares. Hold Shift to raise your shield when the warning ring closes. Shield energy runs out.',
    start: { pos: [0, 0, 0], dir: [0, 0, -1] },
    bodies: [
      {type: 'rock', pos: [-32, 0, -85], r: 9, palette: 'sand'},
      {type: 'ember', pos: [-48.3, 2, -129.7], r: 6, lane: [-0.858, 0, -0.513], name: 'Bryn', band: {center: 0.64, width: 0.14, speed: 0.9, wobble: 0.05}},
      {type: 'storm', pos: [-160.6, 2, -213.1], r: 6, zone: 85, rate: 1.25, from: 3},
      {type: 'flarestar', pos: [-78, 52, -351.3], r: 10},
      {type: 'ember', pos: [-303.5, 2, -284.6], r: 6, lane: [-0.858, 0, -0.513], name: 'Ottoline', band: {center: 0.7, width: 0.14, speed: 0.9, wobble: 0.05}},
      {type: 'anchor', pos: [-380.1, -8, -330.4], r: 2.2, zone: 24},
      {type: 'ember', pos: [-442.4, -106.2, -367.6], r: 7.5, lane: [-0.41, -0.879, -0.245], name: 'Sef', band: {center: 0.76, width: 0.14, speed: 0.9, wobble: 0.05}},
      {type: 'storm', pos: [-510.5, -224.5, -396.7], r: 6, zone: 80, rate: 0.95, from: 8},
      {type: 'flarestar', pos: [-630.7, -181.7, -287.9], r: 11},
      {type: 'ember', pos: [-564.6, -368.2, -440.6], r: 6, lane: [-0.41, -0.879, -0.245], name: 'Corra', band: {center: 0.67, width: 0.14, speed: 0.9, wobble: 0.05}},
    ],
  },
  {
    id: 'exposure', name: 'Long Exposure', subtitle: 'Hold Still',
    intro: 'Rare sights drift past. Hold Shift to focus, let go to take the picture. Photos are optional — but beautiful.',
    start: { pos: [0, 0, 0], dir: [0, 0, -1] },
    bodies: [
      {type: 'subject', pos: [22, 6, -110], r: 7, zone: 60, kind: 'bloom', name: 'The Bloom', focus: 0.62},
      {type: 'ember', pos: [0, 2, -251], r: 6, lane: [0, 0, -1], name: 'Ilse', band: {center: 0.64, width: 0.14, speed: 0.92, wobble: 0.05}},
      {type: 'rock', pos: [-30, -4, -350.2], r: 9, palette: 'rust'},
      {type: 'ember', pos: [-51.4, -8.5, -398.7], r: 6, lane: [-0.863, -0.173, -0.475], name: 'Maro', band: {center: 0.7, width: 0.14, speed: 0.92, wobble: 0.05}},
      {type: 'subject', pos: [-161.8, -42.9, -436.6], r: 6, zone: 60, kind: 'dancers', name: 'The Dancers', focus: 0.74},
      {type: 'ember', pos: [-277.5, -53.6, -520.8], r: 6, lane: [-0.863, -0.173, -0.475], name: 'Quen', band: {center: 0.76, width: 0.14, speed: 0.92, wobble: 0.05}},
      {type: 'giant', pos: [-377.9, -67.8, -626.3], r: 13, palette: 'rose', rings: true},
      {type: 'ember', pos: [-405.4, -72.2, -668.3], r: 6, lane: [0.097, 0.142, -0.985], name: 'Daphe', band: {center: 0.67, width: 0.14, speed: 0.92, wobble: 0.05}},
      {type: 'anchor', pos: [-388.7, -67.5, -756.5], r: 2.2, zone: 24},
      {type: 'ember', pos: [-330.8, -146.6, -669.5], r: 7.5, lane: [0.375, -0.555, 0.742], name: 'Lune', band: {center: 0.73, width: 0.14, speed: 0.92, wobble: 0.05}},
    ],
  },
  {
    id: 'mirror', name: 'The Mirror', subtitle: 'Push, Don’t Pull',
    intro: 'White holes push instead of pull. Borrow from one and it sends you away.',
    start: { pos: [0, 0, 0], dir: [0, 0, -1] },
    bodies: [
      {type: 'whitehole', pos: [-26, 0, -75], r: 6},
      {type: 'ember', pos: [35.4, 0, -152.5], r: 6, lane: [0.458, 0, -0.889], name: 'Vey', band: {center: 0.66, width: 0.13, speed: 1, wobble: 0.07}},
      {type: 'whitehole', pos: [80.8, 28, -240.7], r: 7},
      {type: 'ember', pos: [113.9, -36.4, -304.7], r: 6, lane: [0.397, -0.502, -0.768], name: 'Halcy', band: {center: 0.72, width: 0.13, speed: 1, wobble: 0.07}},
      {type: 'blackhole', pos: [182.6, -96.3, -385.3], r: 2.5},
      {type: 'ember', pos: [205.9, -107.3, -398.6], r: 6, lane: [0.972, -0.186, 0.142], name: 'Orsk', band: {center: 0.78, width: 0.13, speed: 1, wobble: 0.07}},
      {type: 'anchor', pos: [295.3, -116, -393.6], r: 2.2, zone: 24},
      {type: 'ember', pos: [260.2, -15.3, -489.8], r: 7.5, lane: [-0.356, 0.681, -0.64], name: 'Nim', band: {center: 0.69, width: 0.13, speed: 1, wobble: 0.07}},
      {type: 'subject', pos: [195.1, 69.1, -557.5], r: 6, zone: 55, kind: 'crystal', name: 'The Prism', focus: 0.55},
      {type: 'ember', pos: [168.4, 160.3, -654.8], r: 6, lane: [-0.356, 0.681, -0.64], name: 'Saro', band: {center: 0.75, width: 0.13, speed: 1, wobble: 0.07}},
    ],
  },
  {
    id: 'everylight', name: 'Every Light', subtitle: 'The Whole Sky',
    intro: 'Every way Shift can work, one after another. Watch the colour, and read each card before you tap.',
    start: { pos: [0, 0, 0], dir: [0, 0, -1] },
    bodies: [
      {type: 'rock', pos: [32, 0, -85], r: 8, palette: 'teal'},
      {type: 'ember', pos: [42.6, 2, -135.3], r: 6, lane: [0.797, 0, -0.604], name: 'Aster', band: {center: 0.66, width: 0.11, speed: 1.1, wobble: 0.1}},
      {type: 'storm', pos: [142.3, 2, -225.9], r: 6, zone: 80, rate: 0.85, from: 3},
      {type: 'flarestar', pos: [75.9, 62, -355], r: 10},
      {type: 'ember', pos: [277.5, 2, -310.8], r: 6, lane: [0.797, 0, -0.604], name: 'Kell', band: {center: 0.72, width: 0.11, speed: 1.1, wobble: 0.1}},
      {type: 'anchor', pos: [342.6, 2, -372.6], r: 2.2, zone: 24},
      {type: 'ember', pos: [304.7, 0, -488.4], r: 7.5, lane: [-0.424, 0, -0.905], name: 'Imra', band: {center: 0.78, width: 0.11, speed: 1.1, wobble: 0.1}},
      {type: 'whitehole', pos: [262.7, -26, -578], r: 6},
      {type: 'ember', pos: [226.9, 30.7, -649.7], r: 6, lane: [-0.383, 0.43, -0.818], name: 'Toven', band: {center: 0.69, width: 0.11, speed: 1.1, wobble: 0.1}},
      {type: 'subject', pos: [199.4, 81.9, -755.7], r: 7, zone: 60, kind: 'bloom', name: 'The Last Bloom', focus: 0.8},
      {type: 'ember', pos: [128, 143.9, -860.8], r: 6, lane: [-0.383, 0.43, -0.818], name: 'Ysa', band: {center: 0.75, width: 0.11, speed: 1.1, wobble: 0.1}},
      {type: 'blackhole', pos: [60.6, 195.1, -948.1], r: 2.5},
      {type: 'ember', pos: [33.6, 201.4, -950.3], r: 6, lane: [-0.916, 0.011, 0.4], name: 'Fiore', band: {center: 0.66, width: 0.11, speed: 1.1, wobble: 0.1}},
    ],
  }
];

// Fill in derived data: play-area bounds and constellation lines.
for (const L of LEVELS) {
  const pts = [L.start.pos, ...L.bodies.map(b => b.pos)];
  const c = [0, 1, 2].map(i => pts.reduce((s, p) => s + p[i], 0) / pts.length);
  const r = Math.max(...pts.map(p => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])));
  L.bounds = L.bounds || { center: c, radius: r + 140 };
  const embers = L.bodies.map((b, i) => (b.type === 'ember' ? i : -1)).filter(i => i >= 0);
  L.lines = L.lines || embers.slice(1).map((e, k) => [embers[k], e]);
}
