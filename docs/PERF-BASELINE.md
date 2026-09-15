# Performance baseline

Recorded at the end of each phase so regressions show up as a diff.

## Phase 0 — correctness & hygiene (no visual change)

### Payload

| | before | after | delta |
|---|---|---|---|
| `index.html` | 161,065 B | 135,703 B | **−25,362 B (−15.7%)** |
| `automation/index.html` | 131,514 B | 119,744 B | −11,770 B (−9.0%) |
| each vertical page (×6) | ~123,4xx B | ~111,5xx B | ~−11,870 B each |
| **all 8 pages** | 1,031,865 B | 923,495 B | **−108,370 B (−10.5%)** |
| total lines | 23,893 | 22,270 | −1,623 |

Inline CSS on the homepage: 2,268 → 2,001 lines (63,815 → 54,630 B).
Automation pages: 1,565 → 1,541 lines (45,136 → 43,054 B) — still byte-identical
across all seven, so the Phase 1 single-extraction assumption still holds.

### Requests

Third-party origins on the critical path: **4 → 2**.
Removed `cdnjs.cloudflare.com` and `unpkg.com` (3 render-path scripts) by self-hosting.
Remaining: `fonts.googleapis.com` + `fonts.gstatic.com`.

Google Fonts weight/family combinations: **17 → 8**
(Barlow 400/600/800, Barlow Condensed 700/900, JetBrains Mono 400/700/800 —
chosen from measured `getComputedStyle` usage across both page types, so no visual change.)

### Runtime (measured in-browser, 1440×900)

| page | GSAP | ScrollTriggers | reveals | preloader | console |
|---|---|---|---|---|---|
| `/index.html` | 3.13.0 | 108 | 49 | hidden | clean |
| `/automation/index.html` | 3.13.0 | 89 | 42 | hidden | clean |
| 6 vertical pages | 3.13.0 | 77 | 37 | hidden | clean |

**108 ScrollTriggers on the homepage** confirms the parallax bloat the plan estimated
at ~120. Phase 2 target: ≤25.

### Forced layout removed

Two per-frame `getBoundingClientRect()` calls eliminated on all 8 pages:

1. `bg3d` `frame()` called `onScroll()` every frame while a passive scroll listener
   already kept `prog` fresh — pure redundancy.
2. The morph `scrollProg()` read `getBoundingClientRect()` **and** `offsetHeight` every
   frame, immediately before 1500 `ctx.arc()` calls. Now reads cached `secTop`/`secH`,
   re-measured only on resize.

Still outstanding for Phase 2: three concurrent rAF loops (cursor loop is uncancelled
and un-gated), 1500-particle `ctx.arc` draw, O(N²) `bg3d` link pass.

### Not yet measured

LCP / CLS / INP / TBT and Lighthouse scores need a deployed or production-like build —
the local `python -m http.server` has no compression and no HTTP/2, so lab numbers here
would not be comparable to Netlify. Capture these at the end of Phase 1, when the CSS/JS
extraction makes the payload shape final.

## Phase 1 — extraction + token layer

### Structure

```
assets/css/clannco.css   token layer only (spacing, type, z-index, duration, easing scales) — additive
assets/css/home.css      homepage stylesheet, verbatim
assets/css/vertical.css  automation stylesheet, verbatim — shared by all 7 automation pages
assets/js/home.js        homepage scripts, verbatim
assets/js/vertical.js    automation scripts, verbatim — shared by all 7 automation pages
```

Every inline `<style>` and body `<script>` block is gone. Each page keeps one 2-line head script
(`has-js`), which must run before first paint. Each original `<script>` block is wrapped in its own
`try/catch` that rethrows asynchronously, so a failure in one still cannot stop the others — the
same isolation separate `<script>` elements gave.

### Payload (brotli q11 unless noted)

| | before (inline) | after | |
|---|---|---|---|
| homepage HTML | 135.7 KB raw | 53.1 KB raw | −61% |
| each vertical HTML | ~111 KB raw | ~43 KB raw | −61% |
| all 8 HTML documents | 128.6 KB | 76.4 KB | **−40.6%** |
| whole session (home + all 7 verticals) | 128.6 KB | 108.5 KB | **−15.6%** |

