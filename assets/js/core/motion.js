/* The motion system.
   initGlobalMotion — lives for the whole visit: smooth scrolling and the custom cursor.
   initPageMotion   — built for each page and torn down on every page transition.
   Each uses gsap.matchMedia(), so everything is rebuilt automatically when the viewport, pointer or
   reduced-motion setting changes. */
import { gsap, ScrollTrigger, SplitText } from './gsap-setup.js';
import { $, $$, MQ, lowPower, clamp, heroOverride, hasHardwareWebGL2 } from './env.js';
import { createLenis, destroyLenis, scrollToTarget } from './scroll.js';
import { initCursor, initMagnetic, initTilt, initSpotlight } from './pointer.js';
import { mountNetwork } from '../scenes/network.js';
import { createMorph } from '../scenes/morph.js';
import { initSections } from './sections.js';

// the site-wide particle stage replaces the hero backgrounds and draws the six-step section
const stageOn = () => document.body.classList.contains('stage-on');

const isGlobalTrigger = (t) => String(t.vars.id || '').startsWith('global:');

export function initGlobalMotion(cursorHover) {
  const mm = gsap.matchMedia();
  mm.add(MQ.motionOK, () => {
    createLenis();
    return () => destroyLenis();
  });
  mm.add(`${MQ.motionOK} and ${MQ.fine}`, () => initCursor(cursorHover));
  return mm;
}

export function initPageMotion(cfg) {
  const mm = gsap.matchMedia();

  mm.add(MQ.motionOK, (ctx) => {
    initReveals(cfg.reveal);
    initHeadings(cfg.headings, ctx);
    const undoCounters = initCounters(cfg.counters);
    const undoMarquee = initMarquee();
    return () => {
      undoCounters();
      undoMarquee();
    };
  });

  mm.add(MQ.reduce, () => {
    $$(cfg.reveal).forEach((el) => el.classList.add('is-visible'));
  });

  // redesign section choreography (headline fills, horizontal rail, hero exit)
  mm.add(
    { motion: MQ.motionOK, desktop: `${MQ.desktop} and (min-height: 700px)` },
    (ctx) => (ctx.conditions.motion ? initSections(cfg, ctx.conditions.desktop) : undefined),
  );

  // Hero background: the 2D canvas everywhere motion is allowed; the WebGL scene on top of it where the
  // device can run it well.
  mm.add(
    { motion: MQ.motionOK, rich: `${MQ.motionOK} and ${MQ.desktop} and ${MQ.fine}` },
    (ctx) => (ctx.conditions.motion ? initHero(cfg, ctx.conditions.rich) : undefined),
  );

  mm.add(`${MQ.motionOK} and ${MQ.desktop}`, () => initParallax(cfg.parallax));

  mm.add(`${MQ.motionOK} and ${MQ.fine}`, () => {
    const undo = [initMagnetic(), initTilt(cfg.tilt), initSpotlight(cfg.spotlight)];
    return () => undo.forEach((fn) => fn());
  });

  const stage = $('.morph-stage');
  const morph = stage && createMorph(stage, { ...cfg.morph, lowPower, draw: !stageOn(), onStep: cfg.onMorphStep });
  if (morph) {
    mm.add(
      { pinned: `${MQ.motionOK} and ${MQ.desktop}`, auto: `${MQ.motionOK} and ${MQ.compact}`, still: MQ.reduce },
      (ctx) => {
        const { pinned, auto } = ctx.conditions;
        if (pinned) return pinMorph(stage, morph);
        morph.setMode(auto ? 'auto' : 'static');
        return () => morph.setMode(null);
      },
    );
  }

  return function destroyPageMotion() {
    mm.revert();
    if (morph) morph.dispose();
    // anything created outside a matchMedia context (e.g. by a callback after it ran) that belongs to
    // this page; visit-wide triggers are tagged "global:" and kept
    ScrollTrigger.getAll().forEach((t) => { if (!isGlobalTrigger(t)) t.kill(); });
  };
}

/* Hero background tiers.
   1. The 2D network canvas mounts immediately — it is the hero's background on every capable device and
      the placeholder while the WebGL scene loads, so three.js is never on the critical path.
   2. On a desktop with a hardware GPU (and only on pages that opt in), the WebGL scene loads when the
      browser is idle, draws its first frame off-screen, then cross-fades in; the 2D canvas is disposed.
   3. If the GPU context is lost, the WebGL scene is torn down and the 2D canvas comes back. */
