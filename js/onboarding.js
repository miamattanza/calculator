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
  { key: 'menu',     target: '#menu-btn',              shape: 'rect'   },
  { key: 'balance',  target: '#head-balance',          shape: 'rect'   },
  { key: 'budget',   target: '#budget-ring',           shape: 'circle' },
  { key: 'settings', target: '#settings-btn',          shape: 'rect'   },
  { key: 'amount',   target: '.entry-amount',          shape: 'rect'   },
  { key: 'plus',     target: '.entry-plus',            shape: 'circle' },
  { key: 'keypad',   target: '.entry-keypad',          shape: 'rect'   },
  { key: 'dot',      target: '.key-dot',               shape: 'rect'   },
  { key: 'cats',     target: '.cat-viewport',          shape: 'rect'   },
  { key: 'history',  target: '.mini-hist .swipe-wrap', shape: 'rect'   },
  { key: 'expand',   target: '.mini-more',             shape: 'rect'   },
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
    window.removeEventListener('scroll', reposition, true);
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

  // Геометрия стрелки. Отступ острия от рамки и минимальная длина линии, чтобы
  // стрелка не выходила слишком короткой (тогда подсказку опускаем дальше).
  const GAP_R = 11, MIN_LEN = 62, EDGE = 6;

  // Позиция подсказки: со стороны цели, где больше свободного места. Отодвигаем
  // на GAP_R + MIN_LEN + EDGE, чтобы гарантировать длину стрелки.
  const positionPop = (rect) => {
    const vw = window.innerWidth, vh = window.innerHeight, m = 12;
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = Math.round(rect.left + rect.width / 2 - pw / 2);
    left = Math.max(m, Math.min(left, vw - pw - m));
    const below = (vh - rect.bottom) >= rect.top;
    let top = below
      ? rect.top + rect.height + GAP_R + EDGE + MIN_LEN
      : rect.top - GAP_R - EDGE - MIN_LEN - ph;
    top = Math.max(m, Math.min(top, vh - ph - m));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    return { left, top, width: pw, height: ph, below };
  };

  // Пунктирная стрелка от подсказки к рамке. Куб. Безье, где касательная в конце
  // направлена по нормали к цели — остриё входит в элемент строго под 90°.
  // Из подсказки линия выходит перпендикулярно её грани (в пределах 30–90°).
  const drawArrow = (ringBox, popBox) => {
    const rcx = ringBox.left + ringBox.width / 2;
    const pcx = popBox.left + popBox.width / 2;
    let start, end, sN, tN;
    if (popBox.below) {
      // Подсказка ниже цели: стрелка идёт вверх, входит в нижнюю грань под 90°.
      end = { x: rcx, y: ringBox.top + ringBox.height + GAP_R };
      tN = { x: 0, y: 1 };                    // внешняя нормаль цели (к подсказке)
      start = { x: pcx, y: popBox.top - EDGE };
      sN = { x: 0, y: -1 };                   // выход из верхней грани подсказки
    } else {
      // Подсказка выше цели: стрелка идёт вниз, входит в верхнюю грань под 90°.
      end = { x: rcx, y: ringBox.top - GAP_R };
      tN = { x: 0, y: -1 };
      start = { x: pcx, y: popBox.top + popBox.height + EDGE };
      sN = { x: 0, y: 1 };
    }
    const dist = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const k = Math.max(26, Math.min(78, dist * 0.42));
    const c1 = { x: start.x + sN.x * k, y: start.y + sN.y * k };
    const c2 = { x: end.x + tN.x * k, y: end.y + tN.y * k };
    arrowLine.setAttribute('d',
      `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`);
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
  // Пересчёт при прокрутке (нижние цели могут быть за пределами экрана).
  // Фаза перехвата — чтобы ловить прокрутку любого внутреннего контейнера.
  window.addEventListener('scroll', reposition, true);
  const step = (dir) => {
    let i = idx + dir;
    while (i >= 0 && i < STEPS.length && !visibleRect(STEPS[i].target)) i += dir;
    if (i < 0 || i >= STEPS.length) { finish(); return; }
    show(i);
  };

  const show = (i) => {
    idx = i;
    curStep = STEPS[i];
    // Прокручиваем цель в зону видимости (нижние элементы могут быть за краем).
    const node = document.querySelector(curStep.target);
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'center', behavior: 'auto' });
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