Shared assets: `clannco.css` 1.0 KB · `home.css` 9.7 KB · `vertical.css` 7.7 KB · `home.js` 7.2 KB ·
`vertical.js` 6.5 KB.

Honest reading: a **first visit to one page** gains nothing — the same bytes arrive, over ~4 more
requests (HTTP/2 multiplexes them). The win is every navigation after that: a vertical page now
costs only its ~11 KB-gzip HTML, where it previously re-downloaded ~43 KB of CSS+JS inline.

### Verification — computed-style diff

Harness snapshotted 50 computed properties + `::before`/`::after` on every element (523–611 per
page), hashed, at **1440×900 and 390×844 (mobile emulation) for all 8 pages** = 16 page states.
A clean reload of the unchanged page produced 0 diffs, establishing the harness is deterministic.

| result | pages |
|---|---|
| **0 diffs** | homepage at both sizes (desktop re-checked against a reference build with CSS re-inlined — 0 of 587) |
| 2–3 diffs, all CSS keyframe animations caught mid-cycle (`pulse`, `pulse-green`, `fill-bar`) | 7 automation pages at both sizes |

The first homepage-desktop baseline was captured in a page state that did not reproduce (the
reference build, extracted build and a fresh environment all agreed with each other, not with it);
it was replaced by the reference-build snapshot and the full-page comparison repeated.

Runtime: GSAP 3.13.0, motion initialised, preloader hidden, ScrollTrigger counts unchanged
(108 / 89 / 77), nav dropdown + outside-click close, FAQ accordion, form handlers wired, all
`/assets/` requests 200/304 from both `/` and `/automation/`, clean console.

### Deviations from the plan, with reasons

1. **No deduplicated shared CSS yet.** Measured: only 90 of 373 homepage rules (9.5 KB of 54.6 KB,
   17%) are byte-identical with the automation CSS, and they are interleaved with page-specific
   rules in both files. Hoisting them into an earlier shared file reorders the cascade for ~2 KB
   brotli. Dedup belongs in Phase 5, when rules are being rewritten onto tokens anyway.
2. **Classic scripts, not ES modules yet.** Phase 2 rewrites most of this JS (motion, cursor,
   magnetic, morph). Porting it to modules now would do that work twice. `type="module"`,
   `modulepreload` and the import map arrive with Phase 2/3, where `import()` is first needed.
3. **Logo SVG stays inline.** It is coloured by descendant selectors (`.logo-mark .logo-c`,
   `.pre-logo .logo-pin-fill`), which cannot reach inside an external `<use>` reference.
4. **No inline critical CSS.** Stylesheets in `<head>` are render-blocking, so there is no flash;
   a duplicated `:root` block would be a second source of truth for the palette.
5. **No long cache headers on `/assets/css` or `/assets/js`.** The filenames are not versioned, so a
   week-long `max-age` would serve stale styles after a deploy. Netlify's default revalidation applies.
   Only the version-stamped vendor files are `immutable`.

### Known follow-up

The `--z-*` ladder in `clannco.css` does not yet match the values actually in use
(`200, 800, 801, 998, 999, 1000, 1002, 10000, 10001`). It is unused today, so harmless; reconcile it
before any Phase 5 migration onto it.

## Phase 2 — motion system rebuild

### What changed

- `assets/js/home.js` + `vertical.js` (classic scripts, three hand-written rAF loops) replaced by ES modules:
  `app.js` → `core/{env,gsap-setup,config,ui,scroll,pointer,intro,motion,main}.js` + `scenes/{network,morph}.js`.
  One `gsap.matchMedia()` owns everything that depends on viewport, pointer or reduced motion.
- GSAP plugins added: SplitText 3.13.0, CustomEase 3.13.0 (self-hosted).
- `assets/css/motion.css` (loaded after the page stylesheet); reveal base layer in `home.css`/`vertical.css`
  gated under `.has-js`; `scroll-behavior:smooth` removed from both page stylesheets (see bug 5).
- Morph centrepiece: CSS `sticky` + `380vh` → ScrollTrigger pin with directional snap, keyboard focus-follow,
  `aria-current` on the active step; rendering via two pre-tinted sprites instead of a path per particle;
  particle count 1500 → 900 desktop, 950 → 550 compact, 400 low-power; **rainbow palette → brass ramp**.
