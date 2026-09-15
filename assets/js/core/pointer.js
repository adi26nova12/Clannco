/* Fine-pointer interactions: custom cursor, magnetic CTAs, hero tilt, card spotlight.
   Each returns a cleanup function; none reads layout on every mouse move. */
import { gsap } from './gsap-setup.js';
import { $, $$ } from './env.js';

const noop = () => {};

// Cached element rects go stale when the page scrolls under a stationary mouse.
function onScrollInvalidate(fn) {
  window.addEventListener('scroll', fn, { passive: true });
  return () => window.removeEventListener('scroll', fn);
}

export function initCursor(hoverSel) {
  const dot = document.createElement('div');
  const ring = document.createElement('div');
  dot.className = 'cursor-dot';
  ring.className = 'cursor-ring';
  document.body.append(dot, ring);
  document.body.classList.add('cursor-on');

  // quickSetter/quickTo ride GSAP's shared ticker — no dedicated animation loop
  const dotX = gsap.quickSetter(dot, 'x', 'px');
  const dotY = gsap.quickSetter(dot, 'y', 'px');
  const ringX = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' });
  const ringY = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });
  const ringS = gsap.quickTo(ring, 'scale', { duration: 0.25, ease: 'power3' });

  let started = false;
  const move = (e) => {
    dotX(e.clientX);
    dotY(e.clientY);
    if (!started) {
      started = true;
      ringX(e.clientX, e.clientX);
      ringY(e.clientY, e.clientY);
      document.body.classList.add('cursor-ready');
      return;
    }
    ringX(e.clientX);
    ringY(e.clientY);
  };
  const over = (e) => ring.classList.toggle('is-hover', !!(e.target.closest && e.target.closest(hoverSel)));
  const down = () => ringS(0.82);
  const up = () => ringS(1);

  window.addEventListener('mousemove', move, { passive: true });
  document.addEventListener('pointerover', over);
  window.addEventListener('mousedown', down);
  window.addEventListener('mouseup', up);

  return () => {
    window.removeEventListener('mousemove', move);
    document.removeEventListener('pointerover', over);
    window.removeEventListener('mousedown', down);
    window.removeEventListener('mouseup', up);
    gsap.killTweensOf([dot, ring]);
    dot.remove();
    ring.remove();
    document.body.classList.remove('cursor-on', 'cursor-ready');
  };
}

export function initMagnetic() {
  const els = $$('.magnetic');
  if (!els.length) return noop;
  const off = [];

  els.forEach((el) => {
    const label = el.querySelector('.btn-label') || el;
    let r = null;
    const enter = () => { r = el.getBoundingClientRect(); };
    const move = (e) => {
      if (!r) r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      gsap.to(el, { x: x * 0.3, y: y * 0.45, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
      gsap.to(label, { x: x * 0.15, y: y * 0.22, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
    };
    const leave = () => {
      r = null;
      gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1,0.4)', overwrite: 'auto' });
      gsap.to(label, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1,0.4)', overwrite: 'auto' });
    };
    el.addEventListener('mouseenter', enter);
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);
    off.push(() => {
      el.removeEventListener('mouseenter', enter);
      el.removeEventListener('mousemove', move);
      el.removeEventListener('mouseleave', leave);
    });
    off.push(onScrollInvalidate(() => { r = null; }));
  });

  return () => {
    off.forEach((fn) => fn());
    els.forEach((el) => {
      const label = el.querySelector('.btn-label');
      gsap.killTweensOf(label ? [el, label] : el);
      gsap.set(label ? [el, label] : el, { x: 0, y: 0 });
    });
  };
}

export function initTilt(t) {
  const host = t && $(t.host);
  const grid = t && $(t.grid);
  const card = t && $(t.card);
  const copy = t && $(t.copy);
  if (!host || !grid || !card || !copy) return noop;

  const prevPerspective = grid.style.perspective;
  grid.style.perspective = '1500px';

  const q = (el, prop, duration = 0.6) => gsap.quickTo(el, prop, { duration, ease: 'power3' });
  const rotY = q(card, 'rotationY');
  const rotX = q(card, 'rotationX');
  const copyX = q(copy, 'x', 0.9);
  const copyY = q(copy, 'y', 0.9);
  const layers = t.layers
    .map(([sel, depth]) => {
      const el = card.querySelector(sel);
      return el && { el, depth, x: q(el, 'x'), y: q(el, 'y') };
    })
    .filter(Boolean);

  let r = null;
  const enter = () => { r = host.getBoundingClientRect(); };
  const move = (e) => {
    if (!r) r = host.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width - 0.5;
    const my = (e.clientY - r.top) / r.height - 0.5;
    rotY(mx * 15); rotX(-my * 13); copyX(mx * 22); copyY(my * 14);
    layers.forEach((l) => { l.x(mx * l.depth); l.y(my * l.depth * 0.6); });
  };
  const leave = () => {
    r = null;
    rotY(0); rotX(0); copyX(0); copyY(0);
    layers.forEach((l) => { l.x(0); l.y(0); });
  };
  host.addEventListener('mouseenter', enter);
  host.addEventListener('mousemove', move);
  host.addEventListener('mouseleave', leave);
  const offScroll = onScrollInvalidate(() => { r = null; });

  return () => {
    host.removeEventListener('mouseenter', enter);
    host.removeEventListener('mousemove', move);
    host.removeEventListener('mouseleave', leave);
    offScroll();
    grid.style.perspective = prevPerspective;
    const targets = [card, copy, ...layers.map((l) => l.el)];
    gsap.killTweensOf(targets);
    gsap.set(card, { rotationX: 0, rotationY: 0 });
    gsap.set([copy, ...layers.map((l) => l.el)], { x: 0, y: 0 });
  };
}

/* A soft brass spotlight that follows the pointer across a card (colour lives in motion.css). */
export function initSpotlight(sel) {
  const cards = sel ? $$(sel) : [];
  if (!cards.length) return noop;
  const off = [];
  cards.forEach((card) => {
    let r = null;
    const enter = () => { r = card.getBoundingClientRect(); };
    const move = (e) => {
      if (!r) r = card.getBoundingClientRect();
      card.style.setProperty('--spot-x', (e.clientX - r.left).toFixed(1) + 'px');
      card.style.setProperty('--spot-y', (e.clientY - r.top).toFixed(1) + 'px');
    };
    const leave = () => {
      r = null;
      card.style.removeProperty('--spot-x');
      card.style.removeProperty('--spot-y');
    };
    card.addEventListener('mouseenter', enter);
    card.addEventListener('mousemove', move);
    card.addEventListener('mouseleave', leave);
    off.push(() => {
      card.removeEventListener('mouseenter', enter);
      card.removeEventListener('mousemove', move);
      card.removeEventListener('mouseleave', leave);
      leave();
    });
    off.push(onScrollInvalidate(() => { r = null; }));
  });
  return () => off.forEach((fn) => fn());
}
