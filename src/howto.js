// How-to cards: shown on the switch card while the game waits for the player
// to tap Shift and start the next mode. Each has a tiny diagram and three steps.
// Colours come from the CSS variables, so the diagrams follow the mode palette.

const cy = 'var(--cyan)', am = 'var(--amber)', vi = 'var(--violet)', gr = 'var(--green)', pk = 'var(--pink)', rd = 'var(--red)';
const spark = (x, y) => `<circle cx="${x}" cy="${y}" r="6" fill="#bfefff" opacity=".25"/><circle cx="${x}" cy="${y}" r="3" fill="#fff"/>`;
const target = (x, y, r = 9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" style="stroke:${am}" stroke-width="1.6" stroke-dasharray="3 2.5"/><circle cx="${x}" cy="${y}" r="2.6" style="fill:${am}"/>`;
const svg = (body) => `<svg viewBox="0 0 120 90" aria-hidden="true">${body}</svg>`;

export const HOWTO = {
  flight: {
    svg: svg(`
      <circle cx="66" cy="62" r="9" fill="#2c6c78"/>
      <circle cx="66" cy="62" r="25" fill="none" style="stroke:${cy}" stroke-width="1.2" stroke-dasharray="3 3" opacity=".7"/>
      <line x1="12" y1="26" x2="116" y2="26" stroke="#fff" stroke-width="1" stroke-dasharray="2 4" opacity=".3"/>
      <path d="M12,26 C40,26 56,30 70,30 C84,30 96,22 104,14" fill="none" style="stroke:${cy}" stroke-width="2.4" stroke-dasharray="5 3"/>
      ${target(106, 12)}${spark(12, 26)}`),
    steps: [
      'No Shift, no gravity: you drift straight. Inside a planet’s <span class="cy">dashed ring</span>, <b>hold</b> to borrow its pull.',
      'The bright path shows where you go <b>if you let go now</b>. It swings as you pass.',
      '<b>Let go</b> when it ends in the ring marked <span class="amb">NEXT</span>.',
    ],
  },
  kindle: {
    svg: svg(`
      <path d="M38.8,71.2 A30,30 0 1 1 81.2,71.2" fill="none" stroke="rgba(255,220,170,.18)" stroke-width="7" stroke-linecap="round"/>
      <path d="M68.4,21.2 A30,30 0 0 1 89.1,42.5" fill="none" style="stroke:${am}" stroke-width="8"/>
      <path d="M75.6,23.7 A30,30 0 0 1 81.6,29.2" fill="none" stroke="#fff" stroke-width="8"/>
      <line x1="60" y1="50" x2="76.7" y2="30.1" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="60" cy="50" r="5" style="fill:${am}"/>`),
    steps: [
      'The star holds you in orbit. You can’t crash here.',
      '<b>Hold</b> Shift: the needle climbs.',
      '<b>Let go</b> inside the <span class="amb">amber band</span> (the white sliver is perfect). Missed? It drains: try again.',
    ],
  },
  sling: {
    svg: svg(`
      <circle cx="40" cy="52" r="20" fill="none" style="stroke:${vi}" stroke-width="1.2" stroke-dasharray="3 3" opacity=".8"/>
      <path d="M53,37 A20,20 0 0 1 59,47" fill="none" style="stroke:${vi}" stroke-width="1.6"/>
      <path d="M59,47 l-4,-1 m4,1 l1,-4" fill="none" style="stroke:${vi}" stroke-width="1.6"/>
      <line x1="60" y1="52" x2="60" y2="88" style="stroke:${vi}" stroke-width="1.6" stroke-dasharray="4 3" opacity=".3"/>
      <line x1="40" y1="32" x2="96" y2="32" style="stroke:${vi}" stroke-width="2.6"/>
      <path d="M92,28 L98,32 L92,36" fill="none" style="stroke:${vi}" stroke-width="2.2"/>
      <circle cx="40" cy="52" r="7" style="fill:${vi}" opacity=".3"/><circle cx="40" cy="52" r="3" fill="#fff"/>
      ${target(108, 32)}${spark(40, 32)}`),
    steps: [
      'The spindle swings you round it. The <b>violet line</b> shows where you’d fly if you let go now. It sweeps as you turn.',
      'When it points into the ring marked <span class="amb">NEXT</span>, <b>tap</b> Shift to launch.',
      'Or <b>hold</b> to spin up for a faster launch (the line sweeps faster), then <b>let go</b>.',
    ],
  },
  shield: {
    svg: svg(`
      <circle cx="14" cy="14" r="7" style="fill:${rd}" opacity=".85"/>
      <line x1="19" y1="19" x2="54" y2="48" style="stroke:${rd}" stroke-width="1.2" stroke-dasharray="3 3" opacity=".7"/>
      <circle cx="62" cy="54" r="26" fill="none" style="stroke:${rd}" stroke-width="2"/>
      <path d="M62,24 v6 M62,84 v-6 M32,54 h6 M92,54 h-6" style="stroke:${rd}" stroke-width="1.6"/>
      <circle cx="62" cy="54" r="11" fill="none" style="stroke:${gr}" stroke-width="1.6" stroke-dasharray="3 2.5"/>
      ${spark(62, 54)}`),
    steps: [
      'You fly straight through the storm. The red star throws flares.',
      'Each flare sends a <span class="red">red ring</span> closing in on you.',
      '<b>Hold</b> when it meets the <span class="grn">green circle</span>. The shield drains fast, so let go between flares.',
    ],
  },
  lens: {
    svg: svg(`
      <path d="M10,22 V10 H22 M98,10 H110 V22 M110,68 V80 H98 M22,80 H10 V68" fill="none" stroke="#fff" stroke-width="1.6" opacity=".8"/>
      <circle cx="60" cy="45" r="15" fill="none" style="stroke:${pk}" stroke-width="1.4"/>
      <g style="fill:${pk}" opacity=".85"><circle cx="64" cy="41" r="4"/><circle cx="70" cy="45" r="3.5"/><circle cx="62" cy="49" r="3.5"/><circle cx="58" cy="43" r="3"/></g>
      <line x1="30" y1="72" x2="90" y2="72" stroke="rgba(255,255,255,.3)" stroke-width="2"/>
      <line x1="72" y1="68" x2="72" y2="76" style="stroke:${pk}" stroke-width="2"/>
      <circle cx="64" cy="72" r="2.6" fill="#fff"/>`),
    steps: [
      'A rare sight! Time slows and you look through a camera.',
      '<b>Hold</b> to focus. The picture sharpens at the mark.',
      '<b>Let go</b> to take the photo when it’s sharp and the sight sits in the circle. Optional: photos refill light.',
    ],
  },
};
