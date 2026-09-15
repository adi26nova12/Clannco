/* Page intros.

   First visit in a session: the logo strokes draw themselves, the counter runs, then the preloader's
   background dissolves while its logo and wordmark fly into the nav logo's exact position (GSAP Flip).
   Later full page loads in the same session skip straight to the hero, as do page transitions, reduced
   motion and data-saver.

   In every case the hero stays hidden (html.hero-wait, set in each page's head script) until the display
   face has loaded. Before it arrives the headline renders in a much wider fallback font and is ~740 px
   taller; revealing it early made that reflow a visible layout shift — previously the page's entire CLS. */
import { gsap, SplitText, Flip } from './gsap-setup.js';
import { $, $$, rgb } from './env.js';

const SESSION_KEY = 'clannco:intro-seen';

/* "Hero settled" gate, one per page. Heavy work (compiling the WebGL hero's shaders) waits for it: on a
   fresh profile that compile stalled the main thread ~700 ms, exactly mid-intro. Capped so it can never
   hold anything back indefinitely. */
let settleHero = () => {};
let heroSettled = Promise.resolve();
export function resetHeroGate() {
  heroSettled = new Promise((resolve) => {
    settleHero = resolve;
    setTimeout(resolve, 4000);
  });
}
export const whenHeroSettled = () => heroSettled;

function displayFontReady(capMs) {
  const cap = new Promise((resolve) => setTimeout(resolve, capMs));
  if (!document.fonts || !document.fonts.load) return cap;
  return Promise.race([document.fonts.load('900 1em "Barlow Condensed"').catch(() => {}), cap]);
}

function revealHero() {
  $$('.hero .reveal').forEach((el) => {
    el.style.transition = 'none';
    el.classList.add('is-visible');
  });
  document.documentElement.classList.remove('hero-wait');
}

function introSeen() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}
function markIntroSeen() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* storage unavailable: intro may repeat */ }
}

export function runFirstIntro(cfg, reduce) {
  const pre = document.getElementById('preloader');
  const saveData = !!(navigator.connection && navigator.connection.saveData);

  if (!pre || reduce || saveData || !Flip || introSeen()) {
    if (pre) pre.style.display = 'none';
    displayFontReady(reduce ? 800 : 1600).then(() => {
      revealHero();
      if (reduce) settleHero();
      else heroIn(cfg.intro);
    });
    return;
  }

  markIntroSeen();
  const fontReady = displayFontReady(1600);
  Promise.all([cinematicPreloader(pre), fontReady]).then(() => {
    revealHero();
    heroIn(cfg.intro);
  });
}

// After a page transition: fonts are already cached, and the curtain is lifting as this runs.
export function runEnterIntro(cfg, reduce) {
  displayFontReady(reduce ? 400 : 900).then(() => {
    revealHero();
    if (reduce) settleHero();
    else heroIn(cfg.intro, 0.15);
  });
}

