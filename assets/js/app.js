/* Clannco entry point.
   Loads the motion system only when every required GSAP library is present. If it cannot start, the page
   falls back to a static, fully visible layout with working menus and FAQ. Page transitions (Barba) and the
   first-visit intro (Flip) are optional enhancements: without them the site uses normal page loads. */
import { initUI, initGlobalChrome } from './core/ui.js';

const { gsap, ScrollTrigger, SplitText, CustomEase } = window;
const ready = !!(gsap && ScrollTrigger && SplitText && CustomEase);

function fallback(err) {
  if (err) console.error('[clannco] motion system failed to start:', err);
  document.documentElement.classList.remove('has-js');
  const pre = document.getElementById('preloader');
  if (pre) pre.style.display = 'none';
  initUI(ready ? gsap : null);
  initGlobalChrome(null);
  window.__clanncoReady = true;
}

if (ready) {
  import('./core/main.js').then((m) => m.start()).catch(fallback);
} else {
  fallback(new Error('GSAP libraries missing'));
}