- Parallax: ~49 per-element scrubbed ScrollTriggers → **one** trigger computing each element's own range
  from positions cached on refresh.
- JetBrains Mono 900 added to the font request (it was the most-used mono weight but was being faux-bolded).
- Homepage step labels re-staged as two layers of one system — see `docs/phase2-copy-changes.md`.

### ScrollTriggers

| page | before | after (load) | after full scroll | scrubbed |
|---|---|---|---|---|
| homepage | 108 | **64** | 53 | 49 → **0** |
| automation index | 89 | — | — | — |
| each vertical | 77 | **50** | — | → **0** |

Reduced motion: **2** (nav/progress + floating CTA only).

### Frame scheduling

No code in this repo calls `requestAnimationFrame` any more. Measured callers over a full desktop session:
GSAP ticker, ScrollTrigger's own scroll batching, and Lenis (6 calls). Cursor, particle network and morph all
run on the GSAP ticker, and the two canvases only while on screen. (An `inline-html` count equal to the sum of
the others is the instrumentation wrapper being injected twice by the test driver, not a caller.)

Layout reads while scrolling ~4,500 px and moving the mouse over the hero: **8 total** (one-time SplitText
measurement as headlines enter, cached rects on pointer-enter) — none per frame, none per mouse move.

### Load — Phase 1 vs Phase 2, same machine, cache disabled, 3 interleaved runs (medians)

| | Phase 1 | Phase 2 |
|---|---|---|
| DOMContentLoaded | 357 ms | 256 ms |
| load | 650 ms | 733 ms |
| LCP | 368 ms | 360 ms |
| CLS | 0.2346 | 0.2347 |
| blocking time (approx) | 40 ms | 52 ms (per-run spread 13–79) |
| requests | 9 | 23 |

LCP and CLS unchanged; blocking time within noise. The later `load` is 14 extra requests (12 modules + 2 plugins)
fetched one at a time by the local Python HTTP/1.0 server — a worst case, not what HTTP/2 on Netlify does.

### Verification (headless Chromium via the browser-automation skill)

| check | result |
|---|---|
| intro | preloader gone, hero headline visible, 0 SplitText wrappers left behind |
| pin | step positions exact to the pixel (e.g. step 2 → `4643`, caption 2 active, stage `position:fixed`) |
| snap | from 2.5 scrolling down → step 3 exactly; from 1.3 scrolling up → step 1 exactly |
| step click | step 05 → exact position, caption 4 |
| full scroll | 0 of 47 reveals and 0 of 9 headlines left hidden; counters `30+`, `7s`, `3`; `24/7` and `5–7` intact |
| FAQ | opens to real height, closes the other item, `aria-expanded` correct, no inline styles left |
| mobile (real touch context) | no pin, no parallax, no cursor, step tap works, tallest answer 288 px fully visible |
| reduced motion on load | 2 triggers, everything visible without scrolling, morph held still with a drawn frame |
| reduced motion toggled mid-session | pin, Lenis and cursor torn down live; rebuilt when toggled back |
| failsafe (`app.js` blocked) | `has-js` removed, preloader hidden, 0 reveals hidden |
| anchor links | glide smoothly, land exactly 80 px above target, focus moves to target |
| spotlight | follows the pointer across segment cards |
| console | clean on every run |

### Bugs found and fixed during Phase 2

1. **Counters mangled non-numeric values.** The old parser rendered `24/7` as `24/` and `5–7` as `5–` once they counted.
2. **Homepage FAQ answers clipped on mobile.** `max-height:180px`; at 390 px wide 3 of 7 answers are taller (182, 238, 264 px).
3. **Marquee velocity skew never showed.** It was applied to an element whose CSS keyframe animation overrode the inline transform.
4. **Nav lost its scrolled state** after any ScrollTrigger refresh while the page was scrolled (refresh-time updates now ignored and re-synced).
5. **CSS `scroll-behavior:smooth` fought Lenis.** ScrollTrigger reads the root's scroll-behavior once and re-applies it
   inline after every refresh, turning Lenis's per-frame scrolling and ScrollTrigger's position restores into native
   smooth-scroll animations. Removed at the source; in-page links are smoothed in JS instead.
