/* Starts the site once app.js has confirmed GSAP is present.
   Visit-wide pieces (smooth scroll, cursor, progress bar, in-page anchors) start once. Everything that
   belongs to a page starts through startPage(), which returns its own teardown — so a page transition
   can stop the outgoing page completely and start the incoming one. */
import { gsap, ScrollTrigger } from './gsap-setup.js';
import { $, MQ, setRoot, pageFontsReady, hasHardwareWebGL2, lowPower } from './env.js';
import { PAGES } from './config.js';
import { initUI, initGlobalChrome, initPageChrome, syncChrome } from './ui.js';
import { initAnchors, jumpTo, scrollToTarget } from './scroll.js';
import { initGlobalMotion, initPageMotion } from './motion.js';
import { runFirstIntro, runEnterIntro, resetHeroGate, whenHeroSettled } from './intro.js';
import { initTransitions } from './transitions.js';
import { createHud } from './hud.js';
import { initFormConsoles } from './form-console.js';
import { bindDirector, unbindDirector, setStage, directorMorphStep } from './stage-director.js';

const NAV_OFFSET = 80;

// The cursor lives for the whole visit, so it reacts to interactive elements of every page type.
const cursorHover = [...new Set(
  Object.values(PAGES).flatMap((p) => p.cursorHover.split(',').map((s) => s.trim())),
)].join(', ');

function startPage(container, namespace, firstLoad) {
  setRoot(container);
  resetHeroGate();
  // the WebGL hero waits for the hero entrance to finish before compiling its shaders
  const cfg = { ...(PAGES[namespace] || PAGES.vertical), heroReady: whenHeroSettled, onMorphStep: directorMorphStep };
  const reduce = window.matchMedia(MQ.reduce).matches;
  const ac = new AbortController();

  initUI(gsap, { signal: ac.signal });
  initFormConsoles({ signal: ac.signal });
  const stopChrome = initPageChrome(ScrollTrigger);
  const stopMotion = initPageMotion(cfg);
  bindDirector(cfg.scenes || []);
  (firstLoad ? runFirstIntro : runEnterIntro)(cfg, reduce);
  syncChrome();

  return () => {
    unbindDirector();
    ac.abort();
    stopChrome();
    stopMotion();
  };
}

/* The site-wide particle stage. The tier is decided before the first page starts (so the page knows not to
   mount the old hero backgrounds); three.js loads after the hero has settled, so shader compilation never
   lands mid-intro. Without a hardware GPU, with reduced motion or data-saver, a still glow stands in. */
function prepareStage() {
  const host = document.createElement('div');
  host.className = 'stage';
  host.setAttribute('aria-hidden', 'true');
  document.body.prepend(host);
  const want = new URLSearchParams(window.location.search).get('stage');
  const reduce = window.matchMedia(MQ.reduce).matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const allowed = want !== 'off' && !reduce && !saveData && (want === 'on' || hasHardwareWebGL2());
  document.body.classList.add(allowed ? 'stage-on' : 'stage-poster');
  if (!allowed) return null;

  const fallBack = (err) => {
    if (err) console.warn('[clannco] Particle stage unavailable; showing the still background.', err);
    setStage(null);
    document.body.classList.replace('stage-on', 'stage-poster');
  };
  return () => import('../scenes/stage.js')
    .then(({ createStage }) => {
      const compact = window.matchMedia(MQ.compact).matches;
      const stage = createStage(host, {
        count: compact || lowPower ? 3500 : 12000,
        mobile: compact,
        onLost: () => { stage.dispose(); fallBack(); },
      });
      setStage(stage);
      gsap.to(stage.canvas, { opacity: 1, duration: 1.4, ease: 'power2.out', onStart: () => host.classList.add('is-live') });
      window.__clanncoStage = stage;
    })
    .catch(fallBack);
}

/* A deep link such as /automation/real-estate#pricing: the browser scrolls to the section while parsing,
   before the pinned centrepiece adds its scroll distance above it, which left visitors ~2,500 px short.
   Once fonts and triggers have settled, move to the section — unless the visitor has already scrolled. */
function settleInitialHash() {
  const hash = window.location.hash;
  if (hash.length < 2) return;
  let target = null;
  try { target = $(hash); } catch { return; }
  if (!target) return;
  const nativeY = window.scrollY;
  pageFontsReady(1500).then(() => {
    ScrollTrigger.refresh();
    if (Math.abs(window.scrollY - nativeY) > 60) return;
    jumpTo(target.getBoundingClientRect().top + window.scrollY - NAV_OFFSET);
  });
}

export function start() {
  initGlobalChrome(ScrollTrigger);
  // "Back to top" in the footer: a smooth scroll to the very top, focus back at the start of the page
  document.addEventListener('click', (e) => {
    const link = e.target.closest && e.target.closest('.footer-top-link');
    if (!link) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    scrollToTarget(0, { duration: 1.6 });
    const logo = document.querySelector('[data-barba="container"] .nav .logo');
    if (logo) logo.focus({ preventScroll: true });
  });
  initAnchors();
  initGlobalMotion(cursorHover);

  createHud();
  const loadStage = prepareStage();

  const container = document.querySelector('[data-barba="container"]') || document.body;
  const namespace = container.dataset.barbaNamespace || document.body.dataset.page || 'vertical';
  let stopPage = startPage(container, namespace, true);
  if (loadStage) whenHeroSettled().then(loadStage);
  // Warm the layout faces this page did not use (e.g. the homepage's Barlow Condensed 700 and Barlow 800 on an
  // automation page) once the hero has settled, so a later page transition never waits for them to download.
  whenHeroSettled().then(() => pageFontsReady(15000));
  settleInitialHash();

  initTransitions({
    onLeave: () => {
      stopPage();
      stopPage = () => {};
    },
    onEnter: (next, ns) => {
      stopPage = startPage(next, ns, false);
    },
  });

  // web fonts and late images change layout; re-measure every trigger once they settle
  const refresh = () => ScrollTrigger.refresh();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  if (document.readyState === 'complete') refresh();
  else window.addEventListener('load', refresh, { once: true });

  window.__clanncoReady = true;
}
