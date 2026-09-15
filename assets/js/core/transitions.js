/* Page transitions (Barba).
   A forest curtain with a brass edge covers the page, the outgoing page is torn down, the head and page
   stylesheet are swapped, the incoming page is started, and the curtain lifts.

   Every link stays a real <a href> to a real URL, so crawlers and no-JS visitors are unaffected. Barba only
   enhances navigation, and any failure falls back to a normal page load. */
import { gsap, ScrollTrigger } from './gsap-setup.js';
import { MQ, pageFontsReady } from './env.js';
import { pauseScroll, resumeScroll, jumpTo } from './scroll.js';
import { syncChrome } from './ui.js';

// Where transitions run:
//   'automation' — only between pages under /automation/. Staged first rollout: a transition bug cannot
//                  reach the homepage, the main entry point. Widen to 'all' once verified in production.
//   'all'        — every internal page.
//   'off'        — normal page loads everywhere.
// Testing override on the first page of a visit: ?transitions=all|automation|off
const DEFAULT_SCOPE = 'automation';

const PAGE_STYLES = { home: '/assets/css/home.css', vertical: '/assets/css/vertical.css' };
const NAV_OFFSET = 80;

// Head tags that differ between pages. Crawlers fetch each URL directly and never see a swap; this keeps
// the live document honest for sharing, bookmarking and analytics after a transition.
const HEAD_TAGS = [
  'title', 'meta[name="description"]', 'meta[name="keywords"]', 'link[rel="canonical"]',
  'meta[property="og:url"]', 'meta[property="og:title"]', 'meta[property="og:description"]',
  'meta[name="twitter:title"]', 'meta[name="twitter:description"]', 'script[type="application/ld+json"]',
];

export function initTransitions({ onLeave, onEnter }) {
  const barba = window.barba;
  if (!barba) return false;
  const scope = new URLSearchParams(window.location.search).get('transitions') || DEFAULT_SCOPE;
  if (scope === 'off') return false;

  const reduce = () => window.matchMedia(MQ.reduce).matches;
  const curtain = createCurtain();
  const announcer = createAnnouncer();
  const positions = new Map(); // url → scroll position, restored on back/forward

  const allowed = (el, href) => {
    if (!el || el.hasAttribute('data-barba-prevent') || el.getAttribute('target') === '_blank' || el.hasAttribute('download')) return false;
    let url;
    try { url = new URL(href, window.location.href); } catch { return false; }
    if (url.origin !== window.location.origin) return false;
    if (!/^\/(automation\/[\w-]*)?$/.test(url.pathname)) return false; // known page shapes only
    if (url.pathname === window.location.pathname) return false;        // same page: anchors scroll in place
    if (scope === 'all') return true;
    return window.location.pathname.startsWith('/automation/') && url.pathname.startsWith('/automation/');
  };

  const fail = (url, err) => {
    console.error('[clannco] Page transition failed; loading the page normally.', err);
    window.location.assign(url);
  };

  barba.init({
    timeout: 6000,
    prevent: ({ el, href }) => !allowed(el, href),
    requestError: (trigger, action, url) => {
      window.location.assign(url);
      return false;
    },
    transitions: [{
      name: 'curtain',
      async leave(data) {
        try {
          positions.set(data.current.url.href, window.scrollY);
          if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
          document.body.setAttribute('aria-busy', 'true');
          pauseScroll();
          await cover(curtain, reduce());
          onLeave();
        } catch (err) {
          fail(data.next.url.href, err);
        }
      },
      async enter(data) {
        const { next, current, trigger } = data;
        try {
          // the outgoing container can still be in the DOM here; hide it so it adds no height
          if (current.container && current.container.isConnected) current.container.style.display = 'none';
          syncHead(next.html);
          document.body.dataset.page = next.namespace;
          await swapPageStylesheet(next.namespace);

          const fromHistory = trigger === 'back' || trigger === 'forward' || trigger === 'popstate';
          const restoreY = fromHistory ? positions.get(next.url.href) : undefined;
          // Barba drops the #fragment from the URL it navigates to, so read it from the clicked link.
          const hash = linkHash(trigger) || (next.url.hash ? '#' + String(next.url.hash).replace(/^#/, '') : '');

          jumpTo(0);
          onEnter(next.container, next.namespace);
          // The incoming page may need font weights the previous page never used. Until they load, headings
          // render in a much taller fallback and positions measured now go stale (an anchor landed 3,469 px
          // off). Force a layout pass so those faces are requested, then wait while the curtain still covers.
          void document.body.offsetHeight;
          await pageFontsReady(900);
          ScrollTrigger.refresh();

          let hashTarget = null;
          if (restoreY != null) {
            jumpTo(restoreY);
          } else if (hash) {
            try { hashTarget = next.container.querySelector(hash); } catch { hashTarget = null; }
            if (hashTarget) {
              jumpTo(targetY(hashTarget));
              // restore the fragment in the address bar, keeping Barba's own history state
              window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + hash);
            }
          }
          syncChrome();

          await reveal(curtain, reduce());
          resumeScroll();
          document.body.removeAttribute('aria-busy');
          focusAndAnnounce(next.container, announcer, hashTarget);

          // Any font that finishes after the cap reflows the page. Re-measure, and if the visitor was sent to
          // a section and has not scrolled since, put them back on it.
          const landedY = window.scrollY;
          if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
              ScrollTrigger.refresh();
              if (hashTarget && hashTarget.isConnected && Math.abs(window.scrollY - landedY) < 2) jumpTo(targetY(hashTarget));
            });
          }
        } catch (err) {
          fail(next.url.href, err);
        }
      },
    }],
  });
  return true;
}