function initHero(cfg, rich) {
  const canvas2d = $('canvas.bg3d');
  if (!canvas2d || stageOn()) return () => {};
  const host = canvas2d.parentElement;
  const mount2d = () => mountNetwork(canvas2d, { ...cfg.network, lowPower });
  let net = mount2d();
  let gl = null;
  let cancelled = false;
  let idle = null;
  host.dataset.heroTier = 'canvas';

  const restoreCanvas = () => {
    if (!net) net = mount2d();
    gsap.to(canvas2d, { opacity: 1, duration: 0.4, overwrite: true });
    host.dataset.heroTier = 'canvas';
  };
  const onLost = () => {
    if (!gl) return;
    const lost = gl;
    gl = null;
    lost.dispose();
    restoreCanvas();
  };

  const wantWebGL = cfg.webglHero && heroOverride !== 'canvas' &&
    (heroOverride === 'webgl' || (rich && !lowPower && hasHardwareWebGL2()));

  if (wantWebGL) {
    const load = () => {
      idle = null;
      import('../scenes/hero-webgl.js')
        .then(({ mountHeroWebGL }) => {
          if (cancelled) return;
          gl = mountHeroWebGL(host, { lowPower, onLost });
          gl.warm();
          host.dataset.heroTier = 'webgl';
          gsap.to(gl.canvas, { opacity: 1, duration: 0.6, ease: 'power2.out' });
          gsap.to(canvas2d, {
            opacity: 0, duration: 0.6, ease: 'power2.out', overwrite: true,
            onComplete: () => { if (gl && net) { net.dispose(); net = null; } },
          });
        })
        .catch((err) => {
          // three.js failed to load or the context could not be created: the canvas tier simply stays
          console.warn('[clannco] WebGL hero unavailable; keeping the canvas background.', err);
          gl = null;
        });
    };
    // Wait for the hero entrance to finish first: compiling the shaders mid-intro stalled the main thread
    // (~700 ms without a frame on a fresh profile), and the 2D canvas is already showing meanwhile.
    const heroReady = cfg.heroReady ? cfg.heroReady() : Promise.resolve();
    heroReady.then(() => {
      if (cancelled) return;
      idle = 'requestIdleCallback' in window
        ? { id: window.requestIdleCallback(load, { timeout: 2500 }), cancel: window.cancelIdleCallback }
        : { id: window.setTimeout(load, 1200), cancel: window.clearTimeout };
    });
  }

  return () => {
    cancelled = true;
    if (idle) idle.cancel.call(window, idle.id);
    if (gl) { gl.dispose(); gl = null; }
    if (net) { net.dispose(); net = null; }
    gsap.killTweensOf(canvas2d);
    gsap.set(canvas2d, { opacity: 1 });
    delete host.dataset.heroTier;
  };
}

/* Cards rise into place as they enter. The CSS base layer hides them only under .has-js. */
function initReveals(sel) {
  const els = $$(sel);
  if (!els.length) return;
  els.forEach((el) => {
    el.style.transition = 'none';
    el.classList.add('is-visible');
  });
  gsap.set(els, { autoAlpha: 0, y: 44 });
  ScrollTrigger.batch(els, {
    start: 'top 86%',
    batchMax: () => (window.innerWidth > 1060 ? 4 : 2),
    onEnter: (batch) => gsap.to(batch, {
      // 'auto', not true: true kills every tween on the element, including scroll-driven ones and their pins
      autoAlpha: 1, y: 0, duration: 1, ease: 'c-expo', stagger: 0.08, overwrite: 'auto',
    }),
  });
}

/* Section headlines rise line by line from a mask. Split at the moment they enter (fonts are loaded
   by then) and revert on landing, so no wrapper markup lingers. */
function initHeadings(sel, ctx) {
  $$(sel)
    .filter((h) => !h.closest('.hero, .morph-cap'))
    .forEach((h) => {
      gsap.set(h, { autoAlpha: 0 });
      ScrollTrigger.create({
        trigger: h,
        start: 'top 88%',
        once: true,
        onEnter: () => ctx.add(() => {
          const split = SplitText.create(h, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
          gsap.set(h, { autoAlpha: 1 });
          gsap.from(split.lines, {
            yPercent: 115, duration: 1.05, ease: 'c-expo', stagger: 0.08,
            onComplete: () => split.revert(),
          });
        }),
      });
    });
}

/* Count up plain numbers ("30+", "7s"). Values that are not a single number ("24/7", "5–7") stay as
   written — the previous parser rendered them as "24/" and "5–". Width is reserved to avoid shift. */
function initCounters(sel) {
  const undo = [];
  $$(sel).forEach((el) => {
    const raw = el.dataset.final || (el.dataset.final = el.textContent.trim());
    const m = /^(\D*?)(\d+(?:\.\d+)?)(\D*)$/.exec(raw);
    if (!m) return;
    const [, prefix, digits, suffix] = m;
    const num = parseFloat(digits);
    if (!(num > 1)) return;
    const decimals = digits.includes('.') ? 1 : 0;
    const fmt = (v) => prefix + (decimals ? v.toFixed(1) : Math.round(v)) + suffix;

    const prev = { display: el.style.display, minWidth: el.style.minWidth };
    if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
    el.style.minWidth = el.getBoundingClientRect().width + 'px';
    const o = { v: 0 };
    el.textContent = fmt(0);

    ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      once: true,
      onEnter: () => gsap.to(o, { v: num, duration: 1.6, ease: 'power2.out', onUpdate: () => { el.textContent = fmt(o.v); } }),
    });
    undo.push(() => {
      gsap.killTweensOf(o);
      el.textContent = raw;
      el.style.display = prev.display;
      el.style.minWidth = prev.minWidth;
    });
  });
  return () => undo.forEach((fn) => fn());
}