6. **Regression introduced and fixed in this phase:** `window.handleSubmit` (called by the automation-page forms'
   inline `onsubmit`) was not ported at first; restored in `ui.js`, which runs even if motion fails.
7. **No-JS content was invisible.** The reveal base layer hid content unconditionally; it is now gated under `.has-js`.

### Deviations from the plan

- **Morph is pinned on all 8 pages, not just the homepage.** The section and its scroll-driven canvas already ran on every
  automation page; pinning it is cheaper than the old sticky version, and stripping the scroll-telling there would have
  been a visible downgrade.
- **No hide-on-scroll nav.** Kept the nav and its BOOK A CALL button always visible — this is a lead-gen site.
- **Reveals use `y` + opacity, not `clipPath`.** Clipping cuts card shadows while animating.
- **Parallax uses one page-level trigger, not one per section.** Section-level ranges shift elements away from centre and
  risk cards overlapping; per-element ranges from cached positions keep the original motion exactly.

### Known follow-ups (not caused by this phase)

- **CLS 0.23** comes from one shift ~1 s after load in the hero: `.signal-card` grows from 136 px to 464 px tall. Measured
  identically in Phase 1. Fails the ≤ 0.05 budget; fix belongs with the hero work in Phase 3.
- On desktop the morph ring's radius lets particles cross the step rail on the right. Unchanged geometry from before.
- The `--z-*` ladder in `clannco.css` still needs reconciling with the values in use before any migration onto it.

## Phase 3 — WebGL hero + layout-shift fix

### Hero tiers

| tier | where | what |
|---|---|---|
| canvas (2D) | every device with motion allowed; all automation pages | the existing particle network — also the placeholder while WebGL loads |
| WebGL (three.js r169) | homepage only · desktop · fine pointer · motion allowed · not low-power · **hardware** WebGL2 | 150 linked nodes + 6,000 dust particles + cursor glow, palette read from the CSS tokens |
| none | reduced motion | static page |

The WebGL scene loads in `requestIdleCallback`, compiles its shaders and draws one frame off-screen, then cross-fades
in over 0.6 s; the 2D canvas is then disposed. `hasHardwareWebGL2()` rejects software renderers (SwiftShader,
llvmpipe) via `failIfMajorPerformanceCaveat` and the unmasked renderer string — on those the canvas is cheaper.

Testing overrides: `?hero=webgl` forces the WebGL tier, `?hero=canvas` forces the 2D tier. Automation pages ignore
`?hero=webgl` (`webglHero: false`).

### Payload

three.js `three.module.min.js`: 671 KB raw · 166 KB gzip · **135 KB brotli**, self-hosted, fetched by dynamic
`import()` only when the WebGL tier is chosen — zero bytes on mobile, low-power devices, reduced motion, software GL
and every automation page (verified: not requested on `/automation/real-estate.html?hero=webgl`). Scene code ≈ 5 KB.

### Frame cost — Intel UHD Graphics (ANGLE / Direct3D11), headless Chromium, 1440×900, cursor moving, 4 s, two runs each

| | canvas tier | WebGL tier |
|---|---|---|
| frame rate | 96.5 / 98.8 fps | **144 / 144.3 fps** (full refresh) |
| frame time p50 | 7.2 ms | 6.9 ms |
| frame time p95 | 14.1 ms | **7.2 ms** |
| frame time p99 | 20.7 / 14.8 ms | **7.6 ms** |
| worst frame | 48.6 / 20.8 ms | 13.9 / 14.0 ms |
| frames > 20 ms | 4 / 2 | **0 / 0** |
| blocking time incl. load | 103 / 0 ms | 33 / 46 ms |

**Ship gate (plan): > 150 ms blocking time or failing to hold 60 fps on Intel UHD ⇒ ship canvas only. Passed.**
The WebGL tier is smoother than the canvas tier it replaces: the canvas draws every line and dot on the CPU each
frame; WebGL moves that to the GPU. Caveat: headless measurement on one GPU model, not a visible window across a
range of hardware.

