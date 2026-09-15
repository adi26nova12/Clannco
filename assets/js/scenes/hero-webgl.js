/* WebGL tier of the hero particle network (three.js).
   The same idea as the canvas version — gold nodes in a slowly rotating slab, linked by gold lines, with a
   brass glow that follows the cursor — plus a fine dust layer the canvas could never afford. It uses the
   canvas version's projection, so nodes sit where they would have been drawn. Links are chosen once at
   startup; a frame is a few uniform writes and one render call, on GSAP's shared ticker. */
import * as THREE from '../vendor/three-0.169.0.module.min.js';
import { gsap } from '../core/gsap-setup.js';
import { rgb } from '../core/env.js';

const SP = 1100;               // slab depth — matches the canvas version
const PROJ = 820;              // focal length in CSS px — matches the canvas version
const LINK_ALPHA = 0.18;       // matches the canvas version's desktop link strength
const LINK_SCREEN_DIST2 = 13500; // px² — the canvas version's on-screen link distance (~116 px)
const MAX_LINKS_PER_NODE = 6;
const LINK_CANDIDATES = 480;   // generous: the shader fades out any that project too far apart
const POINT_SIZE_CAP = 18;     // px; additive points are pure overdraw, so this bounds fill cost
const MAX_BACKING_WIDTH = 2560;

// sRGB 0–1 vectors, deliberately not THREE.Color: Color converts to linear space, and these shaders write
// their output straight to the canvas, so passing the palette through unconverted keeps it exact.
const vec = ([r, g, b]) => new THREE.Vector3(r / 255, g / 255, b / 255);

// One additive blend for everything, expressed so the canvas stays valid premultiplied alpha — the same
// result as the canvas version's 'lighter' compositing.
const BLEND = {
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneFactor,
};

// A slow drift field shared by points and lines, so link endpoints stay attached to their nodes.
const DRIFT = /* glsl */ `
  uniform float uTime;
  uniform float uZoff;
  uniform float uProj;
  vec3 drift(vec3 p, float seed) {
    float t = uTime * 0.35 + seed * 6.2831;
    return vec3(sin(p.y * 0.0021 + t), cos(p.z * 0.0019 + t * 1.13), sin(p.x * 0.0017 - t * 0.87)) * 38.0;
  }
`;

const POINT_VERT = /* glsl */ `
  ${DRIFT}
  uniform float uPixelRatio;
  attribute float aSeed;
  attribute float aKind;   // 0 dust · 1 node · 2 hot node
  varying float vAlpha;
  varying float vKind;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position + drift(position, aSeed), 1.0);
    mv.z -= uZoff;
    float d = -mv.z;
    if (d < 60.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
    float s = uProj / d;
    float size;
    if (aKind > 1.5)      { size = max(2.2, s * 3.4); vAlpha = min(1.0, s * 1.4); }
    else if (aKind > 0.5) { size = max(1.6, s * 3.8); vAlpha = min(0.92, s * 1.15); }
    else                  { size = max(1.0, s * 1.3); vAlpha = min(0.34, s * 0.3); }
    vKind = aKind;
    gl_PointSize = min(size, ${POINT_SIZE_CAP.toFixed(1)}) * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }
`;

const POINT_FRAG = /* glsl */ `
  uniform vec3 uBrass;
  uniform vec3 uBrass2;
  uniform vec3 uCream;
  varying float vAlpha;
  varying float vKind;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.28, r);
    if (a <= 0.0) discard;
    vec3 col = vKind > 1.5 ? uCream : (vKind > 0.5 ? uBrass2 : mix(uBrass, uBrass2, 0.5));
    gl_FragColor = vec4(col, a * vAlpha);
  }
`;

// Links are chosen once by 3D proximity, but a pair near the camera can still project far apart on screen.
// Each vertex also receives its link's other endpoint, so the shader measures the projected length and
// applies the canvas version's on-screen falloff: full strength when close, gone beyond ~116 px.
const LINE_VERT = /* glsl */ `
  ${DRIFT}
  uniform vec2 uRes;
  attribute float aSeed;
  attribute vec3 aOther;
  attribute float aOtherSeed;
  varying float vAlpha;
  vec4 place(vec3 p, float seed, out float depth) {
    vec4 mv = modelViewMatrix * vec4(p + drift(p, seed), 1.0);
    mv.z -= uZoff;
    depth = -mv.z;
    return projectionMatrix * mv;
  }
  void main() {
    float d;
    float dOther;
    vec4 clip = place(position, aSeed, d);
    vec4 other = place(aOther, aOtherSeed, dOther);
    gl_Position = clip;
    if (d < 60.0 || dOther < 60.0) { vAlpha = 0.0; return; }
    vec2 a = clip.xy / clip.w * 0.5 * uRes;
    vec2 b = other.xy / other.w * 0.5 * uRes;
    vec2 delta = a - b;
    float falloff = clamp(1.0 - dot(delta, delta) / ${LINK_SCREEN_DIST2.toFixed(1)}, 0.0, 1.0);
    vAlpha = falloff * ${LINK_ALPHA.toFixed(2)} * (uProj / max(d, dOther));
  }
`;

