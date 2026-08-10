// onboarding.js — вводный тур нового образца: статичная рамка вокруг элемента
// (без пульсации) + пунктирная «текучая» стрелка от подсказки к элементу.
// Форма рамки повторяет форму элемента (прямоугольник со скруглением или круг).
// Полностью офлайн, тексты — из i18n (все языки). Запускается при первом запуске
// и повторно из «Настройки → Как пользоваться».

import * as store from './store.js';
import { t } from './i18n.js';
import { el, clear } from './dom.js';

// Шаги тура. target — CSS-селектор подсвечиваемого элемента.
// shape — форма рамки: 'rect' (скруглённый прямоугольник) | 'circle' (круг).
// Разворачиваем пошагово: пока только базовая навигация по интерфейсу.
const STEPS = [
  { key: 'menu',     target: '#menu-btn',     shape: 'rect'   },
  { key: 'balance',  target: '#head-balance', shape: 'rect'   },
  { key: 'budget',   target: '#budget-ring',  shape: 'circle' },
  { key: 'settings', target: '#settings-btn', shape: 'rect'   },
  { key: 'amount',   target: '.entry-amount', shape: 'rect'   },
  { key: 'plus',     target: '.entry-plus',   shape: 'circle' },
];

const NS = 'http://www.w3.org/2000/svg';

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

// Виден ли элемент (есть в DOM и имеет размер).
function visibleRect(sel) {
  const node = sel ? document.querySelector(sel) : null;
  if (!node) return null;
  const r = node.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return r;
}

function runTour() {
  active = true;
  let idx = 0;

  // Прозрачный слой: перехватывает нажатия (фон не реагирует), но не затемняет —
  // как в присланном примере. Внутри: SVG-стрелка, рамка-подсветка, подсказка.
  const overlay = el('.tour-overlay', { role: 'dialog', 'aria-modal': 'true' });
  const ring = el('.tour-ring');

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'tour-arrow');
  svg.innerHTML =
    '<defs><marker id="tour-ah" viewBox="0 0 10 10" refX="7.5" refY="5" ' +
    'markerWidth="6.5" markerHeight="6.5" orient="auto">' +
    '<path d="M0 0 L10 5 L0 10 Z"></path></marker></defs>' +
    '<path class="tour-arrow-line" fill="none" marker-end="url(#tour-ah)"></path>';
  const arrowLine = svg.querySelector('.tour-arrow-line');

  const pop = el('.tour-pop');
  const title = el('.tour-title');
  const desc = el('.tour-desc');
  const dots = el('.tour-dots');
  const skip = el('button.tour-skip', { type: 'button', text: t('ob_skip') });
  const next = el('button.tour-next', { type: 'button' });
  pop.append(title, desc, dots, el('.tour-actions', {}, [skip, next]));
  overlay.append(svg, ring, pop);
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
  next.addEventListener('click', () => step(1));

  // Позиция рамки поверх цели (с небольшим отступом).
  const positionRing = (rect, shape) => {
    const pad = 7;
    ring.style.display = '';
    ring.classList.toggle('circle', shape === 'circle');
    // Для круга держим квадрат по большей стороне (иконка круглая).
    let w = rect.width + pad * 2, h = rect.height + pad * 2, l = rect.left - pad, top = rect.top - pad;
    if (shape === 'circle') {
      const d = Math.max(w, h);
      l -= (d - w) / 2; top -= (d - h) / 2; w = h = d;
    }
    ring.style.left = Math.round(l) + 'px';
    ring.style.top = Math.round(top) + 'px';
    ring.style.width = Math.round(w) + 'px';
    ring.style.height = Math.round(h) + 'px';
    return { left: l, top, width: w, height: h };
  };

  // Позиция подсказки: под целью, если она в верхней половине экрана, иначе над.
  const positionPop = (rect) => {
    const vw = window.innerWidth, vh = window.innerHeight, m = 12;
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = Math.round(rect.left + rect.width / 2 - pw / 2);
    left = Math.max(m, Math.min(left, vw - pw - m));
    const below = rect.top < vh * 0.5;
    // Оставляем зазор под стрелку.
    let top = below ? rect.top + rect.height + 40 : rect.top - ph - 40;
    top = Math.max(m, Math.min(top, vh - ph - m));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    return { left, top, width: pw, height: ph };
  };

  // Пунктирная стрелка от подсказки к рамке (плавная дуга).
  const drawArrow = (ringBox, popBox) => {
    const rc = { x: ringBox.left + ringBox.width / 2, y: ringBox.top + ringBox.height / 2 };
    const pc = { x: popBox.left + popBox.width / 2, y: popBox.top + popBox.height / 2 };
    const dx = rc.x - pc.x, dy = rc.y - pc.y;
    const gapR = 12; // отступ острия от рамки
    let start, end;
    if (Math.abs(dy) >= Math.abs(dx)) {
      if (dy < 0) { // цель выше подсказки
        start = { x: pc.x, y: popBox.top - 6 };
        end = { x: rc.x, y: ringBox.top + ringBox.height + gapR };
      } else {       // цель ниже подсказки
        start = { x: pc.x, y: popBox.top + popBox.height + 6 };
        end = { x: rc.x, y: ringBox.top - gapR };
      }
    } else {
      if (dx < 0) { // цель левее
        start = { x: popBox.left - 6, y: pc.y };
        end = { x: ringBox.left + ringBox.width + gapR, y: rc.y };
      } else {       // цель правее
        start = { x: popBox.left + popBox.width + 6, y: pc.y };
        end = { x: ringBox.left - gapR, y: rc.y };
      }
    }
    const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
    const vx = end.x - start.x, vy = end.y - start.y;
    const len = Math.hypot(vx, vy) || 1;
    const nx = -vy / len, ny = vx / len;             // перпендикуляр
    const bow = Math.min(44, len * 0.26);
    const sign = rc.x < window.innerWidth / 2 ? 1 : -1; // изгиб внутрь экрана
    const cx = mx + nx * bow * sign, cy = my + ny * bow * sign;
    arrowLine.setAttribute('d', `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`);
    svg.style.display = '';
  };

  let curStep = null;
  const reposition = () => {
    if (!curStep) return;
    const rect = visibleRect(curStep.target);
    if (!rect) return;
    const ringBox = positionRing(rect, curStep.shape);
    const popBox = positionPop(rect);
    drawArrow(ringBox, popBox);
  };
  window.addEventListener('resize', reposition);

  // Переход по шагам с пропуском невидимых целей. dir: +1 вперёд, -1 назад.
  const step = (dir) => {
    let i = idx + dir;
    while (i >= 0 && i < STEPS.length && !visibleRect(STEPS[i].target)) i += dir;
    if (i < 0 || i >= STEPS.length) { finish(); return; }
    show(i);
  };

  const show = (i) => {
    idx = i;
    curStep = STEPS[i];
    title.textContent = t('ob_' + curStep.key + '_t');
    desc.textContent = t('ob_' + curStep.key + '_d');
    // «Далее» на всех, кроме последнего видимого шага впереди.
    let hasNext = false;
    for (let k = i + 1; k < STEPS.length; k++) if (visibleRect(STEPS[k].target)) { hasNext = true; break; }
    next.textContent = hasNext ? t('ob_next') : t('ob_done_btn');
    clear(dots);
    for (let k = 0; k < STEPS.length; k++) dots.appendChild(el('.tour-dot', { class: k === i ? 'active' : '' }));
    reposition();
  };

  // Стартуем с первого видимого шага.
  const first = STEPS.findIndex((s) => visibleRect(s.target));
  if (first < 0) { finish(); return; }
  show(first);
}