### Design notes

- Same projection as the canvas version (focal length 820 CSS px, 1 world unit = 1 px at z = 0), so nodes sit where
  the canvas would have drawn them.
- Links are chosen once by 3D proximity (480 candidates, ≤ 6 per node). Each line vertex also receives its link's
  other endpoint, so the vertex shader measures the **projected** length and applies the canvas version's on-screen
  falloff (gone beyond ~116 px). Without this, pairs close in 3D but near the camera drew long lines across the headline.
- Palette uniforms are 0–1 sRGB vectors, not `THREE.Color` (which converts to linear), and the shaders write straight
  to the canvas — so colours match the tokens exactly. Additive blending is set up so the canvas stays valid
  premultiplied alpha, matching the canvas version's `lighter` compositing.
- Point size capped at 18 px and pixel ratio at 1.5 (1 on low-power), backing store ≤ 2560 px wide — bounds fill cost.
- The cursor glow follows the cursor only. The canvas version added its ever-growing auto-rotation to the glow
  position, which slowly walked the glow off screen.

### Fallbacks — verified

| scenario | result |
|---|---|
| GPU context lost (`WEBGL_lose_context`) | WebGL disposed, canvas tier restored at full opacity |
| reduced motion switched on mid-session | both tiers torn down |
| reduced motion switched back off | WebGL tier rebuilt |
| automation page with `?hero=webgl` | canvas tier; three.js never requested |
| console | clean in every scenario |

### Layout shift — fixed

**CLS 0.2346 → 0.0016** on the homepage (automation page 0.0005, reduced motion 0.0007, failsafe 0.0011).

Root cause, measured: until Barlow Condensed arrives the hero headline renders in a much wider fallback font and wraps
onto more lines — **1,919 px tall, then 1,181 px** once the font swaps in (~710 ms). The hero loses 738 px of height and
the vertically centred operations card moves up 369 px. It only counted because the intro marked the hero visible at
~290 ms, *before* the font arrived: with fonts blocked CLS was 0, and with `app.js` blocked (hero still invisible
during the swap) it was 0.0011 — the Layout Instability API ignores shifts of invisible elements.