const LINE_FRAG = /* glsl */ `
  uniform vec3 uBrass2;
  varying float vAlpha;
  void main() { gl_FragColor = vec4(uBrass2, vAlpha); }
`;

const AURA_VERT = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const AURA_FRAG = /* glsl */ `
  uniform vec2 uGlow;
  uniform float uGlowR;
  uniform float uGlowA;
  uniform vec2 uRes;
  uniform float uPixelRatio;
  uniform vec3 uBrass;
  void main() {
    vec2 px = vec2(gl_FragCoord.x, uRes.y * uPixelRatio - gl_FragCoord.y) / uPixelRatio;
    float a = uGlowA * clamp(1.0 - distance(px, uGlow) / uGlowR, 0.0, 1.0);
    gl_FragColor = vec4(uBrass, a);
  }
`;

function buildNodes(count) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * SP * 1.7;
    pos[i * 3 + 1] = (Math.random() - 0.5) * SP * 1.25;
    pos[i * 3 + 2] = (Math.random() - 0.5) * SP;
  }
  return pos;
}

// Closest pairs in 3D first, capped per node, until the target is reached. Runs once.
function buildLinks(pos, count, target) {
  const pairs = [];
  for (let a = 0; a < count; a++) {
    for (let b = a + 1; b < count; b++) {
      const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2];
      pairs.push([dx * dx + dy * dy + dz * dz, a, b]);
    }
  }
  pairs.sort((p, q) => p[0] - q[0]);
  const degree = new Uint8Array(count);
  const chosen = [];
  for (const p of pairs) {
    if (degree[p[1]] >= MAX_LINKS_PER_NODE || degree[p[2]] >= MAX_LINKS_PER_NODE) continue;
    degree[p[1]]++;
    degree[p[2]]++;
    chosen.push(p);
    if (chosen.length >= target) break;
  }
  return chosen.map(([, a, b]) => [a, b]);
}

