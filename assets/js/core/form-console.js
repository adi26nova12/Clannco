/* The contact form as a step-by-step console.
   The form's own fields are used exactly as authored (same inputs, same dropdowns, same required rules).
   Only the first field shows at first; filling a field brings the next one up, and the send button appears
   once every required field has a value. Around it: a completion rail and counter, numbered rows that tick
   when filled, a pointer spotlight, and the particle stage gathering beside the form while it is in use.
   Without JavaScript every field is simply visible. Listeners are released with the page. */
import { gsap } from './gsap-setup.js';
import { $$, MQ } from './env.js';
import { directorFocus, directorRefresh } from './stage-director.js';

const pad = (n) => String(n).padStart(2, '0');
const TYPING_PAUSE = 650; // ms after the last keystroke before the next field comes up

export function initFormConsoles({ signal } = {}) {
  $$('.audit-form, .contact-form').forEach((form) => initConsole(form, signal));
}

function initConsole(form, signal) {
  if (form.classList.contains('is-console')) return;
  const steps = $$('.field', form).filter((f) => f.querySelector('input:not([type="hidden"]), select, textarea'));
  const submit = form.querySelector('button[type="submit"]');
  if (!steps.length || !submit) return;
  form.classList.add('is-console');

  const on = (el, type, fn, opts = {}) => el.addEventListener(type, fn, { signal, ...opts });
  const reduce = () => window.matchMedia(MQ.reduce).matches;
  const controlOf = (f) => f.querySelector('input:not([type="hidden"]), select, textarea');
  const filled = (f) => !!controlOf(f).value.trim();
  const isRequired = (f) => controlOf(f).required;
  const required = steps.filter(isRequired);

  const rail = document.createElement('div');
  rail.className = 'console-progress';
  rail.setAttribute('aria-hidden', 'true');
  rail.innerHTML = '<i></i><span class="console-count"></span>';
  form.prepend(rail);
  const count = rail.querySelector('.console-count');

  // ---- steps ----
  let revealed = 0;
  const pop = (el) => {
    el.classList.remove('is-pending');
    if (reduce()) return;
    gsap.fromTo(el,
      { autoAlpha: 0, y: 18, clipPath: 'inset(0 0 100% 0)' },
      { autoAlpha: 1, y: 0, clipPath: 'inset(0 0 0% 0)', duration: 0.55, ease: 'c-out', clearProps: 'opacity,visibility,transform,clipPath' });
  };
  // show every step up to i; an optional step also brings up the one after it
  const reveal = (i, { focus = false, animate = true } = {}) => {
    let target = Math.min(i, steps.length - 1);
    while (target < steps.length - 1 && !isRequired(steps[target])) target++;
    for (let k = revealed + 1; k <= target; k++) {
      if (animate) pop(steps[k]); else steps[k].classList.remove('is-pending');
    }
    revealed = Math.max(revealed, target);
    if (focus) controlOf(steps[Math.min(i, steps.length - 1)]).focus({ preventScroll: false });
    sync(animate);
  };
  const ready = () => required.every(filled);

  const sync = (animate = true) => {
    let done = 0;
    steps.forEach((f) => {
      f.classList.toggle('is-done', filled(f));
      if (isRequired(f) && filled(f)) done++;
    });
    rail.style.setProperty('--p', (done / (required.length || 1)).toFixed(3));
    count.textContent = `${pad(done)}/${pad(required.length)}`;
    const isReady = ready();
    form.classList.toggle('is-ready', isReady);
    if (isReady && submit.classList.contains('is-pending')) {
      if (animate) pop(submit); else submit.classList.remove('is-pending');
    }
  };

  // initial state: the first field (plus any the browser restored), everything else waits
  steps.forEach((f, i) => { if (i > 0) f.classList.add('is-pending'); });
  submit.classList.add('is-pending');
  let start = 0;
  while (start < steps.length - 1 && filled(steps[start])) start++;
  reveal(start, { animate: false });

  const advanceFrom = (f, opts) => {
    const i = steps.indexOf(f);
    if (i >= 0 && i === revealed && filled(f) && i < steps.length - 1) reveal(i + 1, opts);
    else sync();
  };

  let pause = 0;
  on(form, 'input', (e) => {
    const f = e.target.closest('.field');
    if (!f || e.target.tagName === 'SELECT') return;
    clearTimeout(pause);
    sync();
    pause = setTimeout(() => advanceFrom(f), TYPING_PAUSE);
  });
  on(form, 'change', (e) => {
    const f = e.target.closest('.field');
    if (!f) return;
    if (e.target.tagName === 'SELECT') advanceFrom(f, { focus: true });
    else sync();
  });
  on(form, 'keydown', (e) => {
    const f = e.target.closest && e.target.closest('.field');
    if (!f) return;
    if (e.key === 'Tab' && !e.shiftKey && filled(f)) {
      clearTimeout(pause);
      advanceFrom(f); // synchronously, so Tab lands on the field that just came up
    } else if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      // Enter would submit the form with fields still hidden; move forward instead, and submit only when complete
      e.preventDefault();
      clearTimeout(pause);
      if (!filled(f) && isRequired(f)) { shake(f); return; }
      const i = steps.indexOf(f);
      if (i === steps.length - 1) { if (ready()) form.requestSubmit(submit); return; } // only the last field sends
      if (i < revealed) controlOf(steps[i + 1]).focus();
      else advanceFrom(f, { focus: true });
    }
  });

  // ---- active row + the stage gathering beside the form ----
  on(form, 'focusin', (e) => {
    steps.forEach((f) => f.classList.toggle('is-active', f.contains(e.target)));
    directorFocus('core', { x: 0.28, y: 0, scale: 0.95, alpha: 1 });
  });
  on(form, 'focusout', (e) => {
    if (form.contains(e.relatedTarget)) return;
    steps.forEach((f) => f.classList.remove('is-active'));
    directorRefresh();
  });

  // ---- pointer spotlight ----
  if (window.matchMedia(MQ.fine).matches) {
    let r = null;
    on(form, 'pointerenter', () => { r = form.getBoundingClientRect(); });
    on(form, 'pointermove', (e) => {
      if (!r) r = form.getBoundingClientRect();
      form.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
      form.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
    });
    on(form, 'pointerleave', () => { r = null; form.style.removeProperty('--mx'); form.style.removeProperty('--my'); });
    on(window, 'scroll', () => { r = null; }, { passive: true });
  }

  const shake = (f) => {
    f.classList.remove('is-invalid');
    void f.offsetWidth;
    f.classList.add('is-invalid');
    setTimeout(() => f.classList.remove('is-invalid'), 700);
  };

  // Safety net, in capture phase so it runs before the page's inline onsubmit: never send with a required
  // field hidden or empty (native validation cannot point at a field that is not displayed).
  on(form, 'submit', (e) => {
    const missing = required.find((f) => !filled(f));
    if (missing) {
      e.preventDefault();
      e.stopImmediatePropagation();
      reveal(steps.indexOf(missing), { focus: true });
      shake(missing);
      return;
    }
    form.classList.add('is-sending');
  }, { capture: true });
}
