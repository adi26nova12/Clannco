/* Stage director: maps each section of the current page to a particle formation and a HUD label, and tells
   the stage (if there is one) and the HUD which section is on screen. Bound per page, released on leave. */
import { ScrollTrigger } from './gsap-setup.js';
import { $$, MQ } from './env.js';
import { setHudSections, setHudActive } from './hud.js';

// where a formation sits, in fractions of the visible world width/height
const PLACE = {
  core:         { x: 0.24, y: 0.1, scale: 0.72, alpha: 1 },
  network:      { x: 0, y: 0, scale: 1.1, alpha: 0.5 },
  pillars:      { x: 0.06, y: -0.04, scale: 0.9, alpha: 0.75 },
  grid:         { x: 0, y: -0.12, scale: 1.1, alpha: 0.6 },
  conversation: { x: 0.18, y: 0, scale: 0.95, alpha: 0.55 },
  funnel:       { x: 0.26, y: 0, scale: 0.85, alpha: 0.6 },
  calm:         { x: 0, y: 0, scale: 1.2, alpha: 0.35 },
};
const MORPH_SEQUENCE = ['core', 'grid', 'funnel', 'network', 'conversation', 'pillars'];
const MORPH_PLACE = { x: 0.22, y: 0, scale: 0.8, alpha: 1 };

let stage = null;
let current = null; // { sections, triggers, activeIndex, morphIndex }

function placeFor(name, override) {
  const p = { ...PLACE[name], ...override };
  if (window.matchMedia(MQ.compact).matches) {
    return { x: 0, y: p.y * 0.5, scale: p.scale * 0.62, alpha: p.alpha * 0.7 };
  }
  return p;
}

function show(i) {
  if (!current) return;
  const s = current.sections[i];
  if (!s) return;
  current.activeIndex = i;
  setHudActive(i);
  if (!stage) return;
  if (s.scene === 'morph') {
    const k = Math.max(0, current.morphIndex);
    stage.to(MORPH_SEQUENCE[k % MORPH_SEQUENCE.length], placeFor('core', MORPH_PLACE));
  } else {
    stage.to(s.scene, placeFor(s.scene, s.place));
  }
}

export function setStage(s) {
  stage = s;
  if (current && current.activeIndex >= 0) show(current.activeIndex);
}

/* scenes: [[selector, scene, label, placeOverride?]]; a selector matching several elements yields one section
   each. scene may be an array (cycled per match); label may be a function of the element. */
export function bindDirector(scenes) {
  unbindDirector();
  const sections = [];
  scenes.forEach(([sel, scene, label, place]) => {
    $$(sel).forEach((el, k) => {
      if (sections.some((s) => s.el === el)) return;
      sections.push({
        el,
        scene: Array.isArray(scene) ? scene[k % scene.length] : scene,
        label: typeof label === 'function' ? label(el, k) : label,
        place,
      });
    });
  });
  sections.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  current = { sections, triggers: [], activeIndex: -1, morphIndex: 0 };
  setHudSections(sections);
  sections.forEach((s, i) => {
    current.triggers.push(ScrollTrigger.create({
      trigger: s.el,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (self) => { if (self.isActive) show(i); },
    }));
  });
  show(0);
}

// the pinned six-step section reports its step; the stage follows while that section is active
export function directorMorphStep(k) {
  if (!current || current.morphIndex === k) return;
  current.morphIndex = k;
  const s = current.sections[current.activeIndex];
  if (s && s.scene === 'morph') show(current.activeIndex);
}

// a component can briefly take the stage (e.g. the contact console); directorRefresh hands it back
export function directorFocus(name, place) {
  if (stage) stage.to(name, placeFor(name, place), { duration: 1.2 });
}
export function directorRefresh() {
  if (current && current.activeIndex >= 0) show(current.activeIndex);
}

export function unbindDirector() {
  if (!current) return;
  current.triggers.forEach((t) => t.kill());
  current = null;
  if (stage) stage.to('calm', PLACE.calm, { duration: 0.9 });
}
