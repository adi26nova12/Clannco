/* The persistent particle stage: one WebGL canvas, one Points draw call. Particles morph between formations;
   each morph captures where the particles are now (CPU, once) and eases to the new targets in the vertex
   shader with a per-particle stagger and a mid-flight scatter. Palette read from the CSS tokens. */
import * as THREE from '/assets/js/vendor/three-0.169.0.module.min.js';
import { gsap } from '/assets/js/core/gsap-setup.js';
import { rgb } from '/assets/js/core/env.js';

const CAM_Z = 900;
const vec = ([r, g, b]) => new THREE.Vector3(r / 255, g / 255, b / 255);
const BLEND = {
  transparent: true, depthTest: false, depthWrite: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
};

// ---------- formations ----------
function prng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2831853 * r());

function rotXZ(x, y, z, ax, az) {
  const cy = Math.cos(ax), sy = Math.sin(ax);
  const y1 = y * cy - z * sy, z1 = y * sy + z * cy;
  const cz = Math.cos(az), sz = Math.sin(az);
  return [x * cz - y1 * sz, x * sz + y1 * cz, z1];
}

export const FORMATIONS = {
  core(n) {
    const r = prng(11), out = new Float32Array(n * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const shell = Math.floor(n * 0.5), inner = Math.floor(n * 0.62), ringA = Math.floor(n * 0.82);
    for (let i = 0; i < n; i++) {
      let p;
      if (i < shell) {
        const y = 1 - (i / (shell - 1)) * 2, rad = Math.sqrt(1 - y * y), th = golden * i;
        const R = 210 + gauss(r) * 3;
        p = [Math.cos(th) * rad * R, y * R, Math.sin(th) * rad * R];
      } else if (i < inner) {
        const R = 120 * Math.cbrt(r()), u = r() * 2 - 1, th = r() * 6.2832, s = Math.sqrt(1 - u * u);
        p = [Math.cos(th) * s * R, u * R, Math.sin(th) * s * R];
      } else if (i < ringA) {
        const t = r() * 6.2832, R = 330 + gauss(r) * 5;
        p = rotXZ(Math.cos(t) * R, gauss(r) * 2, Math.sin(t) * R, 1.18, 0.34);
      } else {
        const t = r() * 6.2832, R = 430 + gauss(r) * 3;
        p = rotXZ(Math.cos(t) * R, gauss(r) * 1.5, Math.sin(t) * R, -1.25, -0.52);
      }
      out.set(p, i * 3);
    }
    return out;
  },
  network(n) {
    const r = prng(23), out = new Float32Array(n * 3);
    const N = 110, nodes = [];
    for (let i = 0; i < N; i++) nodes.push([(r() - 0.5) * 1500, (r() - 0.5) * 850, (r() - 0.5) * 700]);
    const edges = [];
    nodes.forEach((a, i) => {
      nodes.map((b, j) => [(a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2, j])
        .sort((x, y) => x[0] - y[0]).slice(1, 4).forEach(([, j]) => edges.push([i, j]));
    });
    const atNodes = Math.floor(n * 0.18);
    for (let i = 0; i < n; i++) {
      let p;
      if (i < atNodes) {
        const c = nodes[i % N];
        p = [c[0] + gauss(r) * 7, c[1] + gauss(r) * 7, c[2] + gauss(r) * 7];
      } else {
        const [a, b] = edges[Math.floor(r() * edges.length)];
        const t = r(), A = nodes[a], B = nodes[b];
        p = [A[0] + (B[0] - A[0]) * t + gauss(r) * 2, A[1] + (B[1] - A[1]) * t + gauss(r) * 2, A[2] + (B[2] - A[2]) * t + gauss(r) * 2];
      }
      out.set(p, i * 3);
    }
    return out;
  },
  pillars(n) {
    const r = prng(37), out = new Float32Array(n * 3);
    const base = -250, cols = [[-170, 470], [0, 350], [170, 250]];
    const colN = Math.floor(n * 0.6);
    for (let i = 0; i < n; i++) {
      let p;
      if (i < colN) {
        const [cx, h] = cols[i % 3];
        const onEdge = r() < 0.55;
        let x = (r() - 0.5) * 70, z = (r() - 0.5) * 70;
        if (onEdge) { if (r() < 0.5) x = Math.sign(x || 1) * 35; else z = Math.sign(z || 1) * 35; }
        p = [cx + x, base + Math.pow(r(), 0.8) * h, z];
      } else {
        const alongX = r() < 0.5, line = Math.round((r() - 0.5) * 16) * 50, t = (r() - 0.5) * 800;
        p = alongX ? [t, base + gauss(r), line * 0.75] : [line, base + gauss(r), t * 0.75];
      }
      out.set(p, i * 3);
    }
    return out;
  },
  calm(n) {
    const r = prng(51), out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) out.set([(r() - 0.5) * 2400, (r() - 0.5) * 1400, (r() - 0.5) * 1200], i * 3);
    return out;
  },
};

const VERT = /* glsl */ `
  attribute vec3 aFrom;
  attribute vec3 aTo;
  attribute vec3 aDir;
  attribute float aRand;
  uniform float uMix, uTime, uSize, uPR, uAlpha, uScatter;
  varying float vAlpha;
  varying float vRand;
  void main() {
    float m = clamp(uMix * 1.35 - aRand * 0.35, 0.0, 1.0);
    m = m * m * (3.0 - 2.0 * m);
    vec3 p = mix(aFrom, aTo, m) + aDir * sin(m * 3.14159) * uScatter;
    p += vec3(sin(uTime * 0.6 + aRand * 43.0), cos(uTime * 0.5 + aRand * 29.0), sin(uTime * 0.45 + aRand * 17.0)) * 4.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float d = max(-mv.z, 60.0);
    float s = ${CAM_Z.toFixed(1)} / d;
    gl_PointSize = clamp(uSize * s, 1.0, 14.0) * uPR;
    vAlpha = uAlpha * clamp(s, 0.25, 1.35) * (0.72 + 0.28 * sin(uTime * 1.7 + aRand * 80.0));
    vRand = aRand;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  uniform vec3 uBrass, uBrass2, uCream;
  varying float vAlpha;
  varying float vRand;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, r);
    a *= a;
    vec3 col = vRand > 0.93 ? uCream : mix(uBrass, uBrass2, fract(vRand * 7.0));
    gl_FragColor = vec4(col, a * vAlpha);
  }
`;

export async function createStage(host, { count = 12000, mobile = false } = {}) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  host.prepend(canvas);

  const rand = new Float32Array(count), dir = new Float32Array(count * 3);
  const r = prng(7);
  for (let i = 0; i < count; i++) {
    rand[i] = r();
    const u = r() * 2 - 1, th = r() * 6.2832, s = Math.sqrt(1 - u * u);
    dir.set([Math.cos(th) * s, u, Math.sin(th) * s], i * 3);
  }
  const cache = {};
  const formation = (name) => (cache[name] ||= FORMATIONS[name](count));

  const geo = new THREE.BufferGeometry();
  const from = new THREE.BufferAttribute(new Float32Array(FORMATIONS.calm(count)), 3);
  const to = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  to.array.set(formation('calm'));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3)); // bounds only
  geo.setAttribute('aFrom', from);
  geo.setAttribute('aTo', to);
  geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));

  const uniforms = {
    uMix: { value: 1 }, uTime: { value: 0 }, uSize: { value: mobile ? 3.6 : 3 }, uPR: { value: 1 },
    uAlpha: { value: 0 }, uScatter: { value: 140 },
    uBrass: { value: vec(rgb('--brass', [201, 162, 74])) },
    uBrass2: { value: vec(rgb('--brass-2', [230, 199, 102])) },
    uCream: { value: vec(rgb('--cream', [243, 239, 226])) },
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({ ...BLEND, vertexShader: VERT, fragmentShader: FRAG, uniforms }));
  points.frustumCulled = false;

  const tilt = new THREE.Group();   // cursor
  const spin = new THREE.Group();   // continuous rotation
  const place = new THREE.Group();  // per-scene position and scale
  spin.add(points); tilt.add(spin); place.add(tilt);
  const scene = new THREE.Scene();
  scene.add(place);
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 6000);
  camera.position.z = CAM_Z;

  let visW = 1, visH = 1;
  const resize = () => {
    const W = innerWidth, H = innerHeight;
    const pr = Math.min(devicePixelRatio || 1, mobile ? 1 : 1.5);
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    uniforms.uPR.value = pr;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    visH = 2 * CAM_Z * Math.tan((camera.fov * Math.PI) / 360);
    visW = visH * camera.aspect;
    if (lastPlace) applyPlace(lastPlace, 0);
  };

  const state = { spin: 0.00008, mx: 0, my: 0, tx: 0, ty: 0 };
  let lastPlace = null;
  const applyPlace = (p, duration) => {
    lastPlace = p;
    gsap.to(place.position, { x: p.x * visW, y: p.y * visH, duration, ease: 'c-inout', overwrite: 'auto' });
    gsap.to(place.scale, { x: p.scale, y: p.scale, z: p.scale, duration, ease: 'c-inout', overwrite: 'auto' });
    gsap.to(uniforms.uAlpha, { value: p.alpha, duration, ease: 'c-inout', overwrite: 'auto' });
  };
  resize();
  addEventListener('resize', resize);

  const onMove = (e) => { state.tx = (e.clientY / innerHeight - 0.5) * 0.35; state.ty = (e.clientX / innerWidth - 0.5) * 0.5; };
  if (!mobile) addEventListener('mousemove', onMove, { passive: true });

  // current on-screen position of every particle, mirroring the shader's eased stagger (scatter/drift ignored)
  const capture = () => {
    const f = from.array, t = to.array, mix = uniforms.uMix.value;
    for (let i = 0; i < count; i++) {
      let m = Math.min(1, Math.max(0, mix * 1.35 - rand[i] * 0.35));
      m = m * m * (3 - 2 * m);
      const k = i * 3;
      f[k] += (t[k] - f[k]) * m; f[k + 1] += (t[k + 1] - f[k + 1]) * m; f[k + 2] += (t[k + 2] - f[k + 2]) * m;
    }
  };

  let active = 'calm';
  let mixTween = null;
  const SPIN = { core: 0.00012, network: 0.00003, pillars: 0.00005, calm: 0.00002 };
  const api = {
    get active() { return active; },
    to(name, p, { duration = 1.8 } = {}) {
      if (!FORMATIONS[name]) return;
      if (name !== active) {
        capture();
        from.needsUpdate = true;
        to.array.set(formation(name));
        to.needsUpdate = true;
        uniforms.uMix.value = 0;
        mixTween && mixTween.kill();
        mixTween = gsap.to(uniforms.uMix, { value: 1, duration: duration || 0.001, ease: 'none' });
        active = name;
      }
      gsap.to(state, { spin: SPIN[name] ?? 0.00004, duration, overwrite: 'auto' });
      applyPlace(p || { x: 0, y: 0, scale: 1, alpha: 1 }, duration);
    },
    dispose() {
      gsap.ticker.remove(tick);
      removeEventListener('resize', resize);
      removeEventListener('mousemove', onMove);
      document.removeEventListener('visibilitychange', vis);
      geo.dispose(); points.material.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };

  const tick = (time, dt) => {
    const d = Math.min(dt || 16, 64);
    const k = 1 - Math.pow(0.955, d / 16.667);
    state.mx += (state.tx - state.mx) * k;
    state.my += (state.ty - state.my) * k;
    tilt.rotation.set(state.mx, state.my, 0);
    spin.rotation.y += d * state.spin;
    uniforms.uTime.value = time;
    renderer.render(scene, camera);
  };
  const vis = () => (document.hidden ? gsap.ticker.remove(tick) : gsap.ticker.add(tick));
  document.addEventListener('visibilitychange', vis);
  renderer.compile(scene, camera);
  gsap.ticker.add(tick);
  return api;
}