export function mountHeroWebGL(host, { lowPower = false, onLost = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-webgl';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const anchor = host.querySelector('canvas.bg3d');
  if (anchor) anchor.after(canvas);
  else host.prepend(canvas);

  const brass = vec(rgb('--brass', [201, 162, 74]));
  const brass2 = vec(rgb('--brass-2', [230, 199, 102]));
  const cream = vec(rgb('--cream', [243, 239, 226]));

  // shared uniform objects: updating one value updates every material that references it
  const shared = {
    uTime: { value: 0 }, uZoff: { value: 0 }, uProj: { value: PROJ }, uPixelRatio: { value: 1 },
    uRes: { value: new THREE.Vector2(1, 1) },
  };

  const NODES = 150;
  const DUST = lowPower ? 2500 : 6000;
  const nodePos = buildNodes(NODES);
  const dustPos = buildNodes(DUST);

  const pointGeo = new THREE.BufferGeometry();
  const allPos = new Float32Array((NODES + DUST) * 3);
  allPos.set(nodePos, 0);
  allPos.set(dustPos, NODES * 3);
  const seeds = new Float32Array(NODES + DUST).map(() => Math.random());
  const kinds = new Float32Array(NODES + DUST);
  for (let i = 0; i < NODES; i++) kinds[i] = i < Math.round(NODES * 0.03) ? 2 : 1;
  pointGeo.setAttribute('position', new THREE.BufferAttribute(allPos, 3));
  pointGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  pointGeo.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  const points = new THREE.Points(pointGeo, new THREE.ShaderMaterial({
    ...BLEND, vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    uniforms: { ...shared, uBrass: { value: brass }, uBrass2: { value: brass2 }, uCream: { value: cream } },
  }));
  points.frustumCulled = false; // shader-displaced vertices; the static bounding sphere is not reliable

  const links = buildLinks(nodePos, NODES, LINK_CANDIDATES);
  const lineGeo = new THREE.BufferGeometry();
  const linePos = new Float32Array(links.length * 6);
  const lineOther = new Float32Array(links.length * 6);
  const lineSeed = new Float32Array(links.length * 2);
  const lineOtherSeed = new Float32Array(links.length * 2);
  links.forEach(([a, b], i) => {
    const pa = nodePos.subarray(a * 3, a * 3 + 3);
    const pb = nodePos.subarray(b * 3, b * 3 + 3);
    linePos.set(pa, i * 6);
    linePos.set(pb, i * 6 + 3);
    lineOther.set(pb, i * 6);     // each vertex knows the far end of its link
    lineOther.set(pa, i * 6 + 3);
    lineSeed[i * 2] = seeds[a];
    lineSeed[i * 2 + 1] = seeds[b];
    lineOtherSeed[i * 2] = seeds[b];
    lineOtherSeed[i * 2 + 1] = seeds[a];
  });
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  lineGeo.setAttribute('aOther', new THREE.BufferAttribute(lineOther, 3));
  lineGeo.setAttribute('aSeed', new THREE.BufferAttribute(lineSeed, 1));
  lineGeo.setAttribute('aOtherSeed', new THREE.BufferAttribute(lineOtherSeed, 1));
  const lines = new THREE.LineSegments(lineGeo, new THREE.ShaderMaterial({
    ...BLEND, vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
    uniforms: { ...shared, uBrass2: { value: brass2 } },
  }));
  lines.frustumCulled = false; // shader-displaced vertices; the static bounding sphere is not reliable

  const auraUniforms = {
    uGlow: { value: new THREE.Vector2() }, uGlowR: { value: 1 }, uGlowA: { value: 0.12 },
    uRes: shared.uRes, uPixelRatio: shared.uPixelRatio, uBrass: { value: brass },
  };
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    ...BLEND, vertexShader: AURA_VERT, fragmentShader: AURA_FRAG, uniforms: auraUniforms,
  }));
  aura.frustumCulled = false;
  aura.renderOrder = -1;

  const group = new THREE.Group();
  group.add(lines, points);
  const scene = new THREE.Scene();
  scene.add(aura, group);
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 8000);
  camera.position.set(0, 0, PROJ);

  let W = 1, H = 1;
  const resize = () => {
    W = host.clientWidth || window.innerWidth;
    H = host.clientHeight || window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.5, MAX_BACKING_WIDTH / W);
    renderer.setPixelRatio(ratio);
    renderer.setSize(W, H, false);
    shared.uPixelRatio.value = ratio;
    // a vertical field of view that makes 1 world unit = 1 CSS px at z = 0, i.e. the canvas projection
    camera.fov = (2 * Math.atan(H / 2 / PROJ) * 180) / Math.PI;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    shared.uRes.value.set(W, H);
    auraUniforms.uGlowR.value = Math.max(W, H) * 0.55;
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  const state = { tY: 0, tX: 0, mY: 0, mX: 0, rot: 0, bob: 0, zoff: 0 };
  const onMove = (e) => {
    state.tY = (e.clientX / window.innerWidth - 0.5) * 0.6;
    state.tX = (e.clientY / window.innerHeight - 0.5) * 0.45;
  };
  window.addEventListener('mousemove', onMove, { passive: true });

  // scroll pushes the slab away from the viewer as the hero leaves, smoothed by scrub
  const scrollTween = gsap.to(state, {
    zoff: () => SP * 0.95 * Math.min(1.2, host.offsetHeight / window.innerHeight),
    ease: 'none',
    scrollTrigger: { trigger: host, start: 'top top', end: 'bottom top', scrub: 1, invalidateOnRefresh: true },
  });

  const tick = (time, deltaTime) => {
    const dt = deltaTime < 0 ? 16 : Math.min(deltaTime, 64);
    const k = 1 - Math.pow(1 - 0.045, dt / 16.667);
    state.rot += dt * 0.00006;
    state.bob += dt;
    const cursorY = state.tY;
    const cursorX = state.tX + Math.sin(state.bob * 0.0004) * 0.06;
    state.mY += (cursorY - state.mY) * k;
    state.mX += (cursorX - state.mX) * k;
    group.rotation.set(state.mX, state.mY + state.rot, 0);
    shared.uTime.value = time;
    shared.uZoff.value = state.zoff;
    // the glow follows the cursor only; the canvas version also added the ever-growing auto-rotation,
    // which slowly walked its glow off screen
    auraUniforms.uGlow.value.set(W * 0.5 + state.mY * 300, H * 0.44 + state.mX * 240);
    renderer.render(scene, camera);
  };

  let running = false;
  let onScreen = true;
  const sync = () => {
    if (onScreen && !running) { running = true; gsap.ticker.add(tick); }
    else if (!onScreen && running) { running = false; gsap.ticker.remove(tick); }
  };
  const io = new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; sync(); }, { rootMargin: '140px' });
  io.observe(host);

  const handleLost = (e) => {
    e.preventDefault();
    if (onLost) onLost();
  };
  canvas.addEventListener('webglcontextlost', handleLost);

  return {
    canvas,
    stats: { nodes: NODES, dust: DUST, links: links.length },
    // compile shaders and draw one frame before the canvas is shown, so the first visible frame never stalls
    warm() {
      renderer.compile(scene, camera);
      tick(0, 16);
      sync();
    },
    dispose() {
      running = true;
      onScreen = false;
      sync();
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('mousemove', onMove);
      if (scrollTween.scrollTrigger) scrollTween.scrollTrigger.kill();
      scrollTween.kill();
      canvas.removeEventListener('webglcontextlost', handleLost);
      [points, lines, aura].forEach((o) => { o.geometry.dispose(); o.material.dispose(); });
      renderer.dispose();
      renderer.forceContextLoss(); // release the GPU context now; browsers cap how many can exist
      canvas.remove();
    },
  };
}
