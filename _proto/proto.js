/* Redesign prototype: persistent particle stage + HUD + first three sections. */
import { gsap, ScrollTrigger, SplitText } from '/assets/js/core/gsap-setup.js';
import { hasHardwareWebGL2, lowPower, MQ } from '/assets/js/core/env.js';
import { createStage } from './stage.js';

const params = new URLSearchParams(location.search);
const reduce = matchMedia(MQ.reduce).matches;
const mobile = matchMedia('(max-width: 900px)').matches;

// ---------- smooth scroll ----------
let lenis = null;
if (!reduce && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

// ---------- stage ----------
const stageEl = document.querySelector('.stage');
const want = params.get('stage');
let stage = null;
if (want !== 'off' && !reduce && (want === 'on' || hasHardwareWebGL2())) {
  try {
    stage = await createStage(stageEl, { count: mobile || lowPower ? 3500 : 12000, mobile });
  } catch (err) {
    console.warn('[proto] stage unavailable', err);
  }
}
if (!stage) stageEl.classList.add('is-poster');
window.__stage = stage;

// scene placement per section, in fractions of the visible world width/height
const SCENES = {
  core:    { x: mobile ? 0 : 0.24, y: mobile ? 0.12 : 0.1, scale: mobile ? 0.55 : 0.72, alpha: 1 },
  network: { x: 0, y: 0, scale: 1.1, alpha: 0.55 },
  pillars: { x: mobile ? 0 : 0.06, y: -0.04, scale: 0.9, alpha: 0.8 },
  calm:    { x: 0, y: 0, scale: 1.2, alpha: 0.35 },
};
const sections = [...document.querySelectorAll('[data-scene]')];

// ---------- HUD ----------
const rail = document.querySelector('.hud-rail');
const navNum = document.querySelector('.pnav-num');
const navLabel = document.querySelector('.pnav-label');
const ticks = sections.map((s, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-label', 'Go to ' + s.dataset.hud);
  b.addEventListener('click', () => (lenis ? lenis.scrollTo(s, { duration: 1.4 }) : s.scrollIntoView()));
  rail.appendChild(b);
  return b;
});
let current = -1;
const activate = (i) => {
  if (i === current) return;
  current = i;
  const s = sections[i];
  ticks.forEach((t, j) => t.classList.toggle('is-active', j === i));
  navNum.textContent = String(i + 1).padStart(2, '0');
  gsap.fromTo(navLabel, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.4, ease: 'c-out', onStart: () => { navLabel.textContent = s.dataset.hud; } });
  if (stage) stage.to(s.dataset.scene, SCENES[s.dataset.scene], { duration: reduce ? 0 : 1.8 });
};
sections.forEach((s, i) => {
  ScrollTrigger.create({ trigger: s, start: 'top 55%', end: 'bottom 55%', onToggle: (self) => self.isActive && activate(i) });
});
activate(0);
const clock = document.querySelector('.hud-clock');
setInterval(() => { clock.textContent = new Date().toTimeString().slice(0, 8); }, 1000);

// ---------- menu ----------
const menuBtn = document.querySelector('.pnav-menu');
const menu = document.getElementById('pmenu');
const setMenu = (open) => {
  menuBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    menu.hidden = false;
    lenis && lenis.stop();
    gsap.fromTo(menu, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.7, ease: 'c-inout' });
    gsap.from(menu.querySelectorAll('a'), { yPercent: 60, opacity: 0, stagger: 0.035, duration: 0.6, ease: 'c-out', delay: 0.2 });
  } else {
    gsap.to(menu, { clipPath: 'inset(0 0 100% 0)', duration: 0.5, ease: 'c-inout', onComplete: () => { menu.hidden = true; } });
    lenis && lenis.start();
  }
};
menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });

