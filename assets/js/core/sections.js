/* Section choreography for the redesign. Runs inside initPageMotion's matchMedia context, so every tween,
   ScrollTrigger and SplitText created here is reverted with the page (and when the viewport changes). */
import { gsap, ScrollTrigger, SplitText } from './gsap-setup.js';
import { $, $$ } from './env.js';

export function initSections(cfg, desktop) {
  heroExit();
  if (cfg.statement) statements(cfg, desktop);
  if (desktop && cfg.rail) rail(cfg.rail);
  footerMark();
  legalToc();
}

// the footer wordmark fills with brass as the page reaches its end
function footerMark() {
  const mark = $('.footer-mark');
  if (!mark) return;
  gsap.fromTo(mark, { '--fill': '0%' }, {
    '--fill': '100%', ease: 'none',
    // measured on the footer, whose bottom is the page's bottom, so the fill always completes
    scrollTrigger: { trigger: mark.closest('footer') || mark, start: 'top 85%', end: 'bottom bottom', scrub: 0.6 },
  });
}

// terms page: the contents list follows the section being read
function legalToc() {
  const links = $$('.legal-toc a');
  links.forEach((a) => {
    const section = $(a.getAttribute('href'));
    if (!section) return;
    ScrollTrigger.create({
      // just below the nav: a short section jumped to from the list is the one marked, not the next
      trigger: section, start: 'top 22%', end: 'bottom 22%',
      onToggle: (self) => {
        if (!self.isActive) return;
        links.forEach((l) => { l.classList.toggle('is-active', l === a); if (l === a) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current'); });
      },
    });
  });
}

// hero exit: the outlined line drifts left, the last line right, the brief panel lifts and fades
function heroExit() {
  const hero = $('.hero');
  if (!hero) return;
  const scrub = () => ({ trigger: hero, start: 'top top', end: 'bottom top', scrub: true });
  const l2 = $('.hero h1 .hl-2');
  const l3 = $('.hero h1 .hl-3');
  const panel = $('.hero-panel');
  if (l2) gsap.to(l2, { xPercent: -8, ease: 'none', scrollTrigger: scrub() });
  if (l3) gsap.to(l3, { xPercent: 6, ease: 'none', scrollTrigger: scrub() });
  // opacity, not autoAlpha: this is created while html.hero-wait still hides the hero, and autoAlpha would
  // record that hidden state as the start value — the panel then never appeared
  if (panel) gsap.to(panel, { yPercent: -16, opacity: 0.25, ease: 'none', scrollTrigger: scrub() });
}

// statement headlines light up word by word as they scroll through; pinned where the page asks for it
function statements(cfg, desktop) {
  $$(cfg.statement).forEach((h) => {
    const section = h.closest('section, .section') || h;
    const pin = desktop && cfg.statementPin && section.matches(cfg.statementPin);
    const split = SplitText.create(h, { type: 'words', wordsClass: 'fill-word' });
    const tl = gsap.timeline({
      scrollTrigger: pin
        // refreshPriority above the six-step pin (1): pins lower on the page must measure after this spacer exists
        ? { trigger: section, start: 'top top', end: '+=120%', pin: true, scrub: 0.6, anticipatePin: 1, refreshPriority: 3 }
        : { trigger: h, start: 'top 82%', end: 'bottom 38%', scrub: 0.6 },
    });
    tl.fromTo(split.words, { opacity: 0.14 }, { opacity: 1, stagger: 0.1, duration: 0.4, ease: 'none' });
    if (pin && cfg.statementCards) {
      const cards = $$(cfg.statementCards, section);
      if (cards.length) {
        tl.from(cards, { y: 80, autoAlpha: 0, clipPath: 'inset(0 0 100% 0)', stagger: 0.2, duration: 0.7, ease: 'c-out' }, '-=0.2');
      }
      tl.to({}, { duration: 0.6 }); // hold the finished state before the pin releases
    }
  });
}

// a pinned horizontal rail: vertical scroll moves the cards sideways, cards turn toward the centre
function rail({ section: sectionSel, track: trackSel, item }) {
  const section = $(sectionSel);
  const track = section && $(trackSel, section);
  if (!track) return;
  const cards = $$(item, track);
  const distance = () => {
    const left = track.parentElement.getBoundingClientRect().left;
    return Math.max(0, track.scrollWidth - (window.innerWidth - left * 2));
  };
  const turn = () => {
    const mid = window.innerWidth / 2;
    const rects = cards.map((c) => c.getBoundingClientRect()); // read everything first, then write
    rects.forEach((b, i) => {
      const d = gsap.utils.clamp(-1.4, 1.4, (b.left + b.width / 2 - mid) / mid);
      gsap.set(cards[i], { rotationY: d * -16, z: -Math.abs(d) * 110, transformPerspective: 1300, opacity: 1 - Math.min(0.4, Math.abs(d) * 0.3) });
    });
  };
  if (distance() <= 0) return;
  gsap.to(track, {
    x: () => -distance(),
    ease: 'none',
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => '+=' + distance(),
      pin: true,
      scrub: 0.8,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      refreshPriority: 2,
      onUpdate: turn,
      onRefresh: turn,
    },
  });
}
