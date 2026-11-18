// Everything visual in 3D: scene, bodies, comet, paths, particles, camera.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const COLORS = {
  cyan: new THREE.Color('#5fe3ff'),
  amber: new THREE.Color('#ffb24a'),
  red: new THREE.Color('#ff4d61'),
  gold: new THREE.Color('#ffd98a'),
  white: new THREE.Color('#ffffff'),
};

const PALETTES = {
  teal: ['#14525c', '#2f9c94', '#9ff0d6'],
  rust: ['#5a2219', '#bb5235', '#f5a66b'],
  violet: ['#2c205c', '#6d4bc0', '#cdb0ff'],
  sand: ['#5e4c30', '#c2a064', '#f6e2b3'],
  ice: ['#2f5a88', '#86bdea', '#eaf7ff'],
  mint: ['#215a4a', '#5fc9a5', '#d9fff0'],
  amber: ['#6c3410', '#dd8636', '#ffd9a0'],
  rose: ['#5c1e3c', '#cc5d8c', '#ffc6dc'],
  storm: ['#202f5e', '#5579cc', '#c6d6ff'],
  moon: ['#4a4f5a', '#9399a6', '#e3e6ec'],
  ash: ['#433d39', '#8c8279', '#dcd2c8'],
};

// ------------------------------------------------------------------ helpers

function makeNoise(seed) {
  const perm = [...Array(256).keys()];
  let s = (seed * 9301 + 49297) % 233280 || 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const val = new Float32Array(256).map(() => rnd());
  const fade = t => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const n3 = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    const X = xi & 255, Y = yi & 255, Z = zi & 255;
    const g = (a, b, c) => val[p[p[p[X + a] + Y + b] + Z + c]];
    return lerp(
      lerp(lerp(g(0, 0, 0), g(1, 0, 0), u), lerp(g(0, 1, 0), g(1, 1, 0), u), v),
      lerp(lerp(g(0, 0, 1), g(1, 0, 1), u), lerp(g(0, 1, 1), g(1, 1, 1), u), v), w);
  };
  return (x, y, z, oct = 4) => {
    let a = 0.5, f = 1, sum = 0;
    for (let i = 0; i < oct; i++) { sum += a * n3(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
    return sum / (1 - Math.pow(0.5, oct));
  };
}

function mixHex(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));
}