/* The marquee band leans with scroll velocity. Applied to .marquee rather than its track, because
   the track's CSS keyframe transform would override any inline transform. */
function initMarquee() {
  const bands = $$('.marquee');
  if (!bands.length) return () => {};
  const setters = bands.map((b) => gsap.quickTo(b, 'skewX', { duration: 0.4, ease: 'power3' }));
  ScrollTrigger.create({
    onUpdate: (self) => {
      const v = clamp(self.getVelocity() / -280, -12, 12);
      setters.forEach((set) => set(v));
    },
  });
  const settle = () => setters.forEach((set) => set(0));
  ScrollTrigger.addEventListener('scrollEnd', settle);
  return () => ScrollTrigger.removeEventListener('scrollEnd', settle);
}

/* Parallax from ONE ScrollTrigger. Each element keeps its own range (its top entering the bottom of the
   viewport to its bottom leaving the top — the same range a per-element scrub used), computed from
   positions cached on refresh, so scrolling does no layout reads. */
function initParallax(list) {
  const items = [];
  const seen = new Set();
  const add = (el, d) => {
    if (seen.has(el) || el.closest('.morph-stage') || !d) return;
    seen.add(el);
    items.push({ el, d, top: 0, h: 0, last: -1, set: gsap.quickSetter(el, 'yPercent') });
  };
  list.forEach(([sel, dist]) => $$(sel).forEach((el, i) => add(el, typeof dist === 'function' ? dist(i) : dist)));
  $$('[data-par]').forEach((el) => add(el, parseFloat(el.dataset.par) || 0));
  if (!items.length) return () => {};

  const measure = () => {
    const sy = window.scrollY;
    items.forEach((it) => {
      it.h = it.el.offsetHeight;
      const shift = ((gsap.getProperty(it.el, 'yPercent') || 0) / 100) * it.h + (gsap.getProperty(it.el, 'y') || 0);
      it.top = it.el.getBoundingClientRect().top + sy - shift;
      it.last = -1;
    });
  };
  const update = () => {
    const sy = window.scrollY;
    const vh = window.innerHeight;
    for (const it of items) {
      const p = clamp((sy + vh - it.top) / (vh + it.h), 0, 1);
      if (p === it.last) continue;
      it.last = p;
      it.set(-it.d + 2 * it.d * p);
    }
  };
  const onRefresh = () => { measure(); update(); };

  ScrollTrigger.addEventListener('refresh', onRefresh);
  const st = ScrollTrigger.create({ start: 0, end: 'max', onUpdate: update });
  onRefresh();

  return () => {
    ScrollTrigger.removeEventListener('refresh', onRefresh);
    st.kill();
    items.forEach((it) => gsap.set(it.el, { yPercent: 0 }));
  };
}

/* The six-step centrepiece, pinned on desktop. Progress arrives from ScrollTrigger (no layout reads in
   the render loop); the stage snaps to the nearest step in the direction of travel. */
function pinMorph(stage, morph) {
  const steps = $$('.morph-step', stage);
  const last = Math.max(1, steps.length - 1);

  const st = ScrollTrigger.create({
    trigger: stage,
    start: 'top top',
    end: () => '+=' + Math.round(window.innerHeight * 2.8),
    pin: stage.querySelector('.morph-sticky'),
    pinSpacing: true,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    refreshPriority: 1,
    onUpdate: (self) => morph.setProgress(self.progress),
  });

  const at = (i) => st.start + (i / last) * (st.end - st.start);
  const go = (i, duration = 1.1) => scrollToTarget(at(i), { duration });
  morph.setMode('pinned', go);

  const snap = () => {
    if (!st.isActive) return;
    const s = st.progress * last;
    const k = clamp(st.direction > 0 ? Math.ceil(s - 0.15) : Math.floor(s + 0.15), 0, last);
    if (Math.abs(at(k) - window.scrollY) > 2) go(k, 0.6);
  };
  // keyboard users tabbing through the steps see the stage follow their focus
  const onFocus = (e) => {
    const b = e.target.closest('.morph-step');
    if (b && b.matches(':focus-visible')) go(steps.indexOf(b));
  };
  ScrollTrigger.addEventListener('scrollEnd', snap);
  stage.addEventListener('focusin', onFocus);

  return () => {
    ScrollTrigger.removeEventListener('scrollEnd', snap);
    stage.removeEventListener('focusin', onFocus);
    morph.setMode(null);
  };
}
