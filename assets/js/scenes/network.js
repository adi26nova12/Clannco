/* The hero particle network: gold nodes in a slowly rotating 3D slab, linked when close on screen,
   with a cursor-following brass glow. Runs on GSAP's ticker only while the hero is on screen.
   Lines and dots are batched by alpha, so a frame costs a handful of draw calls instead of hundreds. */
import { gsap, ScrollTrigger } from '../core/gsap-setup.js';
import { rgb, clamp } from '../core/env.js';

const LINK_BUCKETS = 6;
const DOT_BUCKETS = 8;

export function mountNetwork(canvas, { mobileBoost = false, lowPower = false } = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dispose() {} };
  const host = canvas.parentElement;
  const DPR = Math.min(lowPower ? 1 : 2, window.devicePixelRatio || 1);
  const brass = rgb('--brass', [201, 162, 74]).join(',');
  const brass2 = rgb('--brass-2', [230, 199, 102]).join(',');

  let W = 1;
  let H = 1;
  let hostTop = 0;
  const measure = () => { hostTop = host.getBoundingClientRect().top + window.scrollY; };
  const resize = () => {
    W = host.clientWidth || window.innerWidth;
    H = host.clientHeight || window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    measure();
  };
  resize();

  // the homepage densifies and brightens the network on small screens; automation pages do not
  const small = mobileBoost && Math.min(window.innerWidth, window.innerHeight) <= 760;
  const dens = parseFloat(canvas.getAttribute('data-density') || '1');
  let N = small
    ? clamp(Math.round((W * H) / 5200 * dens), 74, 120)
    : clamp(Math.round((W * H) / 8200 * dens), 50, 150);
  if (lowPower) N = Math.round(N * 0.7);

  const SP = 1100;
  const PROJ = 820;
  const LINK = small ? 17000 : 13500;
  const LINKA = small ? 0.34 : 0.18;
  const rotSpeed = mobileBoost ? (small ? 0.00015 : 0.00006) : 0.00003;
  const bobAmp = mobileBoost ? (small ? 0.12 : 0.06) : 0;
  const dotR = small ? 2.5 : 1.9;
  const dotRmin = mobileBoost ? 0.5 : 0.4;
  const dotA = small ? 1.38 : 1.15;
  const dotAmax = mobileBoost ? 0.95 : 0.92;
  const glowA = small ? 0.2 : 0.12;

  const pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pts[i * 3] = (Math.random() - 0.5) * SP * 1.7;
    pts[i * 3 + 1] = (Math.random() - 0.5) * SP * 1.25;
    pts[i * 3 + 2] = (Math.random() - 0.5) * SP;
  }
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const ps = new Float32Array(N);
  const vis = new Uint8Array(N);

  const linkMax = LINKA * 1.4;
  const linkStyle = Array.from({ length: LINK_BUCKETS }, (_, k) => `rgba(${brass2},${(((k + 0.5) / LINK_BUCKETS) * linkMax).toFixed(3)})`);
  const dotStyle = Array.from({ length: DOT_BUCKETS }, (_, k) => `rgba(${brass2},${(((k + 0.5) / DOT_BUCKETS) * dotAmax).toFixed(3)})`);
  const links = Array.from({ length: LINK_BUCKETS }, () => []);
  const dots = Array.from({ length: DOT_BUCKETS }, () => []);

  let mY = 0, mX = 0, tY = 0, tX = 0, prog = 0, rotAcc = 0, bobAcc = 0;

  const onMove = (e) => {
    tY = (e.clientX / window.innerWidth - 0.5) * 0.6;
    tX = (e.clientY / window.innerHeight - 0.5) * 0.45;
  };
  const onScroll = () => {
    prog = clamp((window.scrollY - hostTop) / (window.innerHeight || 800), -1.2, 1.2);
  };
  window.addEventListener('mousemove', onMove, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', resize);
  ScrollTrigger.addEventListener('refresh', measure);
  onScroll();

  const tick = (time, deltaTime) => {
    const dt = deltaTime < 0 ? 16 : Math.min(deltaTime, 64);
    rotAcc += dt * rotSpeed;
    bobAcc += dt;
    ctx.clearRect(0, 0, W, H);
    mY += (tY + rotAcc - mY) * 0.045;
    mX += (tX + Math.sin(bobAcc * 0.0004) * bobAmp - mX) * 0.045;
    const cy = Math.cos(mY), sy = Math.sin(mY), cx = Math.cos(mX), sx = Math.sin(mX);
    const zoff = prog * SP * 0.95;

    ctx.globalCompositeOperation = 'lighter';
    const gx = W * 0.5 + mY * 300;
    const gy = H * 0.44 + mX * 240;
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.55);
    glow.addColorStop(0, `rgba(${brass},${glowA})`);
    glow.addColorStop(1, `rgba(${brass},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    for (let i = 0; i < N; i++) {
      const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
      const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      const y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
      const d = PROJ + z2 + zoff;
      if (d < 60) { vis[i] = 0; continue; }
      const s = PROJ / d;
      vis[i] = 1;
      px[i] = W / 2 + x1 * s;
      py[i] = H / 2 + y1 * s;
      ps[i] = s;
    }

    for (const b of links) b.length = 0;
    for (let a = 0; a < N; a++) {
      if (!vis[a]) continue;
      for (let b = a + 1; b < N; b++) {
        if (!vis[b]) continue;
        const dx = px[a] - px[b], dy = py[a] - py[b], dd = dx * dx + dy * dy;
        if (dd >= LINK) continue;
        const al = (1 - dd / LINK) * LINKA * Math.min(ps[a], ps[b]);
        if (al < 0.004) continue;
        links[Math.min(LINK_BUCKETS - 1, ((al / linkMax) * LINK_BUCKETS) | 0)].push(px[a], py[a], px[b], py[b]);
      }
    }
    ctx.lineWidth = small ? 1.3 : 1;
    for (let k = 0; k < LINK_BUCKETS; k++) {
      const seg = links[k];
      if (!seg.length) continue;
      ctx.strokeStyle = linkStyle[k];
      ctx.beginPath();
      for (let j = 0; j < seg.length; j += 4) {
        ctx.moveTo(seg[j], seg[j + 1]);
        ctx.lineTo(seg[j + 2], seg[j + 3]);
      }
      ctx.stroke();
    }

    for (const b of dots) b.length = 0;
    for (let i = 0; i < N; i++) {
      if (!vis[i]) continue;
      const rad = Math.max(dotRmin, ps[i] * dotR);
      const al = Math.min(dotAmax, ps[i] * dotA);
      dots[Math.min(DOT_BUCKETS - 1, ((al / dotAmax) * DOT_BUCKETS) | 0)].push(px[i], py[i], rad);
    }
    for (let k = 0; k < DOT_BUCKETS; k++) {
      const set = dots[k];
      if (!set.length) continue;
      ctx.fillStyle = dotStyle[k];
      ctx.beginPath();
      for (let j = 0; j < set.length; j += 3) {
        ctx.moveTo(set[j] + set[j + 2], set[j + 1]);
        ctx.arc(set[j], set[j + 1], set[j + 2], 0, 6.2832);
      }
      ctx.fill();
    }
  };

  let running = false;
  const start = () => { if (!running) { running = true; gsap.ticker.add(tick); } };
  const stop = () => { if (running) { running = false; gsap.ticker.remove(tick); } };
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((es) => (es[0].isIntersecting ? start() : stop()), { rootMargin: '140px' })
    : null;
  if (io) io.observe(host);
  start();

  return {
    dispose() {
      stop();
      if (io) io.disconnect();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', resize);
      ScrollTrigger.removeEventListener('refresh', measure);
      ctx.clearRect(0, 0, W, H);
    },
  };
}