function planetTexture(type, palette, seed) {
  const W = 256, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const fbm = makeNoise(seed);
  const [c0, c1, c2] = PALETTES[palette] || PALETTES.teal;
  const A = new THREE.Color(c0), B = new THREE.Color(c1), C = new THREE.Color(c2);
  const tmp = new THREE.Color();
  for (let j = 0; j < H; j++) {
    const lat = (j / (H - 1) - 0.5) * Math.PI;
    for (let i = 0; i < W; i++) {
      const lon = (i / W) * Math.PI * 2;
      const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
      let t;
      if (type === 'giant') {
        const n = fbm(x * 2.2, y * 2.2, z * 2.2, 4);
        t = 0.5 + 0.5 * Math.sin(y * 18 + n * 6.0);
        t = t * 0.8 + fbm(x * 6, y * 30, z * 6, 2) * 0.2;
      } else if (type === 'ice') {
        const n = fbm(x * 3, y * 3, z * 3, 5);
        const ridge = 1 - Math.abs(n * 2 - 1);
        t = 0.75 + 0.25 * n - (ridge > 0.93 ? 0.55 : 0);
      } else if (type === 'moon') {
        const n = fbm(x * 4, y * 4, z * 4, 5);
        const cr = fbm(x * 9 + 10, y * 9, z * 9, 2);
        t = 0.55 + 0.3 * n - (cr > 0.66 ? 0.35 : 0) + (cr > 0.62 && cr <= 0.66 ? 0.25 : 0);
      } else {
        const n = fbm(x * 2.4, y * 2.4, z * 2.4, 5);
        t = n < 0.47 ? n * 0.6 : 0.45 + (n - 0.47) * 1.6;
      }
      t = Math.max(0, Math.min(1, t));
      if (t < 0.5) tmp.copy(A).lerp(B, t * 2); else tmp.copy(B).lerp(C, (t - 0.5) * 2);
      const k = (j * W + i) * 4;
      img.data[k] = tmp.r * 255; img.data[k + 1] = tmp.g * 255; img.data[k + 2] = tmp.b * 255; img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

function shadowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.95)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

function nebulaTexture(seed, color) {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const fbm = makeNoise(seed);
  const c = new THREE.Color(color);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = i / S - 0.5, y = j / S - 0.5;
    const r = Math.hypot(x, y) * 2;
    const n = fbm(i / 40, j / 40, seed, 5);
    let a = Math.max(0, 1 - r) ** 1.6 * Math.max(0, n - 0.35) * 2.6;
    a = Math.min(1, a);
    const k = (j * S + i) * 4;
    img.data[k] = c.r * 255; img.data[k + 1] = c.g * 255; img.data[k + 2] = c.b * 255; img.data[k + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function toonGradient() {
  const tex = new THREE.DataTexture(new Uint8Array([40, 110, 190, 255]), 4, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ shaders

const GLSL_NOISE = `
float hash3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x), mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x), mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y), f.z); }
float fbm3(vec3 p){ float a=0.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s/0.9375; }
`;

function ribbonMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: (opts.color || COLORS.cyan).clone() },
      uEndColor: { value: (opts.endColor || opts.color || COLORS.cyan).clone() },
      uOpacity: { value: opts.opacity ?? 1 },
      uTime: { value: 0 },
      uDash: { value: opts.dash ?? 0 },
      uDashSpeed: { value: opts.dashSpeed ?? 1 },
      uDashDuty: { value: opts.duty ?? 0.5 },
      uFadeIn: { value: opts.fadeIn ?? 0.0 },
      uFadeOut: { value: opts.fadeOut ?? 0.75 },
      uChevron: { value: opts.chevron ? 1 : 0 },
      uCore: { value: opts.core ?? 0.35 },
      uNear: { value: new THREE.Vector2(...(opts.near || [0.5, 2.5])) },
    },
    vertexShader: `
      attribute vec3 aInfo;
      varying vec3 vInfo;
      varying float vDepth;
      void main() {
        vInfo = aInfo;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uEndColor; uniform float uOpacity; uniform float uTime;
      uniform float uDash; uniform float uDashSpeed; uniform float uDashDuty;
      uniform float uFadeIn; uniform float uFadeOut; uniform float uChevron; uniform float uCore;
      uniform vec2 uNear;
      varying vec3 vInfo;
      varying float vDepth;
      void main() {
        float t = vInfo.x, side = vInfo.y, dist = vInfo.z;
        float across = 1.0 - abs(side);
        float a = uOpacity * smoothstep(0.0, 0.8, across) * smoothstep(uNear.x, uNear.y, vDepth);
        a *= smoothstep(0.0, uFadeIn + 1e-4, t);
        a *= 1.0 - smoothstep(uFadeOut, 1.0001, t);
        if (uDash > 0.0) {
          float ph = fract(dist / uDash - uTime * uDashSpeed - uChevron * abs(side) * 0.45);
          a *= smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(uDashDuty, uDashDuty + 0.05, ph));
        }
        vec3 col = mix(uColor, uEndColor, smoothstep(0.45, 1.0, t)) + smoothstep(0.55, 1.0, across) * uCore;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// Camera-facing strip through a list of points.
class Ribbon {
  constructor(maxPts, matOpts) {
    this.max = maxPts;
    this.positions = new Float32Array(maxPts * 6);
    this.info = new Float32Array(maxPts * 6);
    const idx = new Uint16Array((maxPts - 1) * 6);
    for (let i = 0; i < maxPts - 1; i++) {
      const a = 2 * i, b = a + 1, c = a + 2, d = a + 3;
      idx.set([a, b, c, b, d, c], i * 6);
    }
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.infoAttr = new THREE.BufferAttribute(this.info, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aInfo', this.infoAttr);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geometry = g;
    this.material = ribbonMaterial(matOpts);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.u = this.material.uniforms;
  }
  set(pts, n, cam, width) {
    n = Math.min(n, this.max);
    if (n < 2) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const P = this.positions, I = this.info;
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      const px = pts[3 * i], py = pts[3 * i + 1], pz = pts[3 * i + 2];
      const tx = pts[3 * i1] - pts[3 * i0], ty = pts[3 * i1 + 1] - pts[3 * i0 + 1], tz = pts[3 * i1 + 2] - pts[3 * i0 + 2];
      if (i > 0) dist += Math.hypot(px - pts[3 * i - 3], py - pts[3 * i - 2], pz - pts[3 * i - 1]);
      const vx = cam.x - px, vy = cam.y - py, vz = cam.z - pz;
      let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
      const t = i / (n - 1);
      const w = typeof width === 'function' ? width(t) : width;
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx *= w / sl; sy *= w / sl; sz *= w / sl;
      const k = i * 6;
      P[k] = px + sx; P[k + 1] = py + sy; P[k + 2] = pz + sz;
      P[k + 3] = px - sx; P[k + 4] = py - sy; P[k + 5] = pz - sz;
      I[k] = t; I[k + 1] = 1; I[k + 2] = dist;
      I[k + 3] = t; I[k + 4] = -1; I[k + 5] = dist;
    }
    this.geometry.setDrawRange(0, (n - 1) * 6);
    this.posAttr.needsUpdate = true;
    this.infoAttr.needsUpdate = true;
  }
}

function ringMaterial(color, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uOpacity: { value: opts.opacity ?? 0.5 },
      uPx: { value: opts.px ?? 2.0 },
      uDashes: { value: opts.dashes ?? 0 },
      uTime: { value: 0 },
      uSpin: { value: opts.spin ?? 0.02 },
      uFill: { value: opts.fill ?? 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity; uniform float uPx; uniform float uDashes;
      uniform float uTime; uniform float uSpin; uniform float uFill;
      varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float w = max(fwidth(r) * uPx, 0.002);
        float a = 1.0 - smoothstep(w * 0.5, w, abs(r - 0.96));
        if (uDashes > 0.0) {
          float ang = atan(p.y, p.x) / 6.28318 + 0.5;
          a *= step(0.42, fract(ang * uDashes + uTime * uSpin));
        }
        a += uFill * smoothstep(0.3, 0.96, r) * (1.0 - step(0.96, r)) * 0.35;
        gl_FragColor = vec4(uColor, a * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

class Billboard {
  constructor(radius, material) {
    this.mesh = new THREE.Mesh(Billboard.geo, material);
    this.mesh.scale.setScalar(radius / 0.96);
    this.u = material.uniforms;
  }
}
Billboard.geo = new THREE.PlaneGeometry(2, 2);

// ------------------------------------------------------------------ particles

class Particles {
  constructor(n) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.baseSize = new Float32Array(n);
    this.home = new Uint8Array(n);
    this.homePos = new Float32Array(n * 3);
    this.drag = new Float32Array(n);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('color', this.colAttr);
    g.setAttribute('aSize', this.sizeAttr);
    g.setAttribute('aAlpha', this.alphaAttr);
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 color;
        varying vec3 vCol; varying float vA;
        uniform float uScale;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float depth = -mv.z;
          vCol = color;
          vA = aAlpha * smoothstep(4.0, 12.0, depth);   // never let sparks blind the camera
          gl_PointSize = min(aSize * uScale / max(0.5, depth), 48.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vCol; varying float vA;
        void main(){
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float d = dot(c, c);
          if (d > 1.0) discard;
          float a = (1.0 - d); a *= a;
          gl_FragColor = vec4(vCol, a * vA);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
  }
  emit(x, y, z, vx, vy, vz, color, size, life, home = 0, hx = 0, hy = 0, hz = 0, drag = 0.6) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.col[k] = color.r; this.col[k + 1] = color.g; this.col[k + 2] = color.b;
    this.baseSize[i] = size;
    this.life[i] = life; this.maxLife[i] = life;
    this.home[i] = home;
    this.homePos[k] = hx; this.homePos[k + 1] = hy; this.homePos[k + 2] = hz;
    this.drag[i] = drag;
  }
  burst(x, y, z, count, speed, color, size, life, bias = null) {
    for (let j = 0; j < count; j++) {
      let dx = Math.random() * 2 - 1, dy = Math.random() * 2 - 1, dz = Math.random() * 2 - 1;
      const l = Math.hypot(dx, dy, dz) || 1;
      const s = speed * (0.35 + Math.random() * 0.65) / l;
      let vx = dx * s, vy = dy * s, vz = dz * s;
      if (bias) { vx += bias.x; vy += bias.y; vz += bias.z; }
      this.emit(x, y, z, vx, vy, vz, color, size * (0.5 + Math.random()), life * (0.5 + Math.random() * 0.7));
    }
  }
  update(dt, comet) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      if (this.home[i]) {
        const tx = this.home[i] === 1 ? comet.x : this.homePos[k];
        const ty = this.home[i] === 1 ? comet.y : this.homePos[k + 1];
        const tz = this.home[i] === 1 ? comet.z : this.homePos[k + 2];
        const dx = tx - this.pos[k], dy = ty - this.pos[k + 1], dz = tz - this.pos[k + 2];
        const d = Math.hypot(dx, dy, dz);
        if (d < 1.2) { this.life[i] = 0; continue; }
        const sp = 40 + 60 * (1 - this.life[i] / this.maxLife[i]);
        const f = Math.min(1, dt * 5);
        this.vel[k] += (dx / d * sp - this.vel[k]) * f;
        this.vel[k + 1] += (dy / d * sp - this.vel[k + 1]) * f;
        this.vel[k + 2] += (dz / d * sp - this.vel[k + 2]) * f;
      } else {
        const dr = Math.exp(-dt * this.drag[i]);
        this.vel[k] *= dr; this.vel[k + 1] *= dr; this.vel[k + 2] *= dr;
      }
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = f;
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * f);
    }
    this.posAttr.needsUpdate = this.colAttr.needsUpdate = this.sizeAttr.needsUpdate = this.alphaAttr.needsUpdate = true;
  }
  clear() { this.life.fill(0); }
}

// ------------------------------------------------------------------ world

const V = () => new THREE.Vector3();

// Free GPU memory of a subtree (shared geometry and cached textures survive).
function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && o.geometry !== Billboard.geo) o.geometry.dispose();
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.userData.ownMap && m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
}
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#03040a');
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 8000);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.95, 0.55, 0.18);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.glowTex = glowTexture();
    this.shadowTex = shadowTexture();
    this.toonGrad = toonGradient();
    this.texCache = new Map();

    this.scene.add(new THREE.AmbientLight('#4a5a8a', 0.55));
    const sun = new THREE.DirectionalLight('#fff2e0', 2.4);
    sun.position.set(0.6, 0.7, 0.4);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#5f7dff', 0.5);
    fill.position.set(-0.5, -0.4, -0.6);
    this.scene.add(fill);

    this.buildSky();
    this.buildDust();
    this.particles = new Particles(2400);
    this.scene.add(this.particles.points);
    this.buildComet();

    this.preview = new Ribbon(640, { color: COLORS.cyan, dash: 3.2, dashSpeed: 1.6, duty: 0.55, fadeOut: 0.7, core: 0.6 });
    this.ghost = new Ribbon(640, { color: COLORS.cyan, dash: 1.6, dashSpeed: 0.8, duty: 0.3, fadeOut: 0.6, opacity: 0.3, core: 0.1 });
    this.tether = new Ribbon(32, { color: COLORS.cyan, dash: 2.4, dashSpeed: 3.0, duty: 0.4, fadeIn: 0.0, fadeOut: 0.95, core: 0.4 });
    this.scene.add(this.preview.mesh, this.ghost.mesh, this.tether.mesh);
    this.endMarker = new Billboard(2.4, ringMaterial(COLORS.cyan, { opacity: 0.9, px: 3, dashes: 6, spin: 0.6 }));
    this.endMarker.mesh.visible = false;
    this.scene.add(this.endMarker.mesh);
    this.shock = [];

    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);
    this.bodyViews = [];
    this.lines = [];
    this.tmpPts = [];

    this.rig = new CameraRig(this.camera);
    this.time = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.particles.points.material.uniforms.uScale.value = h * 0.6;
  }

  buildSky() {
    this.sky = new THREE.Group();
    this.scene.add(this.sky);
    const N = 5200;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      let x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.random() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1;
      const R = 3500;
      // a faint galactic band
      if (i % 3 === 0) { y *= 0.18; }
      const l2 = Math.hypot(x, y, z) || 1;
      pos[i * 3] = x / l2 * R; pos[i * 3 + 1] = y / l2 * R; pos[i * 3 + 2] = z / l2 * R;
      const t = Math.random();
      c.setHSL(t < 0.7 ? 0.6 : t < 0.85 ? 0.08 : 0.0, t < 0.7 ? 0.3 : 0.6, 0.75 + Math.random() * 0.25);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = Math.random() < 0.04 ? 2.6 + Math.random() * 1.6 : 0.8 + Math.random() * 1.2;
      ph[i] = Math.random() * 100;
      void l;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPR: { value: this.renderer.getPixelRatio() } },
      vertexShader: `
        attribute float aSize; attribute float aPhase; attribute vec3 color;
        uniform float uTime; uniform float uPR;
        varying vec3 vCol; varying float vTw;
        void main(){
          vCol = color;
          vTw = 0.65 + 0.35 * sin(uTime * (1.0 + fract(aPhase) * 2.0) + aPhase);
          gl_PointSize = aSize * uPR;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vCol; varying float vTw;
        void main(){
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float d = dot(c, c);
          if (d > 1.0) discard;
          gl_FragColor = vec4(vCol * vTw, (1.0 - d));
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(g, this.starMat);
    stars.frustumCulled = false;
    this.sky.add(stars);
    const neb = [['#5b2a99', 11], ['#16708f', 23], ['#8f2a6e', 37], ['#2a3f99', 51], ['#6f2a8f', 67], ['#1f8f7a', 79]];
    neb.forEach(([color, seed], i) => {
      const m = new THREE.SpriteMaterial({ map: nebulaTexture(seed, color), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
      const s = new THREE.Sprite(m);
      const a = i * 1.7 + 0.4, e = (i % 3 - 1) * 0.5;
      s.position.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).multiplyScalar(3000);
      s.scale.setScalar(1800 + (seed % 5) * 300);
      s.material.rotation = seed;
      this.sky.add(s);
    });
    this.skyLines = new THREE.Group();
    this.sky.add(this.skyLines);
  }

  buildDust() {
    const N = 420;
    this.dustBase = new Float32Array(N * 3).map(() => (Math.random() * 2 - 1) * 70);
    this.dustPos = new Float32Array(N * 6);
    this.dustCol = new Float32Array(N * 6);
    const g = new THREE.BufferGeometry();
    this.dustAttr = new THREE.BufferAttribute(this.dustPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.dustColAttr = new THREE.BufferAttribute(this.dustCol, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.dustAttr);
    g.setAttribute('color', this.dustColAttr);
    this.dust = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  buildComet() {
    this.comet = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.8, 2.1) }));
    this.comet.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: COLORS.cyan, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.6);
    this.comet.add(glow);
    const inner = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
    inner.scale.setScalar(0.7);
    this.comet.add(inner);
    this.cometGlow = glow;
    this.cometCore = core;
    this.cometLight = new THREE.PointLight('#7fe8ff', 22, 60, 1.6);
    this.comet.add(this.cometLight);
    this.scene.add(this.comet);
    this.trail = new Ribbon(150, { color: new THREE.Color('#bff4ff'), endColor: new THREE.Color('#2a6cff'), fadeOut: 0.05, core: 0.5, near: [5, 15] });
    this.trailPts = [];
    this.scene.add(this.trail.mesh);
  }

  // ---------------------------------------------------------------- level
  loadLevel(level, bodies) {
    for (const v of this.bodyViews) {
      this.levelGroup.remove(v.group);
      disposeTree(v.group);
      if (v.lane) { this.levelGroup.remove(v.lane.mesh); disposeTree(v.lane.mesh); }
    }
    for (const l of this.lines) { this.levelGroup.remove(l.ribbon.mesh); disposeTree(l.ribbon.mesh); }
    this.bodyViews = [];
    this.lines = [];
    this.particles.clear();
    this.trailPts.length = 0;
    this.trail.mesh.visible = false;
    for (const b of bodies) {
      const v = this.makeBodyView(b);
      this.bodyViews.push(v);
      this.levelGroup.add(v.group);
    }
    this.level = level;
  }

  planetTex(type, palette, seed) {
    const key = `${type}/${palette}/${seed}`;
    if (!this.texCache.has(key)) this.texCache.set(key, planetTexture(type, palette, seed));
    return this.texCache.get(key);
  }

  makeBodyView(b) {
    const group = new THREE.Group();
    group.position.set(b.x, b.y, b.z);
    const v = { body: b, group, rings: [], t: Math.random() * 10 };
    if (b.type === 'blackhole') {
      const shadow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: 0.95 }));
      shadow.scale.setScalar(b.radius * 9);
      shadow.renderOrder = -1;
      group.add(shadow);
      group.add(new THREE.Mesh(new THREE.SphereGeometry(b.radius, 32, 20), new THREE.MeshBasicMaterial({ color: 0x000000 })));
      const disk = new THREE.Mesh(new THREE.RingGeometry(b.radius * 1.35, b.radius * 5.2, 160, 1), new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uIn: { value: b.radius * 1.35 }, uOut: { value: b.radius * 5.2 } },
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          uniform float uTime; uniform float uIn; uniform float uOut; varying vec3 vP;
          void main(){
            float r = (length(vP.xy) - uIn) / (uOut - uIn);
            float ang = atan(vP.y, vP.x);
            float sw = 0.5 + 0.5 * sin(ang * 3.0 + r * 14.0 - uTime * 2.4);
            float st = 0.5 + 0.5 * sin(ang * 23.0 - uTime * 5.0 + r * 40.0);
            float inten = pow(1.0 - r, 1.7) * (0.55 + 0.45 * sw) * (0.75 + 0.25 * st);
            vec3 col = mix(vec3(1.0, 0.35, 0.12), vec3(1.0, 0.92, 0.75), pow(1.0 - r, 3.0));
            float a = inten * smoothstep(0.0, 0.06, r);
            gl_FragColor = vec4(col * 2.2, a);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      disk.rotation.set(Math.PI / 2 + 0.35, 0.2, 0);
      group.add(disk);
      v.disk = disk;
      const photon = new Billboard(b.radius * 1.3, ringMaterial(new THREE.Color('#ffd9a8'), { opacity: 1.4, px: 5 }));
      group.add(photon.mesh); v.rings.push(photon);
      const lethal = new Billboard(b.lethalR + 0.9, ringMaterial(COLORS.red, { opacity: 0.55, px: 2, dashes: 24, spin: -0.05 }));
      group.add(lethal.mesh); v.rings.push(lethal);
    } else if (b.ember) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uHeat: { value: 0 }, uLit: { value: 0 }, uTime: { value: 0 } },
        vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uHeat; uniform float uLit; uniform float uTime;
          varying vec3 vN; varying vec3 vV; varying vec3 vP;
          ${GLSL_NOISE}
          void main(){
            vec3 p = normalize(vP) * 2.4;
            float n = fbm3(p + vec3(0.0, uTime * 0.04, 0.0));
            float r1 = 1.0 - abs(vnoise(p * 3.1 + vec3(7.0)) * 2.0 - 1.0);
            float r2 = 1.0 - abs(vnoise(p * 6.3 + vec3(1.0, uTime * 0.05, 3.0)) * 2.0 - 1.0);
            float crack = max(smoothstep(0.93, 0.995, r1), 0.6 * smoothstep(0.95, 0.997, r2));
            float fres = pow(1.0 - max(dot(vN, vV), 0.0), 2.4);
            vec3 cold = vec3(0.06, 0.065, 0.1) * (0.6 + 0.6 * n) + vec3(0.12, 0.15, 0.28) * fres;
            vec3 hot = vec3(1.0, 0.5, 0.15);
            float pulse = 0.5 + 0.5 * sin(uTime * 2.2);
            vec3 dormant = cold + hot * crack * (0.35 + 0.4 * pulse + uHeat * 3.0) + hot * fres * (0.15 + uHeat * 0.8);
            float m = fbm3(p * 1.7 + vec3(uTime * 0.2));
            vec3 lit = mix(vec3(1.0, 0.62, 0.25), vec3(1.0, 0.96, 0.86), m) * (1.7 + 0.8 * fres);
            gl_FragColor = vec4(mix(dormant, lit, uLit), 1.0);
          }`,
      });
      const core = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 48, 32), mat);
      group.add(core);
      v.emberMat = mat;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: COLORS.amber, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
      glow.scale.setScalar(b.radius * 5);
      group.add(glow);
      v.glow = glow;
      const corona = new Billboard(b.corona, ringMaterial(COLORS.amber, { opacity: 0.85, px: 2.5, dashes: 40, spin: 0.015, fill: 0.5 }));
      group.add(corona.mesh); v.rings.push(corona); v.corona = corona;
      if (b.def.lane) {
        const [lx, ly, lz] = b.def.lane;
        const l = Math.hypot(lx, ly, lz);
        const lane = new Ribbon(24, { color: COLORS.amber, dash: 3.5, dashSpeed: 0.7, duty: 0.5, chevron: true, fadeIn: 0.25, fadeOut: 0.55, opacity: 0.9, core: 0.3 });
        lane.dir = [lx / l, ly / l, lz / l];
        lane.len = b.corona * 2.6;
        lane.pts = [];
        for (let i = 0; i < 24; i++) {
          const d = (i / 23) * lane.len;
          lane.pts.push(b.x + lane.dir[0] * d, b.y + lane.dir[1] * d, b.z + lane.dir[2] * d);
        }
        this.levelGroup.add(lane.mesh);
        v.lane = lane;
      }
      v.light = new THREE.PointLight('#ffcf8a', 0, 220, 1.3);
      group.add(v.light);
    } else {
      const seed = Math.abs(Math.round(b.x * 7 + b.y * 13 + b.z * 3)) % 997 + 1;
      const mat = new THREE.MeshToonMaterial({ map: this.planetTex(b.type, b.def.palette || 'teal', seed), gradientMap: this.toonGrad });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 64, 40), mat);
      mesh.rotation.set(Math.random() * 0.6, Math.random() * 6, Math.random() * 0.4);
      group.add(mesh);
      v.mesh = mesh;
      const pal = PALETTES[b.def.palette] || PALETTES.teal;
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(b.radius * 1.1, 48, 32), new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(pal[2]) } },
        vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
          void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.6); gl_FragColor = vec4(uColor * 1.4, f); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      group.add(atmo);
      if (b.def.rings) {
        const rg = new THREE.RingGeometry(b.radius * 1.45, b.radius * 2.35, 128, 1);
        const p = rg.attributes.position, uv = rg.attributes.uv;
        for (let i = 0; i < p.count; i++) {
          const r = Math.hypot(p.getX(i), p.getY(i));
          uv.setXY(i, (r - b.radius * 1.45) / (b.radius * 0.9), 0.5);
        }
        const cv = document.createElement('canvas');
        cv.width = 256; cv.height = 4;
        const ctx = cv.getContext('2d');
        for (let i = 0; i < 256; i++) {
          const a = (0.25 + 0.6 * Math.abs(Math.sin(i * 0.21) * Math.sin(i * 0.047 + 1))) * Math.sin(Math.PI * i / 256);
          ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          ctx.fillRect(i, 0, 1, 4);
        }
        const tex = new THREE.CanvasTexture(cv);
        const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(pal[2]), transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.75 }));
        ring.material.userData.ownMap = true;
        ring.rotation.set(Math.PI / 2 - 0.45, 0.3, 0);
        group.add(ring);
      }
    }
    if (!b.ember) {
      // gravity field edge + loading ripple
      const field = new Billboard(b.influence, ringMaterial(COLORS.cyan, { opacity: 0.16, px: 1.6, dashes: 64, spin: 0.01 }));
      group.add(field.mesh); v.field = field;
      const ripple = new Billboard(b.influence, ringMaterial(COLORS.cyan, { opacity: 0, px: 2.5 }));
      group.add(ripple.mesh); v.ripple = ripple;
      v.rings.push(field, ripple);
    }
    return v;
  }

  setEmberHeat(id, heat) {
    const v = this.bodyViews[id];
    if (v && v.emberMat) v.emberMat.uniforms.uHeat.value = heat;
  }

  igniteEmber(id) {
    const v = this.bodyViews[id];
    if (!v) return;
    v.litT = 0;
    const b = v.body;
    this.particles.burst(b.x, b.y, b.z, 260, 70, COLORS.gold, 2.2, 1.6);
    this.particles.burst(b.x, b.y, b.z, 120, 30, COLORS.white, 1.4, 1.2);
    this.addShock(b.x, b.y, b.z, COLORS.gold, b.corona * 2.4, 1.2);
    this.rig.shake = Math.max(this.rig.shake, 0.6);
    // the cold star becomes a gravity source: give it a field ring
    const field = new Billboard(b.influence, ringMaterial(COLORS.cyan, { opacity: 0.16, px: 1.6, dashes: 64, spin: 0.01 }));
    v.group.add(field.mesh); v.field = field;
    const ripple = new Billboard(b.influence, ringMaterial(COLORS.cyan, { opacity: 0, px: 2.5 }));
    v.group.add(ripple.mesh); v.ripple = ripple;
    v.rings.push(field, ripple);
  }

  addLine(a, b) {
    const A = this.bodyViews[a].body, B = this.bodyViews[b].body;
    const r = new Ribbon(40, { color: COLORS.gold, endColor: COLORS.gold, opacity: 0.8, core: 0.6, fadeOut: 1.0, dash: 0 });
    this.levelGroup.add(r.mesh);
    this.lines.push({ ribbon: r, a: A, b: B, t: 0 });
  }

  addShock(x, y, z, color, size, life) {
    const bb = new Billboard(1, ringMaterial(color, { opacity: 1, px: 4 }));
    bb.mesh.position.set(x, y, z);
    this.scene.add(bb.mesh);
    this.shock.push({ bb, t: 0, life, size });
  }

  // ---------------------------------------------------------------- per frame
  setPreview(pts, end, charge, ghostPts, ghostEnd, showGhost) {
    const cam = this.camera.position;
    if (pts && pts.length >= 6) {
      const n = pts.length / 3;
      this.preview.set(pts, n, cam, t => 0.16 + 0.22 * charge * (1 - t * 0.5));
      const u = this.preview.u;
      u.uOpacity.value = 0.55 + 0.45 * charge;
      const bad = end && end.type === 'crash';
      u.uEndColor.value.copy(bad ? COLORS.red : end && end.type === 'corona' ? COLORS.amber : COLORS.cyan);
      u.uFadeOut.value = end ? 0.97 : 0.65;
      if (end) {
        this.endMarker.mesh.visible = true;
        this.endMarker.mesh.position.set(end.x, end.y, end.z);
        this.endMarker.u.uColor.value.copy(bad ? COLORS.red : COLORS.amber);
        const d = cam.distanceTo(this.endMarker.mesh.position);
        this.endMarker.mesh.scale.setScalar(Math.max(1.6, d * 0.03) * (bad ? 1 : 1.3));
      } else this.endMarker.mesh.visible = false;
    } else {
      this.preview.mesh.visible = false;
      this.endMarker.mesh.visible = false;
    }
    if (showGhost && ghostPts && ghostPts.length >= 6) {
      this.ghost.set(ghostPts, ghostPts.length / 3, cam, 0.1);
      const bad = ghostEnd && ghostEnd.type === 'crash';
      this.ghost.u.uEndColor.value.copy(bad ? COLORS.red : ghostEnd && ghostEnd.type === 'corona' ? COLORS.amber : COLORS.cyan);
      this.ghost.u.uFadeOut.value = ghostEnd ? 0.95 : 0.6;
    } else this.ghost.mesh.visible = false;
  }

  setTether(cx, cy, cz, body, charge, charging) {
    if (!body) { this.tether.mesh.visible = false; return; }
    const pts = this.tmpPts;
    pts.length = 0;
    const n = 24;
    const dx = cx - body.x, dy = cy - body.y, dz = cz - body.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const sx = body.x + dx / d * body.radius * 1.1, sy = body.y + dy / d * body.radius * 1.1, sz = body.z + dz / d * body.radius * 1.1;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const wob = Math.sin(t * Math.PI) * Math.sin(this.time * 9 + t * 12) * 0.25 * charge;
      pts.push(sx + (cx - sx) * t + wob, sy + (cy - sy) * t + wob, sz + (cz - sz) * t);
    }
    this.tether.set(pts, n, this.camera.position, t => 0.06 + 0.2 * charge * Math.sin(Math.PI * Math.min(1, t * 1.1)));
    this.tether.u.uOpacity.value = charging ? 0.35 + 0.65 * charge : 0.18;
    this.tether.u.uDashSpeed.value = charging ? 3.5 : 0.6;
  }

  update(dt, s) {
    this.time += dt;
    const t = this.time;
    const cam = this.camera;
    this.starMat.uniforms.uTime.value = t;

    // comet
    this.comet.visible = s.cometVisible;
    this.comet.position.set(s.cx, s.cy, s.cz);
    const pulse = 1 + 0.08 * Math.sin(t * 14);
    const mc = s.modeColor || COLORS.cyan;
    this.cometGlow.material.color.copy(mc);
    this.cometGlow.scale.setScalar((1.5 + s.charge * 1.3) * pulse * (s.cometScale ?? 1));
    this.cometLight.color.copy(mc);
    this.cometCore.scale.setScalar(s.cometScale ?? 1);

    // trail
    if (s.cometVisible) {
      const tp = this.trailPts;
      tp.unshift(s.cx, s.cy, s.cz);
      if (tp.length > 150 * 3) tp.length = 150 * 3;
      this.trail.set(tp, tp.length / 3, cam.position, k => 0.45 * (1 - k) ** 1.4 + 0.02);
      this.trail.u.uColor.value.copy(mc).lerp(COLORS.white, 0.6);
    } else {
      this.trailPts.length = 0;
      this.trail.mesh.visible = false;
    }

    // sparks from the comet
    const fz = s.frozen ? 0 : 1;
    if (s.cometVisible && Math.random() < 0.9) {
      const k = 1 + Math.floor(s.charge * 3);
      for (let i = 0; i < k; i++) {
        this.particles.emit(s.cx, s.cy, s.cz, (Math.random() - 0.5) * 6 - s.vx * 0.15 * fz, (Math.random() - 0.5) * 6 - s.vy * 0.15 * fz, (Math.random() - 0.5) * 6 - s.vz * 0.15 * fz,
          i === 0 ? COLORS.white : mc, 0.35 + Math.random() * 0.4, 0.5 + Math.random() * 0.6);
      }
    }

    // bodies
    for (const v of this.bodyViews) {
      v.t += dt;
      const b = v.body;
      const camD = cam.position.distanceTo(v.group.position);
      const inside = (R) => smoothstep(R * 1.02, R * 1.45, camD);
      for (const r of v.rings) { r.mesh.quaternion.copy(cam.quaternion); r.u.uTime.value = t; }
      if (v.disk) v.disk.material.uniforms.uTime.value = t;
      if (v.mesh) v.mesh.rotation.y += dt * 0.05;
      if (b.ember) {
        v.emberMat.uniforms.uTime.value = t;
        if (b.lit) {
          v.litT = (v.litT ?? 0) + dt;
          const k = Math.min(1, v.litT / 0.8);
          v.emberMat.uniforms.uLit.value = k;
          v.glow.material.color.copy(COLORS.gold);
          // fade the halo when the camera is inside it, or it floods the screen
          v.glow.material.opacity = 0.7 * smoothstep(b.radius * 1.5, b.corona * 1.7, camD);
          v.glow.scale.setScalar(b.radius * (4.2 + 4 * Math.max(0, 1 - v.litT)) * (1 + 0.04 * Math.sin(t * 3)));
          v.corona.u.uOpacity.value = Math.max(0, 0.85 * (1 - v.litT * 1.5));
          v.light.intensity = 240 * k;
          if (v.lane) v.lane.u.uOpacity.value = Math.max(0, 0.9 * (1 - v.litT));
        } else {
          v.glow.material.opacity = 0.3 + 0.1 * Math.sin(t * 2.2) + (v.emberMat.uniforms.uHeat.value) * 0.6;
          const near = s.focusEmber === b.id;
          v.corona.u.uOpacity.value = (near ? 1.3 : 0.85) * inside(b.corona);
        }
        if (v.lane) {
          v.lane.set(v.lane.pts, 24, cam.position, k => b.radius * 0.28 * (1 - k * 0.6));
          v.lane.u.uTime.value = t;
          if (!b.lit) v.lane.u.uOpacity.value = s.focusEmber === b.id ? 1.4 : 0.75;
        }
      }
      if (v.field) {
        const isT = s.targetId === b.id;
        const fo = (isT ? 0.55 + 0.25 * s.charge : 0.14) * inside(b.influence);
        v.field.u.uOpacity.value += (fo - v.field.u.uOpacity.value) * Math.min(1, dt * 6);
        v.field.u.uSpin.value = isT && s.charging ? 0.08 : 0.01;
        // ripple contracting from the field edge to the body while gravity is borrowed
        if (isT && s.charging) {
          const ph = (t * 1.6) % 1;
          const r = b.influence * (1 - ph) + b.radius * 1.2 * ph;
          v.ripple.mesh.scale.setScalar(r / 0.96);
          v.ripple.u.uOpacity.value = (0.35 + 0.65 * s.charge) * Math.sin(Math.PI * ph) * inside(r);
          if (Math.random() < 0.5 + s.charge) {
            // gravity motes streaming from the body toward the comet
            const dx = s.cx - b.x, dy = s.cy - b.y, dz = s.cz - b.z;
            const d = Math.hypot(dx, dy, dz) || 1;
            const jx = (Math.random() - 0.5) * b.radius, jy = (Math.random() - 0.5) * b.radius, jz = (Math.random() - 0.5) * b.radius;
            this.particles.emit(b.x + dx / d * b.radius * 1.2 + jx, b.y + dy / d * b.radius * 1.2 + jy, b.z + dz / d * b.radius * 1.2 + jz,
              dx / d * 20, dy / d * 20, dz / d * 20, COLORS.cyan, 0.7, 2.0, 1);
          }
        } else v.ripple.u.uOpacity.value = 0;
      }
    }

    // constellation lines grow in
    for (const l of this.lines) {
      l.t = Math.min(1, l.t + dt * 0.8);
      const pts = this.tmpPts;
      pts.length = 0;
      const k = l.t * l.t * (3 - 2 * l.t);
      for (let i = 0; i < 40; i++) {
        const f = (i / 39) * k;
        pts.push(l.a.x + (l.b.x - l.a.x) * f, l.a.y + (l.b.y - l.a.y) * f, l.a.z + (l.b.z - l.a.z) * f);
      }
      const d = cam.position.distanceTo(new THREE.Vector3(l.a.x, l.a.y, l.a.z));
      l.ribbon.set(pts, 40, cam.position, Math.max(0.5, d * 0.004));
      l.ribbon.u.uOpacity.value = 0.55 + 0.25 * Math.sin(t * 2 + l.a.x);
    }

    // shockwaves
    for (let i = this.shock.length - 1; i >= 0; i--) {
      const sh = this.shock[i];
      sh.t += dt;
      const f = sh.t / sh.life;
      sh.bb.mesh.scale.setScalar(1 + sh.size * (1 - (1 - f) ** 3));
      sh.bb.mesh.quaternion.copy(cam.quaternion);
      sh.bb.u.uOpacity.value = 1.2 * (1 - f);
      if (f >= 1) { this.scene.remove(sh.bb.mesh); sh.bb.mesh.material.dispose(); this.shock.splice(i, 1); }
    }

    // dust streaks around the camera (sense of speed in empty space)
    const N = this.dustBase.length / 3;
    const B = 70, span = 2 * B;
    const sv = Math.min(1, Math.hypot(s.vx, s.vy, s.vz) * fz / 60);
    for (let i = 0; i < N; i++) {
      let x = this.dustBase[i * 3] - cam.position.x, y = this.dustBase[i * 3 + 1] - cam.position.y, z = this.dustBase[i * 3 + 2] - cam.position.z;
      x = ((x % span) + span * 1.5) % span - B; y = ((y % span) + span * 1.5) % span - B; z = ((z % span) + span * 1.5) % span - B;
      x += cam.position.x; y += cam.position.y; z += cam.position.z;
      const k = i * 6;
      this.dustPos[k] = x; this.dustPos[k + 1] = y; this.dustPos[k + 2] = z;
      this.dustPos[k + 3] = x - s.vx * 0.06 * fz; this.dustPos[k + 4] = y - s.vy * 0.06 * fz; this.dustPos[k + 5] = z - s.vz * 0.06 * fz;
      const c = 0.35 + sv * 0.5;
      this.dustCol[k] = c * 0.8; this.dustCol[k + 1] = c * 0.9; this.dustCol[k + 2] = c;
      this.dustCol[k + 3] = 0; this.dustCol[k + 4] = 0; this.dustCol[k + 5] = 0;
    }
    this.dustAttr.needsUpdate = this.dustColAttr.needsUpdate = true;

    this.particles.update(dt, { x: s.cx, y: s.cy, z: s.cz });
    this.preview.u.uTime.value = t;
    this.ghost.u.uTime.value = t;
    this.tether.u.uTime.value = t;
    this.endMarker.u.uTime.value = t;
    this.endMarker.mesh.quaternion.copy(cam.quaternion);

    this.rig.update(dt, s);
    this.sky.position.copy(cam.position);
  }

  render() { this.composer.render(); }
}

// ------------------------------------------------------------------ camera

class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.roll = 0;
    this.fov = 72;
    this.prevV = new THREE.Vector3(0, 0, -26);
    this.shake = 0;
    this.blend = 0;        // 0 = chase, 1 = cinematic
    this.cine = { pos: V(), look: V(), up: new THREE.Vector3(0, 1, 0) };
    this.chase = { pos: V(), look: V(), up: V() };
    this.tmp = V(); this.tmp2 = V(); this.acc = V();
    this.pos = V(); this.look = V();
    this.kick = 0;
  }
  snap(s) {
    this.fwd.set(s.vx, s.vy, s.vz).normalize();
    this.up.set(0, 1, 0);
    this.blend = 0;
    this.prevV.set(s.vx, s.vy, s.vz);
    this.update(1, s, true);
  }
  update(dt, s, snap = false) {
    const cam = this.cam;
    const vel = this.tmp.set(s.vx, s.vy, s.vz);
    const sp = vel.length();
    if (sp > 0.01 && s.cometVisible) {
      const k = snap ? 1 : 1 - Math.exp(-dt * 3.2);
      this.fwd.lerp(this.tmp2.copy(vel).divideScalar(sp), k).normalize();
    }
    // keep "up" perpendicular, drift gently back toward world up
    this.up.addScaledVector(this.fwd, -this.up.dot(this.fwd)).normalize();
    if (Math.abs(this.fwd.y) < 0.92) {
      const wu = this.tmp2.set(0, 1, 0).addScaledVector(this.fwd, -this.fwd.y).normalize();
      this.up.lerp(wu, 1 - Math.exp(-dt * 0.9)).normalize();
    }
    // bank into turns (FPV feel)
    this.acc.copy(vel).sub(this.prevV).divideScalar(Math.max(dt, 1e-3));
    this.prevV.copy(vel);
    const right = this.tmp2.crossVectors(this.fwd, this.up).normalize();
    const lat = this.acc.dot(right);
    const targetRoll = Math.max(-0.7, Math.min(0.7, -lat * 0.018));
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-dt * 3));

    const c = this.chase;
    c.pos.set(s.cx, s.cy, s.cz).addScaledVector(this.fwd, -9.5).addScaledVector(this.up, 2.6);
    c.look.set(s.cx, s.cy, s.cz).addScaledVector(this.fwd, 18);
    c.up.copy(this.up).applyAxisAngle(this.fwd, this.roll);

    const want = s.cine ? 1 : 0;
    this.blend += (want - this.blend) * (snap ? 1 : 1 - Math.exp(-dt * 2.2));
    if (s.cine) {
      this.cine.pos.lerp(s.cine.pos, snap ? 1 : 1 - Math.exp(-dt * 1.5));
      this.cine.look.lerp(s.cine.look, snap ? 1 : 1 - Math.exp(-dt * 3));
      this.cine.up.lerp(s.cine.up || this.up, 1 - Math.exp(-dt * 2)).normalize();
    } else {
      this.cine.pos.copy(cam.position);
      this.cine.look.copy(this.look);
      this.cine.up.copy(cam.up);
    }
    const b = this.blend * this.blend * (3 - 2 * this.blend);
    this.pos.copy(c.pos).lerp(this.cine.pos, b);
    this.look.copy(c.look).lerp(this.cine.look, b);
    cam.up.copy(c.up).lerp(this.cine.up, b).normalize();
    cam.position.copy(this.pos);
    if (this.shake > 0) {
      const a = this.shake * this.shake * 0.9;
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
      cam.position.z += (Math.random() - 0.5) * a;
      this.shake = Math.max(0, this.shake - dt * 1.6);
    }
    cam.lookAt(this.look);

    this.kick = Math.max(0, this.kick - dt * 2.5);
    const fovT = 72 + Math.max(-4, Math.min(16, (sp - 26) * 0.38)) - s.charge * 6 * (1 - b) + this.kick * 10;
    this.fov += (fovT - this.fov) * (1 - Math.exp(-dt * 4));
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }
}
