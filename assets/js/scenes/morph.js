/* The six-step morphing particle centrepiece (sphere → torus → ring → wave → box → helix).
   Rendering only: motion.js decides whether it is driven by a scroll pin (desktop), cycles on its own
   (compact screens), or is held still (reduced motion). Particles are drawn from two pre-rendered
   sprites with a per-particle alpha, instead of building and filling a path for every particle. */
import { gsap } from '../core/gsap-setup.js';
import { $$, rgb } from '../core/env.js';

const STEPS = 6;

// A brass ramp drawn from the palette — step identity comes from the shape and caption, not hue.
const RAMP = [
  ['--brass', [201, 162, 74]], ['--brass-2', [230, 199, 102]], ['--cream', [243, 239, 226]],
  ['--brass-2', [230, 199, 102]], ['--brass', [201, 162, 74]], ['--cream-2', [255, 248, 232]],
];
const CORE_STOPS = [[0, 1], [0.72, 1], [1, 0]];
const GLOW_STOPS = [[0, 1], [0.27, 1], [0.31, 0.2], [0.65, 0.09], [1, 0]];

function buildShapes(N) {
  const R = Math.random;
  const make = (fill) => { const a = new Float32Array(N * 3); fill(a); return a; };
  return [
    make((a) => { // sphere
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), th = i * 2.399963;
        a[i * 3] = Math.cos(th) * r; a[i * 3 + 1] = y; a[i * 3 + 2] = Math.sin(th) * r;
      }
    }),
    make((a) => { // torus
      for (let i = 0; i < N; i++) {
        const u = R() * 6.2832, v = R() * 6.2832, rr = 0.36, cc = (1 + rr * Math.cos(v)) * 0.72;
        a[i * 3] = Math.cos(u) * cc; a[i * 3 + 1] = rr * Math.sin(v); a[i * 3 + 2] = Math.sin(u) * cc;
      }
    }),
    make((a) => { // three interlocking rings
      for (let i = 0; i < N; i++) {
        const k = i % 3, ang = (i / N) * 6.2832 * 8;
        const x = Math.cos(ang) * 0.95, y = Math.sin(ang) * 0.95, z = (R() - 0.5) * 0.08;
        if (k === 0) { a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z; }
        else if (k === 1) { a[i * 3] = x; a[i * 3 + 1] = z; a[i * 3 + 2] = y; }
        else { a[i * 3] = z; a[i * 3 + 1] = x; a[i * 3 + 2] = y; }
      }
    }),
    make((a) => { // rippled sphere
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), th = i * 2.399963;
        const rr = 1 + 0.24 * Math.sin(th * 3) * Math.cos(y * 3.14159 * 3);
        a[i * 3] = Math.cos(th) * r * rr; a[i * 3 + 1] = y * rr; a[i * 3 + 2] = Math.sin(th) * r * rr;
      }
    }),
    make((a) => { // box
      for (let i = 0; i < N; i++) {
        const face = Math.floor(R() * 3), s = R() < 0.5 ? -1 : 1, u = (R() - 0.5) * 1.56, v = (R() - 0.5) * 1.56;
        if (face === 0) { a[i * 3] = s * 0.78; a[i * 3 + 1] = u; a[i * 3 + 2] = v; }
        else if (face === 1) { a[i * 3] = u; a[i * 3 + 1] = s * 0.78; a[i * 3 + 2] = v; }
        else { a[i * 3] = u; a[i * 3 + 1] = v; a[i * 3 + 2] = s * 0.78; }
      }
    }),
    make((a) => { // helix
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1), ang = t * 6.2832 * 3.2, rad = 0.62 * (0.55 + 0.45 * Math.sin(t * Math.PI));
        a[i * 3] = Math.cos(ang) * rad; a[i * 3 + 1] = (t - 0.5) * 2 * 1.05; a[i * 3 + 2] = Math.sin(ang) * rad;
      }
    }),
  ];
}

function sprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  return c;
}
function paint(c, r, g, b, stops) {
  const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 64);
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [at, a] of stops) grad.addColorStop(at, `rgba(${r},${g},${b},${a})`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
}

