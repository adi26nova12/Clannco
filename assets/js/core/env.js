/* Shared environment helpers: DOM lookup, media queries, device capability, palette. */

// Page-level queries are scoped to the current page's container. During a page transition the outgoing
// and incoming pages briefly coexist (with duplicate ids), so lookups must not search the whole document.
let root = document;
export function setRoot(el) { root = el || document; }

export const $ = (sel, scope = root) => scope.querySelector(sel);
export const $$ = (sel, scope = root) => Array.from(scope.querySelectorAll(sel));

// Breakpoints match the stylesheets: 900px is where the morph stage and two-column layouts collapse.
export const MQ = {
  reduce: '(prefers-reduced-motion: reduce)',
  motionOK: '(prefers-reduced-motion: no-preference)',
  desktop: '(min-width: 901px)',
  compact: '(max-width: 900px)',
  fine: '(hover: hover) and (pointer: fine)',
};

// Weak or data-saving devices get fewer particles and a capped pixel ratio; nothing else changes.
export const lowPower =
  (navigator.hardwareConcurrency || 8) <= 4 ||
  !!(navigator.connection && navigator.connection.saveData);

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Testing override for the hero tier: ?hero=webgl forces the WebGL scene, ?hero=canvas forces the 2D one.
export const heroOverride = new URLSearchParams(window.location.search).get('hero');

// True only for a hardware-accelerated WebGL2 context. Software renderers (SwiftShader, llvmpipe) would
// run the scene on the CPU, which is worse than the canvas version, so they count as unavailable.
export function hasHardwareWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return !/swiftshader|llvmpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
}

// Resolves when the faces that drive layout have loaded (headings and body copy), or after capMs.
// Deliberately not document.fonts.ready: that waits on every pending font load, and one unrelated face
// kept it unresolved for the full cap on every page transition.
const LAYOUT_FACES = ['900 1em "Barlow Condensed"', '700 1em "Barlow Condensed"', '400 1em "Barlow"', '800 1em "Barlow"'];
export function pageFontsReady(capMs) {
  const cap = new Promise((resolve) => setTimeout(resolve, capMs));
  if (!document.fonts || !document.fonts.load) return cap;
  const faces = Promise.all(LAYOUT_FACES.map((f) => document.fonts.load(f).catch(() => null)));
  return Promise.race([faces, cap]);
}

// Reads a palette token (e.g. --brass: #C9A24A) so canvas colours cannot drift from the CSS.
export function rgb(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