/* Resolves when the hero should start entering (just after the handoff begins). */
function cinematicPreloader(pre) {
  return new Promise((heroCue) => {
    const logo = pre.querySelector('.pre-logo');
    const word = pre.querySelector('.pre-word');
    const accent = word && word.querySelector('b');
    const bar = pre.querySelector('.pre-bar');
    const barFill = pre.querySelector('.pre-bar i');
    const count = pre.querySelector('.pre-count');
    const navMark = $('.nav .logo-mark');
    const navWord = $('.nav .logo > span:not(.logo-mark)');
    const [fr, fg, fb] = rgb('--forest', [13, 31, 23]);

    const strokes = logo ? Array.from(logo.querySelectorAll('path')) : [];
    strokes.forEach((p) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
    });

    const tl = gsap.timeline();
    const o = { v: 0 };
    tl.to(strokes, { strokeDashoffset: 0, duration: 0.55, ease: 'c-inout', stagger: 0.05 }, 0);
    const pinFill = logo && logo.querySelector('.logo-pin-fill');
    if (pinFill) tl.to(pinFill, { opacity: 1, duration: 0.2 }, 0.4);
    if (word) tl.from(word, { yPercent: 60, autoAlpha: 0, duration: 0.45, ease: 'c-expo' }, 0.1);
    tl.to(o, {
      v: 100, duration: 0.6, ease: 'power2.out',
      onUpdate: () => {
        const v = Math.round(o.v);
        if (barFill) barFill.style.width = v + '%';
        if (count) count.textContent = (v < 10 ? '0' : '') + v;
      },
    }, 0);

    tl.addLabel('handoff', 0.6);
    tl.add(() => pre.classList.add('is-handing-off'), 'handoff');
    const chrome = [bar, count].filter(Boolean);
    if (chrome.length) tl.to(chrome, { autoAlpha: 0, duration: 0.25 }, 'handoff');
    tl.to(pre, { backgroundColor: `rgba(${fr},${fg},${fb},0)`, duration: 0.55, ease: 'power2.inOut' }, 'handoff');

    // Fly an element onto its nav counterpart; the counterpart stays hidden until the landing.
    const fly = (el, dest) => {
      if (!el || !dest) return false;
      gsap.set(dest, { autoAlpha: 0 });
      tl.add(Flip.fit(el, dest, { duration: 0.72, ease: 'c-inout', scale: true }), 'handoff');
      return true;
    };
    if (!fly(logo, navMark) && logo) tl.to(logo, { autoAlpha: 0, duration: 0.3 }, 'handoff');
    if (fly(word, navWord)) {
      if (accent) tl.to(accent, { color: getComputedStyle(navWord).color, duration: 0.72, ease: 'c-inout' }, 'handoff');
    } else if (word) {
      tl.to(word, { autoAlpha: 0, duration: 0.3 }, 'handoff');
    }

    tl.add(() => heroCue(), 'handoff+=0.05');
    tl.add(() => {
      gsap.set([navMark, navWord].filter(Boolean), { clearProps: 'opacity,visibility' });
      pre.style.display = 'none';
    }, 'handoff+=0.74');
  });
}

function heroIn(sel, delay = 0) {
  const tl = gsap.timeline({ delay, defaults: { ease: 'power3.out' }, onComplete: () => settleHero() });
  const from = (target, vars, at) => {
    if ((typeof target === 'string' ? $(target) : target)) tl.from(target, vars, at);
  };

  from(sel.badge, { y: 24, autoAlpha: 0, duration: 0.7 }, 0);

  const h1 = $('.hero h1');
  const lines = h1 ? $$('.hl', h1) : [];
  if (lines.length) {
    // redesigned hero: each headline line rises letter by letter out of its mask; the last line runs backwards
    lines.forEach((line, i) => {
      const split = SplitText.create(line, { type: 'words,chars', wordsClass: 'split-word', mask: 'chars', aria: 'none' });
      tl.from(split.chars, {
        yPercent: 115, duration: 1.1, ease: 'c-expo',
        stagger: { each: 0.016, from: i === lines.length - 1 ? 'end' : 'start' },
        onComplete: () => split.revert(),
      }, 0.25 + i * 0.12);
    });
  } else if (h1) {
    const split = SplitText.create(h1, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
    tl.from(split.lines, {
      yPercent: 115, duration: 1, ease: 'c-expo', stagger: 0.09,
      onComplete: () => split.revert(),
    }, 0.3);
  }

  from(sel.lead, { y: 24, autoAlpha: 0, duration: 0.7 }, 0.7);
  from('.hero-actions .btn', { y: 20, autoAlpha: 0, duration: 0.6, stagger: 0.1 }, 1.0);
  from('.hero-note', { y: 14, autoAlpha: 0, duration: 0.5 }, 1.4);
  from(sel.card, { y: 54, autoAlpha: 0, duration: 1.05, ease: 'power4.out' }, 0.95);
}
