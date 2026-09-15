/* Smooth scrolling. Lenis runs on GSAP's ticker, so the whole site shares a single animation frame
   loop. It lives for the whole visit (it is not rebuilt per page) and is torn down only when reduced
   motion is switched on. */
import { gsap, ScrollTrigger } from './gsap-setup.js';
import { $, MQ } from './env.js';

let lenis = null;
let tick = null;

export function createLenis() {
  if (lenis || !window.Lenis) return lenis;
  lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  tick = (time) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  document.documentElement.classList.add('lenis');
  return lenis;
}

export function destroyLenis() {
  if (!lenis) return;
  gsap.ticker.remove(tick);
  lenis.destroy();
  lenis = tick = null;
  gsap.ticker.lagSmoothing(500, 33);
  document.documentElement.classList.remove('lenis');
}

// Page transitions hold scrolling still while the page underneath is swapped.
export function pauseScroll() { if (lenis) lenis.stop(); }
export function resumeScroll() { if (lenis) lenis.start(); }

// Lenis clamps to the scroll limit it last measured (its resize observer updates it asynchronously). Pins
// add their spacers during a refresh, so re-measure first or a jump lands short — a cross-page #pricing
// link on the redesigned homepage stopped 3,955 px above its section.
export function jumpTo(y) {
  if (lenis) {
    lenis.resize();
    lenis.scrollTo(y, { immediate: true, force: true });
  } else window.scrollTo(0, y);
}

export function scrollToTarget(target, { offset = 0, duration = 1.1 } = {}) {
  if (lenis) {
    lenis.resize();
    lenis.scrollTo(target, { offset, duration });
    return;
  }
  const y = typeof target === 'number'
    ? target + offset
    : target.getBoundingClientRect().top + window.scrollY + offset;
  window.scrollTo({ top: y, behavior: window.matchMedia(MQ.reduce).matches ? 'auto' : 'smooth' });
}

/* In-page links: smooth scroll with the nav offset, then move focus to the target so keyboard and
   screen-reader users land where they were sent. The target is looked up in the current page only. */
export function initAnchors() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    let target = null;
    try { target = $(id); } catch { return; }
    if (!target) return;
    e.preventDefault();
    scrollToTarget(target, { offset: -80 });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
}