// draw: false when the site-wide particle stage renders this section — only the step state is kept, and
// onStep reports it so the stage can follow.
export function createMorph(section, { lowPower = false, sRMobile = 0.46, autoSpeed = 0.00008, draw = true, onStep = null } = {}) {
  const canvas = section.querySelector('.morph-canvas');
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return null;

  const caps = $$('.morph-cap', section);
  const steps = $$('.morph-step', section);
  const N = lowPower ? 400 : window.innerWidth <= 900 ? 550 : 900;
  const shapes = buildShapes(N);
  const cur = new Float32Array(N * 3);
  cur.set(shapes[0]);
  const ramp = RAMP.map(([name, fb]) => rgb(name, fb));
  const core = sprite();
  const glow = sprite();
  let tint = '';

  const DPR = Math.min(lowPower ? 1 : 2, window.devicePixelRatio || 1);
  let W = 1, H = 1, sR = 200, cx0 = 0.5;
  let mode = null, go = null, onScreen = true, running = false;
  let tP = 0, dP = 0, mx = 0, my = 0, tmx = 0, tmy = 0, clock = 0, active = -1, manualP = -1, manualUntil = 0;

  const smooth = (t) => t * t * (3 - 2 * t);
  const follow = (k, dt) => 1 - Math.pow(1 - k, dt / 16.667); // frame-rate independent easing

  function setActive(i) {
    if (i === active) return;
    active = i;
    if (onStep) onStep(i);
    caps.forEach((c, k) => c.classList.toggle('is-active', k === i));
    steps.forEach((b, k) => {
      b.classList.toggle('is-active', k === i);
      if (k === i) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
  }

  function render(dt) {
    clock += dt;
    if (mode === 'auto') {
      if (manualP >= 0 && performance.now() < manualUntil) tP = manualP;
      else { manualP = -1; tP = Math.sin(clock * autoSpeed) * 0.5 + 0.5; }
    }
    if (mode === 'pinned' || mode === 'auto') dP += (tP - dP) * follow(0.07, dt);
    else dP = tP;
    const km = follow(0.06, dt);
    mx += (tmx - mx) * km;
    my += (tmy - my) * km;

    const seg = dP * (STEPS - 1);
    const i = Math.min(STEPS - 2, Math.floor(seg));
    const f = smooth(seg - i);
    setActive(Math.round(seg));
    if (!draw) return;
    const A = shapes[i], B = shapes[i + 1];
    for (let k = 0; k < N * 3; k++) cur[k] = A[k] + (B[k] - A[k]) * f;

    const hue = seg + clock * 0.00025;
    let ci = Math.floor(hue) % STEPS;
    if (ci < 0) ci += STEPS;
    const cf = hue - Math.floor(hue);
    const c0 = ramp[ci], c1 = ramp[(ci + 1) % STEPS];
    const cr = (c0[0] + (c1[0] - c0[0]) * cf) | 0;
    const cg = (c0[1] + (c1[1] - c0[1]) * cf) | 0;
    const cb = (c0[2] + (c1[2] - c0[2]) * cf) | 0;
    const key = cr + ',' + cg + ',' + cb;
    if (key !== tint) {
      tint = key;
      paint(core, cr, cg, cb, CORE_STOPS);
      paint(glow, cr, cg, cb, GLOW_STOPS);
    }

    ctx.clearRect(0, 0, W, H);
    const ry = clock * 0.00022 + mx * 1.1, rx = -0.18 + my * 0.6;
    const cy = Math.cos(ry), sy = Math.sin(ry), cxr = Math.cos(rx), sxr = Math.sin(rx);
    const ox = W * cx0, oy = H * 0.5;
    ctx.globalCompositeOperation = 'lighter';
    for (let p = 0; p < N; p++) {
      const x = cur[p * 3], y = cur[p * 3 + 1], z = cur[p * 3 + 2];
      const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      const y1 = y * cxr - z1 * sxr, z2 = y * sxr + z1 * cxr;
      const zc = z2 * sR + 880;
      if (zc < 60) continue;
      const s = 760 / zc;
      const qx = ox + x1 * sR * s, qy = oy + y1 * sR * s;
      const depth = Math.min(1, Math.max(0, (z2 + 1.5) / 3));
      const rad = Math.max(0.7, s * 2.4 * (0.45 + depth)) * 1.12; // slightly larger: fewer particles than before
      ctx.globalAlpha = 0.22 + depth * 0.78;
      if (depth > 0.62) {
        const g = rad * 3.4;
        ctx.drawImage(glow, qx - g, qy - g, g * 2, g * 2);
      } else {
        ctx.drawImage(core, qx - rad, qy - rad, rad * 2, rad * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  const tick = (time, deltaTime) => render(deltaTime < 0 ? 16 : Math.min(deltaTime, 64));
  const sync = () => {
    const want = onScreen && (mode === 'pinned' || mode === 'auto');
    if (want && !running) { running = true; gsap.ticker.add(tick); }
    else if (!want && running) { running = false; gsap.ticker.remove(tick); }
  };

  function resize() {
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const compact = window.innerWidth <= 900;
    sR = Math.min(W, H) * (compact ? sRMobile : 0.46);
    cx0 = compact ? 0.5 : 0.64;
    if (!running) render(0);
  }

  const onMove = (e) => {
    tmx = e.clientX / window.innerWidth - 0.5;
    tmy = e.clientY / window.innerHeight - 0.5;
  };
  const onLeave = () => { tmx = tmy = 0; };

  const clicks = steps.map((b, i) => {
    const handler = () => {
      if (mode === 'pinned' && go) go(i);
      else if (mode === 'auto') { manualP = i / (STEPS - 1); manualUntil = performance.now() + 7000; }
      else { tP = dP = i / (STEPS - 1); render(0); }
    };
    b.addEventListener('click', handler);
    return handler;
  });

  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; sync(); }, { rootMargin: '160px' })
    : null;
  if (io) io.observe(section);

  window.addEventListener('resize', resize);
  resize();
  setActive(0);

  function setMode(next, goFn) {
    mode = next;
    go = goFn || null;
    manualP = -1;
    const live = next === 'pinned' || next === 'auto';
    if (live) {
      section.addEventListener('mousemove', onMove);
      section.addEventListener('mouseleave', onLeave);
    } else {
      section.removeEventListener('mousemove', onMove);
      section.removeEventListener('mouseleave', onLeave);
      tmx = tmy = mx = my = 0;
    }
    sync();
    if (!running) render(0);
  }

  return {
    setMode,
    setProgress(p) { tP = p; },
    dispose() {
      mode = null;
      sync();
      if (io) io.disconnect();
      window.removeEventListener('resize', resize);
      section.removeEventListener('mousemove', onMove);
      section.removeEventListener('mouseleave', onLeave);
      steps.forEach((b, i) => b.removeEventListener('click', clicks[i]));
    },
  };
}
