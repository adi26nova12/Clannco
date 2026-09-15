/* Per-page selectors. The motion system is shared; only what it targets differs between the
   homepage and the automation pages. */

export const PAGES = {
  home: {
    // the segment rail track is excluded: sections.js animates it, and a reveal tween on the same element
    // would overwrite (kill) that animation along with its pin
    reveal: '.reveal:not(.hero-copy):not(.signal-card):not(.segment-grid), .intro-card, .leak-card, .engine-row, .plan, .smm-pillar, .ai-bot-card, .case-card, .stat-stack',
    headings: '.section-head h2, .intro h2, .smm-left h2, .ai-auto-left h2, .final-copy h2, .sticky-title h2, .faq-title h2',
    counters: '.stat-item strong, .metric strong, .outcome-num',
    parallax: [
      // foreground leads (negative), background drifts (positive) — yPercent of the element's height
      ['.eyebrow', -12], ['.intro-card-num', -20], ['.case-bubble', -26], ['.smm-quote', -20],
      ['.metric', -9], ['.stat-item', -9], ['.case-card', -14], ['.ai-bot-card', -12], ['.leak-card', -8],
      ['.device', 18], ['.engine-visual, .smm-phone, .smm-card', 15],
      ['.proof-figure, .case-figure, .engine-row', 12], ['.section-head p, .intro p, .smm-left p', 7],
      ['.marquee', 10],
    ],
    cursorHover: 'a, button, .faq-q, .leak-card, .plan, .engine-row, .metric, .segment-card',
    tilt: {
      host: '.hero', grid: '.hero-grid', card: '.signal-card', copy: '.hero-copy',
      layers: [['.search-card', 26], ['.metric-grid', 18], ['.map', 12], ['.signal-top', 8]],
    },
    spotlight: '.segment-card',
    intro: { badge: '.hero-copy .hero-badge', lead: '.hero-copy .lead', card: '.signal-card' },
    network: { mobileBoost: true },
    webglHero: true,
    morph: { sRMobile: 0.4, autoSpeed: 0.00008 },
    statement: '.diff-section h2',
    statementPin: '.diff-section',
    statementCards: '.diff-card p',
    rail: { section: '.segment-picker', track: '.segment-grid', item: '.segment-card' },
    // [section, particle formation, HUD label, placement override]
    scenes: [
      ['.hero', 'core', 'Hero'],
      ['.diff-section', 'network', 'Why Clannco'],
      ['.outcome-strip', 'pillars', 'Outcomes'],
      ['.segment-picker', 'network', 'Segments', { alpha: 0.35 }],
      ['.morph-stage', 'morph', 'The system'],
      ['.intro', 'grid', 'The gap'],
      ['.leaks', 'grid', 'Leaks', { alpha: 0.4 }],
      ['.engine', 'pillars', 'Growth systems', { x: -0.26, alpha: 0.55 }],
      ['.smm', 'conversation', 'Social'],
      ['.ai-auto', 'conversation', 'AI automation', { x: -0.2 }],
      ['.proof', 'funnel', 'Proof'],
      ['.pricing', 'funnel', 'How we work', { x: -0.26 }],
      ['.faq', 'calm', 'FAQ'],
      ['.final', 'core', 'Contact', { x: 0, y: 0, scale: 0.9, alpha: 0.5 }],
    ],
  },

  vertical: {
    reveal: '.reveal:not(.hero-copy):not(.chat-card), .svc-copy, .svc-visual, .faq-item, .quote-card',
    headings: '.services-intro-head h2, .pricing-head h2, .faq-head h2, .cta-copy h2, .svc-copy h2',
    counters: '.stat-box strong',
    parallax: [
      ['.flow-step', (i) => (i % 2 ? -10 : 10)],
      ['.eyebrow', -12], ['.service-card', -12], ['.metric', -9], ['.stat-item', -9],
      ['.faq-item', -7], ['.pricing-card', -12],
      ['.chat-card, .bot-card, .device', 16], ['.section-head p, .services-intro p', 7],
      ['.marquee', 10],
    ],
    cursorHover: 'a, button, .faq-q, .quote-card, .svc-visual, .price-chip, .platform-chip',
    tilt: {
      host: '.hero', grid: '.hero-inner', card: '.chat-card', copy: '.hero-copy',
      layers: [['.chat-msgs', 24], ['.chat-badge', 16], ['.chat-header', 9]],
    },
    spotlight: null,
    intro: { badge: '.hero-copy .hero-tag', lead: '.hero-lead', card: '.chat-card' },
    network: { mobileBoost: false },
    webglHero: false,
    morph: { sRMobile: 0.46, autoSpeed: 0.00006 },
    statement: '.statement h2',
    statementPin: null,
    statementCards: null,
    rail: null,
    scenes: [
      ['.hero', 'core', 'Hero'],
      ['.morph-stage', 'morph', 'What we automate'],
      ['.services-intro', 'network', 'What we build'],
      ['.svc-block', ['funnel', 'pillars', 'conversation', 'grid', 'network', 'pillars', 'funnel'],
        (el) => ((el.querySelector('.svc-label') || {}).textContent || 'Service').trim(), { alpha: 0.45 }],
      ['.focus-callout', 'core', 'Focus', { x: 0, scale: 0.8, alpha: 0.45 }],
      ['.statement', 'core', 'Why Clannco', { x: 0, y: 0, scale: 0.95, alpha: 0.55 }],
      ['.pricing-section', 'funnel', 'Pricing'],
      ['.faq-section', 'calm', 'FAQ'],
      ['.cta-section', 'core', 'Contact', { x: -0.24, alpha: 0.6 }],
    ],
  },
};

// the Terms page: the automation-page system without a hero instrument, pins or counters
PAGES.legal = {
  ...PAGES.vertical,
  reveal: '.reveal',
  headings: '.legal-body h2',
  counters: '[data-count-none]',
  parallax: [],
  tilt: null,
  intro: {},
  webglHero: false,
  statement: null,
  scenes: [
    ['.legal-hero', 'core', 'Terms', { x: 0.26, y: 0.05, scale: 0.6, alpha: 0.6 }],
    ['.legal-layout', 'calm', 'Terms'],
    ['.site-footer', 'network', 'Footer', { alpha: 0.35 }],
  ],
};
