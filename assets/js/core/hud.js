/* HUD chrome: corner brackets and a clickable section rail. Built once for the whole visit, outside the Barba
   container; each page hands it its section list. */
import { scrollToTarget } from './scroll.js';

let root = null;
let rail = null;
let buttons = [];

export function createHud() {
  if (root) return;
  root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML =
    '<span class="hud-corner tl" aria-hidden="true"></span><span class="hud-corner tr" aria-hidden="true"></span>' +
    '<span class="hud-corner bl" aria-hidden="true"></span><span class="hud-corner br" aria-hidden="true"></span>' +
    '<nav class="hud-rail" aria-label="Page sections"></nav>';
  document.body.appendChild(root);
  rail = root.querySelector('.hud-rail');
}

// sections: [{ el, label }]
export function setHudSections(sections) {
  if (!rail) return;
  rail.textContent = '';
  buttons = sections.map(({ el, label }, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Go to section ${i + 1}: ${label}`);
    b.addEventListener('click', () => scrollToTarget(el, { offset: i === 0 ? 0 : -40, duration: 1.3 }));
    rail.appendChild(b);
    return b;
  });
}

export function setHudActive(i) {
  buttons.forEach((b, j) => b.classList.toggle('is-active', j === i));
}

export function destroyHud() {
  if (root) root.remove();
  root = rail = null;
  buttons = [];
}