function targetY(el) {
  return el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
}

function linkHash(trigger) {
  if (!trigger || trigger.nodeType !== 1 || !trigger.getAttribute('href')) return '';
  try {
    return new URL(trigger.getAttribute('href'), window.location.href).hash;
  } catch {
    return '';
  }
}

function syncHead(html) {
  const incoming = new DOMParser().parseFromString(html, 'text/html').head;
  for (const sel of HEAD_TAGS) {
    const now = Array.from(document.head.querySelectorAll(sel));
    const next = Array.from(incoming.querySelectorAll(sel));
    const anchor = now[0] || document.head.querySelector('link[rel="preconnect"]');
    next.forEach((node) => {
      const clone = document.importNode(node, true);
      if (anchor) anchor.before(clone);
      else document.head.appendChild(clone);
    });
    now.forEach((node) => node.remove());
  }
}

// The homepage and automation pages style shared class names differently, so exactly one page stylesheet
// may be active. The new one is loaded before the old one is removed, while the curtain covers the page.
function swapPageStylesheet(namespace) {
  const href = PAGE_STYLES[namespace];
  const current = document.head.querySelector('link[data-page-css]');
  if (!href || !current || current.getAttribute('href') === href) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-page-css', '');
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      current.remove();
      resolve();
    };
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', done, { once: true });
    setTimeout(done, 4000);
    current.after(link);
  });
}

function createCurtain() {
  const el = document.createElement('div');
  el.className = 'page-curtain';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span class="page-curtain-edge"></span>';
  document.body.appendChild(el);
  return el;
}

function cover(el, instant) {
  const edge = el.firstElementChild;
  gsap.killTweensOf([el, edge]);
  el.classList.add('is-active');
  if (instant) {
    gsap.set(el, { clipPath: 'inset(0% 0% 0% 0%)' });
    return Promise.resolve();
  }
  return gsap.timeline()
    .fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.55, ease: 'c-inout' }, 0)
    .fromTo(edge, { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: 0.5, ease: 'c-out' }, 0.1)
    .then();
}

function reveal(el, instant) {
  const edge = el.firstElementChild;
  if (instant) {
    gsap.set(el, { clipPath: 'inset(0% 0% 100% 0%)' });
    el.classList.remove('is-active');
    return Promise.resolve();
  }
  return gsap.timeline({ onComplete: () => el.classList.remove('is-active') })
    .to(edge, { scaleX: 0, transformOrigin: 'right center', duration: 0.35, ease: 'c-inout' }, 0)
    .to(el, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.6, ease: 'c-inout' }, 0.1)
    .then();
}

function createAnnouncer() {
  const el = document.createElement('div');
  el.className = 'sr-only';
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  document.body.appendChild(el);
  return el;
}

// Barba does not move focus. Keyboard and screen-reader users are sent to the new page's heading (or the
// linked section) and told which page loaded.
function focusAndAnnounce(container, announcer, hashTarget) {
  const target = hashTarget || container.querySelector('h1');
  if (target) {
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
  announcer.textContent = '';
  setTimeout(() => { announcer.textContent = 'Page loaded: ' + document.title; }, 60);
}
