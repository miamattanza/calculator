// onboarding.js — интерактивный вводный тур: подсвечивает элементы («прожектор»),
// показывает подсказку с описанием жеста и ведёт по шагам «Далее»/«Пропустить».
// Полностью офлайн, тексты — из i18n (все языки). Запускается при первом запуске
// и повторно из «Настройки → Как пользоваться».

import * as store from './store.js';
import { t } from './i18n.js';
import { el, clear } from './dom.js';

// Шаги тура. target — CSS-селектор подсвечиваемого элемента (null = карточка по
// центру). hint — тип анимированной подсказки жеста над элементом.
const STEPS = [
  { key: 'welcome',  target: null,           hint: null },
  { key: 'swipe',    target: '.home-pager',  hint: 'swipe' },
  { key: 'record',   target: '.cat-pager',   hint: 'tap' },
  { key: 'plus',     target: '.entry-plus',  hint: 'longpress' },
  { key: 'dot',      target: '.key-dot',     hint: 'longpress' },
  { key: 'reorder',  target: '.cat-pager',   hint: 'longpress' },
  { key: 'history',  target: '.mini-hist',   hint: 'swipe' },
  { key: 'menu',     target: '#menu-btn',    hint: 'tap' },
  { key: 'balance',  target: '#head-balance', hint: 'tap' },
  { key: 'done',     target: null,           hint: null },
];

let active = false;

export function isOnboardingActive() { return active; }

// Запуск тура. Гарантируем, что мы на главном экране (там все цели).
export function startOnboarding() {
  if (active) return;
  document.dispatchEvent(new CustomEvent('go-section', { detail: 'home' }));
  // Небольшая задержка — дать главному экрану отрисоваться.
  setTimeout(runTour, 220);
}

// Показать тур при первом запуске (после выбора языка), один раз.
export function maybeOnboard() {
  const s = store.getState().settings;
  if (!s.onboarded && s.langChosen) setTimeout(startOnboarding, 500);
}

function runTour() {
  active = true;
  let idx = 0;

  const overlay = el('.tour-overlay', { role: 'dialog', 'aria-modal': 'true' });
  const hole = el('.tour-hole');
  const hint = el('.tour-hint');
  const pop = el('.tour-pop');
  const title = el('.tour-title');
  const desc = el('.tour-desc');
  const dots = el('.tour-dots');
  const skip = el('button.tour-skip', { type: 'button', text: t('ob_skip') });
  const next = el('button.tour-next', { type: 'button' });
  pop.append(title, desc, dots, el('.tour-actions', {}, [skip, next]));
  overlay.append(hole, hint, pop);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  const finish = async () => {
    active = false;
    overlay.remove();
    document.body.classList.remove('modal-open');
    window.removeEventListener('resize', reposition);
    if (!store.getState().settings.onboarded) await store.setSetting('onboarded', true);
  };
  skip.addEventListener('click', finish);
  next.addEventListener('click', () => { if (idx >= STEPS.length - 1) finish(); else show(idx + 1); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { /* фон не закрывает — только кнопки */ } });

  const positionPop = (rect) => {
    // Поповер под целью, если та в верхней половине, иначе над ней. По центру —
    // если цели нет. Ограничиваем краями экрана.
    const vw = window.innerWidth, vh = window.innerHeight, m = 12;
    pop.style.left = ''; pop.style.top = ''; pop.style.transform = '';
    if (!rect) {
      pop.style.left = '50%'; pop.style.top = '50%';
      pop.style.transform = 'translate(-50%, -50%)';
      return;
    }
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = Math.round(rect.left + rect.width / 2 - pw / 2);
    left = Math.max(m, Math.min(left, vw - pw - m));
    const below = rect.top < vh * 0.5;
    let top = below ? rect.bottom + 14 : rect.top - ph - 14;
    top = Math.max(m, Math.min(top, vh - ph - m));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  };

  const positionHole = (rect, step) => {
    if (!rect) { hole.style.display = 'none'; hint.style.display = 'none'; return; }
    const pad = 8;
    hole.style.display = '';
    hole.style.left = Math.round(rect.left - pad) + 'px';
    hole.style.top = Math.round(rect.top - pad) + 'px';
    hole.style.width = Math.round(rect.width + pad * 2) + 'px';
    hole.style.height = Math.round(rect.height + pad * 2) + 'px';
    // Анимированная подсказка жеста в центре цели.
    if (step.hint) {
      hint.style.display = '';
      hint.className = 'tour-hint tour-hint-' + step.hint;
      hint.innerHTML = step.hint === 'swipe'
        ? '<span class="tour-hand">⇄</span>'
        : '<span class="tour-ring"></span>';
      hint.style.left = Math.round(rect.left + rect.width / 2 - 30) + 'px';
      hint.style.top = Math.round(rect.top + rect.height / 2 - 30) + 'px';
    } else { hint.style.display = 'none'; }
  };

  let curRect = null, curStep = null;
  const reposition = () => {
    const r = curStep && curStep.target ? (document.querySelector(curStep.target) || null) : null;
    curRect = r ? r.getBoundingClientRect() : null;
    // Затемнение фона: при наличии цели — от «дырки» (box-shadow), иначе — заливкой.
    overlay.classList.toggle('dim', !curRect);
    positionHole(curRect, curStep);
    positionPop(curRect);
  };
  window.addEventListener('resize', reposition);

  const show = (i) => {
    idx = i;
    curStep = STEPS[i];
    title.textContent = t('ob_' + curStep.key + '_t');
    desc.textContent = t('ob_' + curStep.key + '_d');
    next.textContent = i >= STEPS.length - 1 ? t('ob_done_btn') : t('ob_next');
    clear(dots);
    for (let k = 0; k < STEPS.length; k++) dots.appendChild(el('.tour-dot', { class: k === i ? 'active' : '' }));
    reposition();
  };

  show(0);
}