Fix: `html.hero-wait` (set in each page's head script) keeps `.hero .reveal` at `visibility:hidden` until
`document.fonts.load('900 1em "Barlow Condensed"')` resolves, capped at 1.6 s (0.8 s under reduced motion); the hero
entrance waits for both the font and the preloader fade. On a normal connection the preloader already covers that
window — hero visible at **1,003 ms**, the same moment as before. The failsafe removes `has-js`, which disables the
hold, so the hero can never stay hidden (verified with `app.js` blocked).

Residual 0.0016: a 3 px nudge of the preloader wordmark and nav as their fonts swap, behind the preloader.

### Known follow-ups

- Frame timing was measured on one GPU. Worth a spot check on a high-DPI MacBook and a 4K external display, where the
  1.5× pixel-ratio and 2560 px backing caps are what keep fill cost bounded.
- Hero markup still carries inline `style=""` on the 2D canvas, hero badge and hero note; move to CSS during token migration.

## Phase 4 — page transitions + cinematic intro

### Architecture

- **Barba 2.10.3** (8.7 KB brotli) and **GSAP Flip 3.13.0** (8.4 KB) added, self-hosted. `<body>` is the Barba
  wrapper; each page's `nav … footer` is the container (`data-barba-namespace="home|vertical"`). The preloader,
  scroll-progress bar, cursor, curtain and live region sit outside it and persist.
- **Visit-wide vs per-page lifecycle.** `initGlobalMotion` (Lenis, cursor) and `initGlobalChrome` (progress bar,
  scrolled nav) start once. `startPage()` starts UI, motion, hero tiers, morph and intro for one container and
  returns a teardown: an `AbortController` for listeners, `mm.revert()`, morph disposal, and a sweep of every
  ScrollTrigger not tagged `global:`. DOM queries are scoped to the current container (`setRoot`).
- **Transition** (`core/transitions.js`): cover with a forest curtain + brass edge → tear down the outgoing page →
  swap head tags (title, description, keywords, canonical, `og:*`, `twitter:*`, JSON-LD) → swap the page stylesheet
  (`home.css` ⇄ `vertical.css`, new one loaded before the old is removed) → start the incoming page → wait for
  layout fonts (≤ 0.9 s) → refresh ScrollTrigger → restore scroll (back/forward) or jump to `#hash` → lift the curtain
  → move focus to the `<h1>` (or linked section) and announce the page in an `aria-live` region.
- Every failure path falls back to a normal page load: request errors, timeouts (6 s) and any exception in a hook.
- **Staged rollout.** `DEFAULT_SCOPE = 'automation'` — transitions run only between pages under `/automation/`;
  links to or from the homepage are normal page loads. Widen to `'all'` in `core/transitions.js` once verified in
  production. `?transitions=all|automation|off` on the first page of a visit overrides it for testing.
- **Local dev server** `tools/dev-server.mjs` (no dependencies): resolves `/automation/real-estate` →
  `real-estate.html` like Netlify's Pretty URLs, and sends `no-store` so tests never run stale files. The previous
  `python -m http.server` returned 404 for every extensionless internal link.

### First-visit intro

Once per session (`sessionStorage`): the logo strokes draw, the counter runs, then the preloader background dissolves
while its logo and wordmark fly into the nav logo's exact position with `Flip.fit`. Later loads in the session skip the
preloader entirely — `html.intro-seen` is set by the head script **before first paint**, so it never flashes. Reduced
motion, data-saver and missing Flip also skip it.

| measured from DOMContentLoaded | first visit | later load, same session |
|---|---|---|
| handoff starts | 644 ms | — |
| hero visible | **680 ms** | **334 ms** |
| preloader gone | 1,344 ms | before scripts run |
| CLS | 0.001 | 0.0007 |

### Transitions — verified (headless Chromium, pretty-URL dev server)

| check | result |
|---|---|
| automation → automation | **no reload**; head matches the destination's raw HTML (title, canonical, JSON-LD count); `<h1>` focused; page announced |
| listeners on the new page | dropdown toggles exactly once per click; FAQ works |
| leak check, 6 navigations | ScrollTriggers steady at 50 · 1 pin · 1 cursor · 1 curtain · 1 container · heap 5–9 MB |
| back button | previous page restored at **exactly 1,400 px** |
| homepage → automation (full scope) | `home.css` swapped for `vertical.css`; keywords removed; JSON-LD 2 → 1 |
| **computed styles after a transition vs a direct load** | **485 elements compared, 0 differences** |
| WebGL hero across 3 homepage round trips | 1 WebGL canvas on the homepage, 0 away; ScrollTriggers steady at 65 / 50 |
| cross-page anchors `/#pricing`, `/#system` | land exactly 80 px below the nav; hash shown; section focused; Back works |
| page request fails | falls back to a normal load of the correct URL |
| reduced motion | instant curtain; settles in ≤ 351 ms |
| console | clean (only the deliberately aborted request) |

**Curtain time**, click → curtain lifted: 1,314–1,385 ms in every direction, cold or warm. That is almost entirely the
designed animation (0.55 s cover + 0.7 s lift); the work in between is ~60–130 ms. Tunable in `cover()` / `reveal()`.

### Bugs found and fixed during Phase 4

1. **Barba drops the `#fragment`** from the destination URL: cross-page anchors landed at the top. The hash is now read
   from the clicked link and restored in the address bar.
2. **Fonts the incoming page needs but the outgoing page never used** loaded after positions were measured, so an
   anchor landed 3,469 px off. The transition now waits (capped) for the layout faces while the curtain covers, re-jumps
   once if a late font still moves the section, and the first page warms those faces in the background after its hero
   settles (cold automation → automation curtain 1,620 → 1,317 ms). `document.fonts.ready` is no longer used for this: an
   unrelated face kept it pending for the whole cap.
3. **Regression from Phase 2, found here:** a direct link such as `/automation/real-estate#pricing` landed **2,520 px short**.
   The browser scrolls to the fragment while parsing, before the ScrollTrigger pin adds its scroll distance above it
   (Phase 1's CSS `height:380vh` did not have this problem). Fixed on first load, plus `scroll-margin-top: 80px` so native
   jumps (including no-JS) clear the fixed nav.
4. **WebGL shader compile stalled the intro** (~700 ms without a frame on a fresh profile; hero visible at 1,935 ms). The
   WebGL hero now waits until the hero entrance finishes; the compile lands after it.
5. **Morph scene was never disposed** (harmless with full page loads, a leak with transitions). Now disposed with the page.
6. **Document-level listeners** (dropdown outside-click, Escape handlers) would have accumulated per navigation; all
   per-page listeners are now released through an `AbortController`.
7. Local dev server first resolved its root with URL encoding intact (`C:\Clannco%20v2`) and 404'd everything; fixed with
   `fileURLToPath`.

### Deviations from the plan

- **Staged scope kept as the shipped default** (`'automation'`). Full scope is implemented and passes every check above;
  flipping one constant enables it.
- **Preloader still shows on the first visit to any page type**, not only the homepage — it is the same element on every page.
- **No page-transition prefetching** (`@barba/prefetch` not added): curtain time is animation-bound, not network-bound.

### Known follow-ups

- A ~112 ms hitch just before the intro handoff (two ~70 ms tasks during intro setup).
- Google Fonts is a render- and script-blocking third-party stylesheet: one slow response delayed `DOMContentLoaded` to
  ~4.5 s in one test run. Self-hosting the fonts would remove that dependency.
- Widen `DEFAULT_SCOPE` to `'all'` after a production check.

## Phase 5 — token migration, accessibility audit, polish

Verification method: a computed-style snapshot (51 properties, every element and pseudo-element, ~10,770 elements) of all
8 pages at 1440 px and 390 px with reduced motion, taken **before** any change and diffed after each step. Remaining
differences were classified one by one; looping CSS animations (marquee, pulse rings, typing dots, loading bars) are
sampling noise and excluded.

### Token migration

| Change | Result |
|---|---|
| Palette, type families, `--radius`, `--shadow` | defined **once**, in `clannco.css` (values unchanged); removed from both page stylesheets |
| 28 rules identical in `home.css` and `vertical.css` | moved to a "Shared components" block in `clannco.css` |
| `--z-*` ladder | rewritten to the stacking order the pages actually use; every `z-index` literal ≥ 1 now a token |
| `cubic-bezier(.22,1,.36,1)` literals | `var(--e-out)` |
| **Computed-style diff** | **0 unintended differences** |

Intended stacking fix: on the homepage the float CTA (998) and WhatsApp button (999) sat level with the mobile drawer (999);
both now sit under it (`--z-fab` 800 / `--z-fab-2` 801), matching the automation pages.

**Only 28 of the 108 duplicated rules could move.** A rule moved into `clannco.css` loads before every page rule, so an earlier
page rule with the same specificity that it used to beat would start winning. The first, naive extraction did exactly that
(homepage dropdown lost its padding and radius — caught by the diff, reverted). The extraction now moves a rule only when no
earlier rule in either page stylesheet sets an overlapping property on an overlapping selector. The other 80 need a
section-by-section rewrite of the page stylesheets to share.

Size, gzip: `clannco.css` 1.3 → 2.3 KB, `home.css` 11.4 → 10.9 KB, `vertical.css` 8.9 → 8.4 KB. Per first page view that is
~+0.25 KB (neutral); the shared file is cached across page types. The win is one source of truth, not bytes.

### Accessibility audit

No Lighthouse/axe installed (not downloaded); an in-browser audit script checked every page at both widths for: accessible
names, form labels, duplicate ids, broken ARIA references, heading order, landmarks, positive tabindex, focusables inside
`aria-hidden`, text contrast (WCAG AA against the resolved background), and 24 px mobile targets.

| Finding (all pages unless noted) | Before | After |
|---|---|---|
| Contact-form labels not associated with their fields | 4 per page | 0 (`for`/`id`) |
| Small brass text on cream sections (homepage eyebrows, step numbers, stat labels, plan badge) | 2.0–2.2 : 1 | ~8 : 1 (`--forest-4`; brass rule kept as the accent) |
| Form labels on cream (homepage) | 3.7 : 1 | ≥ 4.5 : 1 |
| Footer text, hero note, form labels (automation) | 3.9–4.4 : 1 | ≥ 4.5 : 1 |
| Homepage heading order h2 → h4 | 9 skips | 0 (h4 → h3, rendered identically) |
| Footer links on mobile | 13–14 px tall | 24 px |
| Standalone "full automation breakdown" link | 14 px | 24 px, layout height unchanged |

Remaining, accepted: the honeypot input is reported unlabelled but is `display:none` (not in the accessibility tree); the
"See everything we build →" link sits inside a sentence (WCAG 2.5.8 inline exception). About 90–165 text elements per page
sit on gradients or images, where contrast cannot be computed automatically — they need a manual check.

Regression: the Phase 4 transition suite passes unchanged (0 style differences after a transition vs a direct load,
ScrollTriggers steady at 50/65, back-button scroll restored, cross-page anchors at 80 px, WebGL not duplicated).

### Not done in Phase 5

- `files/` was not removed (the move was blocked by the permission check in this session). Nothing links to it.
- Lighthouse scores not recorded; run `npx lighthouse http://localhost:5173/ --view` locally.
- Spacing and type scales still unused by existing declarations; `.section{padding:118px 0}` etc. remain literals.

## Visual redesign — "The Operating System"

Rolled out to all 8 pages after the `/_proto/` prototype was approved. Layout, visuals and motion changed;
**copy did not** — an automated check compares visible text, link hrefs, form field names, headings, alt text,
aria-labels and title/description/canonical against the pre-redesign backup: identical on all 8 pages.

### What was built

| Piece | File |
|---|---|
| Persistent particle stage (12k desktop / 3.5k compact), 7 formations morphing per section, outside the Barba container | `assets/js/scenes/stage.js` |
| Section → formation + HUD label mapping, bound per page | `assets/js/core/stage-director.js`, `scenes` in `core/config.js` |
| HUD: corner brackets, status clock, section readout, clickable section rail | `assets/js/core/hud.js` |
| Headline word-fill (pinned on the homepage), pinned 3D segment rail, hero exit | `assets/js/core/sections.js` |
| Visual system: glass panels, cream islands, split hero, terminal FAQ, ticket plan, footer wordmark | `assets/css/os.css` (loaded last) |
| Markup: hero headline lines, hero brief panel, statement/focus blocks, inline styles removed | all 8 HTML files |

Tiers: hardware WebGL2 → live stage (loaded after the hero settles); no hardware GPU, reduced motion or
data-saver → still glow poster, old hero canvas and 2D six-step drawing kept; no JS → unchanged base layer.
Force with `?stage=on|off`.

### Verification

| Check | Result |
|---|---|
| Copy check (8 pages) | identical |
| Console, all sections, desktop + mobile | 0 errors |
| Styles after a transition vs direct load | 500 elements, 0 differences |
| ScrollTriggers over repeated navigations | steady (67 vertical / 83 homepage) |
| Cross-page `/#pricing`, `/#system`, back button | land at 80 px, focused; scroll restored |
| Accessibility audit | clean (honeypot false positive only) |
| Reduced motion + app.js-blocked failsafe | pass |

### Bugs found and fixed during the rollout

1. Hero brief panel never appeared: its exit tween used `autoAlpha` while `hero-wait` still hid the hero, recording
   "hidden" as the start value. Switched to `opacity`.
2. Pins measured in the wrong order: the six-step pin (refreshPriority 1) measured before the new pins above it
   existed and overlapped the segment rail. New pins refresh first (priorities 3 and 2).
3. Cross-page anchors landed 3,955 px short: Lenis clamps to a stale scroll limit after pins add height.
   `jumpTo` / `scrollToTarget` now call `lenis.resize()` first.
4. Six-step buttons and hint failed contrast once their background became measurable (3.2 / 4.1 : 1); raised.

### Known limits

- Headless QA runs WebGL in software (`?stage=on`); real-GPU frame rate still needs a check on target hardware.
- Planned but simplified: the intro section uses a cream island rather than a horizontal pinned scroll, and the
  page transition keeps the curtain (now smoked glass over the live stage) rather than a particle implode.
- `home.css` / `vertical.css` still carry the pre-redesign rules that `os.css` overrides.
