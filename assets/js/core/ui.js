/* Interface behaviour that must work with or without the motion system.
   Per page: nav dropdown, mobile menu, FAQ accordion, floating CTA — listeners take an AbortSignal so a
   page transition can release all of them at once.
   For the whole visit: scroll-progress bar and the scrolled-nav state. */
import { $, $$, MQ, clamp } from './env.js';

export function initUI(gsap, { signal } = {}) {
  // The automation-page contact forms call this from an inline onsubmit, so it must exist even if
  // the motion system never starts.
  window.handleSubmit = handleSubmit;
  initDropdown(signal);
  initMobileNav(signal);
  initFaq(gsap, signal);
}

function handleSubmit() {
  const btn = $('#submitBtn');
  if (btn) {
    btn.textContent = 'Sending…';
    btn.disabled = true;
  }
  return true;
}

function initDropdown(signal) {
  const dd = $('#navAutoDropdown');
  const btn = $('#navAutoBtn');
  if (!dd || !btn) return;
  const set = (open) => {
    dd.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    set(!dd.classList.contains('open'));
  }, { signal });
  document.addEventListener('click', (e) => {
    if (!dd.contains(e.target)) set(false);
  }, { signal });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dd.classList.contains('open')) {
      set(false);
      btn.focus();
    }
  }, { signal });
}

function initMobileNav(signal) {
  const autoDrop = $('#mobileAutoDrop');
  const autoBtn = $('#mobileAutoBtn');
  if (autoDrop && autoBtn) {
    autoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      autoBtn.setAttribute('aria-expanded', String(autoDrop.classList.toggle('open')));
    }, { signal });
  }

  const btn = $('#menuBtn');
  const menu = $('#mobileMenu');
  if (!btn || !menu) return;
  const set = (open) => {
    menu.classList.toggle('open', open);
    btn.textContent = open ? '×' : '☰';
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.setAttribute('aria-controls', menu.id);
  btn.setAttribute('aria-expanded', String(menu.classList.contains('open')));
  btn.addEventListener('click', () => set(!menu.classList.contains('open')), { signal });
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => set(false), { signal }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('open')) {
      set(false);
      btn.focus();
    }
  }, { signal });
}

/* FAQ: GSAP animates to the answer's real height, so long answers are never clipped by a
   max-height guess. Without GSAP (or with reduced motion) the class toggles instantly. */
function initFaq(gsap, signal) {
  const items = $$('.faq-item');
  if (!items.length) return;

  const setOpen = (item, open) => {
    const q = item.querySelector('.faq-q');
    const a = item.querySelector('.faq-a');
    q.setAttribute('aria-expanded', String(open));
    if (!gsap || window.matchMedia(MQ.reduce).matches) {
      item.classList.toggle('open', open);
      return;
    }
    gsap.killTweensOf(a);
    const done = () => window.ScrollTrigger && window.ScrollTrigger.refresh();
    if (open) {
      item.classList.add('open');
      gsap.from(a, {
        height: 0, paddingTop: 0, paddingBottom: 0, duration: 0.45, ease: 'c-out',
        clearProps: 'height,paddingTop,paddingBottom', onComplete: done,
      });
    } else {
      // pin the current box inline, then drop the class so only the tween controls the collapse
      const cs = getComputedStyle(a);
      gsap.set(a, { height: a.offsetHeight, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom });
      item.classList.remove('open');
      gsap.to(a, {
        height: 0, paddingTop: 0, paddingBottom: 0, duration: 0.35, ease: 'c-inout',
        clearProps: 'height,paddingTop,paddingBottom', onComplete: done,
      });
    }
  };

  items.forEach((item, k) => {
    const q = item.querySelector('.faq-q');
    const a = item.querySelector('.faq-a');
    if (!q || !a) return;
    if (!a.id) a.id = 'faq-answer-' + (k + 1);
    q.setAttribute('aria-controls', a.id);
    q.setAttribute('aria-expanded', String(item.classList.contains('open')));
    q.addEventListener('click', () => {
      const open = !item.classList.contains('open');
      items.forEach((o) => { if (o !== item && o.classList.contains('open')) setOpen(o, false); });
      setOpen(item, open);
    }, { signal });
  });
}

/* ---- visit-wide chrome: progress bar + scrolled nav ---- */

let navEl = null;
let progressEl = null;
let chromeTrigger = null;

const applyChrome = (y, p) => {
  if (navEl) navEl.classList.toggle('scrolled', y > 26);
  if (progressEl) progressEl.style.transform = 'scaleX(' + p + ')';
};

export function initGlobalChrome(ScrollTrigger) {
  progressEl = document.getElementById('scrollProgress');
  if (ScrollTrigger) {
    // ScrollTrigger moves the scroll position while it re-measures during a refresh; ignore updates
    // from that window and re-sync from the real position once it has finished.
    chromeTrigger = ScrollTrigger.create({
      id: 'global:chrome',
      start: 0,
      end: 'max',
      onUpdate: (self) => { if (!ScrollTrigger.isRefreshing) applyChrome(window.scrollY, self.progress); },
    });
    ScrollTrigger.addEventListener('refresh', syncChrome);
  } else {
    window.addEventListener('scroll', syncChrome, { passive: true });
  }
  syncChrome();
}

// The nav belongs to the page and is replaced on every transition, so it is looked up again here.
export function syncChrome() {
  navEl = $('.nav') || document.querySelector('.nav');
  if (chromeTrigger) {
    const range = chromeTrigger.end - chromeTrigger.start;
    applyChrome(window.scrollY, range > 0 ? clamp((window.scrollY - chromeTrigger.start) / range, 0, 1) : 0);
  } else {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    applyChrome(window.scrollY, h > 0 ? Math.min(1, window.scrollY / h) : 0);
  }
}

/* ---- per page: hide the floating CTA while the contact form is on screen ---- */
export function initPageChrome(ScrollTrigger) {
  const fab = $('.float-cta');
  const contact = $('#contact');
  if (!ScrollTrigger || !fab || !contact) return () => {};
  const st = ScrollTrigger.create({
    trigger: contact, start: 'top 88%', end: 'bottom top',
    toggleClass: { targets: fab, className: 'is-hidden' },
  });
  return () => st.kill();
}