// ---------- motion ----------
await document.fonts.ready;
const mm = gsap.matchMedia();
mm.add({ motion: MQ.motionOK, desktop: '(min-width: 1101px) and (min-height: 700px)' }, (ctx) => {
  const { motion, desktop } = ctx.conditions;
  if (!motion) return;

  // hero entrance: each line rises out of its mask, panels draw in
  const lines = gsap.utils.toArray('.phero-h1 > span');
  const tl = gsap.timeline({ defaults: { ease: 'c-expo' } });
  lines.forEach((l, i) => {
    const split = SplitText.create(l, { type: 'words,chars', wordsClass: 'split-word', mask: 'chars', aria: 'none' });
    tl.from(split.chars, { yPercent: 110, duration: 1.2, stagger: { each: 0.018, from: i === 2 ? 'end' : 'start' } }, i * 0.14);
  });
  tl.from('.phero-badge', { opacity: 0, x: -20, duration: 0.8 }, 0.2)
    .from('.phero-panel', { opacity: 0, y: 30, clipPath: 'inset(0 0 100% 0)', duration: 1.1 }, 0.5)
    .from('.signal-card', { opacity: 0, rotateY: -50, x: 80, duration: 1.4 }, 0.4)
    .from('.rank-bar', { '--fill': 0, duration: 1.2, stagger: 0.12 }, 1)
    .from('.phero-cue', { opacity: 0, duration: 0.8 }, 1.1);

  // hero exit: outline line drifts, card tilts away
  gsap.to('.phero-l2', { xPercent: -8, ease: 'none', scrollTrigger: { trigger: '.phero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.phero-l3', { xPercent: 6, ease: 'none', scrollTrigger: { trigger: '.phero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.signal-card', { yPercent: -40, rotateY: -30, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.phero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.phero-cue i', { '--p': 1, ease: 'none', scrollTrigger: { trigger: '.phero', start: 'top top', end: 'bottom top', scrub: true } });
  if (desktop) {
    const card = document.querySelector('.signal-card');
    const rx = gsap.quickTo(card, 'rotateX', { duration: 0.8, ease: 'c-out' });
    const ry = gsap.quickTo(card, 'rotateY', { duration: 0.8, ease: 'c-out' });
    const move = (e) => { rx(4 - (e.clientY / innerHeight - 0.5) * 8); ry(-10 + (e.clientX / innerWidth - 0.5) * 14); };
    addEventListener('mousemove', move, { passive: true });
    ctx.add(() => () => removeEventListener('mousemove', move));
  }

  // why: headline fills word by word, cards rise — pinned on desktop
  const h2 = SplitText.create('.pwhy-h2', { type: 'words', wordsClass: 'word' });
  const why = gsap.timeline({
    scrollTrigger: desktop
      ? { trigger: '.pwhy', start: 'top top', end: '+=130%', pin: '.pwhy-pin', scrub: 0.6 }
      : { trigger: '.pwhy', start: 'top 70%', end: 'center 40%', scrub: 0.6 },
  });
  why.to(h2.words, { opacity: 1, stagger: 0.1, duration: 0.4, ease: 'none' })
    .from('.pwhy-card', { y: 80, opacity: 0, clipPath: 'inset(0 0 100% 0)', stagger: 0.2, duration: 0.7, ease: 'c-out' }, '-=0.2')
    .from('.pwhy .eyebrow', { opacity: 0, duration: 0.3 }, 0)
    .to({}, { duration: 0.6 }); // hold the finished state before the pin releases

  // outcomes: rows wipe in, numbers tick
  gsap.utils.toArray('.poutcome-item').forEach((row) => {
    const num = row.querySelector('.outcome-num');
    const t = gsap.timeline({ scrollTrigger: { trigger: row, start: 'top 85%' } });
    t.from(row, { '--line': 0, duration: 0.01 })
      .from(num, { yPercent: 40, opacity: 0, duration: 1.1, ease: 'c-expo' })
      .from(row.querySelector('.outcome-label'), { opacity: 0, x: 30, duration: 0.8, ease: 'c-out' }, '-=0.8');
    if (num.hasAttribute('data-count')) {
      const m = /^(\D*?)(\d+)(\D*)$/.exec(num.textContent);
      if (m && +m[2] > 0) {
        const o = { v: 0 };
        t.to(o, { v: +m[2], duration: 1.4, ease: 'c-out', snap: { v: 1 }, onUpdate: () => { num.textContent = m[1] + o.v + m[3]; } }, 0);
      }
    }
  });
});

addEventListener('load', () => ScrollTrigger.refresh());
window.__protoReady = true;
