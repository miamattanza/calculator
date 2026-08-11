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
// zone — «область»: пока объясняются шаги одной зоны, окно подсказки не двигается
// (меняется только рамка и конец стрелки). При переходе в другую зону окно плавно
// переезжает. side — принудительная сторона подсказки ('below'|'above'|auto).
const STEPS = [
  { key: 'menu',     target: '#menu-btn',              shape: 'rect',   zone: 'top'  },
  { key: 'balance',  target: '#head-balance',          shape: 'rect',   zone: 'top'  },
  { key: 'budget',   target: '#budget-ring',           shape: 'circle', zone: 'top'  },
  { key: 'settings', target: '#settings-btn',          shape: 'rect',   zone: 'top'  },
  { key: 'amount',   target: '.entry-amount',          shape: 'rect',   zone: 'entry' },
  { key: 'plus',     target: '.entry-plus',            shape: 'circle', zone: 'entry' },
  { key: 'keypad',   target: '.entry-keypad',          shape: 'rect',   zone: 'keys' },
  { key: 'dot',      target: '.key-dot',               shape: 'rect',   zone: 'keys' },
  { key: 'cancel',   target: '.key-del',               shape: 'rect',   zone: 'keys' },
  { key: 'cats',     target: '.cat-viewport',          shape: 'rect',   zone: 'cats' },
  { key: 'history',  target: '.mini-hist .swipe-wrap', shape: 'rect',   zone: 'hist' },
  { key: 'expand',   target: '.mini-more',             shape: 'rect',   zone: 'expand' },
];

// Сторона подсказки для зон, где важно зафиксировать её положение.
const ZONE_SIDE = { top: 'below', entry: 'below', keys: 'below' };

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
    cancelAnimationFrame(animId);
    overlay.remove();
    document.body.classList.remove('modal-open');
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', drawArrowLive, true);
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
  // стрелка не выходила слишком короткой (тогда подсказку отодвигаем дальше).
  const GAP_R = 11, MIN_LEN = 66, EDGE = 6;

  // Объединённый прямоугольник всех видимых целей зоны (по нему фиксируем окно).
  const zoneRect = (zone) => {
    let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity, any = false;
    for (const s of STEPS) {
      if (s.zone !== zone) continue;
      const r = visibleRect(s.target);
      if (!r) continue;
      any = true;
      L = Math.min(L, r.left); T = Math.min(T, r.top);
      R = Math.max(R, r.right); B = Math.max(B, r.bottom);
    }
    return any ? { left: L, top: T, right: R, bottom: B, width: R - L, height: B - T } : null;
  };

  // Фиксированное положение окна подсказки для зоны. Считается один раз при входе
  // в зону; сторона — из ZONE_SIDE или по большему свободному месту.
  const computeZonePop = (zone) => {
    const zr = zoneRect(zone) || visibleRect(STEPS[idx].target);
    const vw = window.innerWidth, vh = window.innerHeight, m = 12;
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = Math.round((zr.left + zr.right) / 2 - pw / 2);
    left = Math.max(m, Math.min(left, vw - pw - m));
    const side = ZONE_SIDE[zone] || ((vh - zr.bottom) >= zr.top ? 'below' : 'above');
    let top = side === 'below'
      ? zr.bottom + GAP_R + EDGE + MIN_LEN
      : zr.top - GAP_R - EDGE - MIN_LEN - ph;
    top = Math.max(m, Math.min(top, vh - ph - m));
    return { left, top, width: pw, height: ph };
  };

  // Пунктирная стрелка от подсказки к рамке. Куб. Безье: касательная в конце — по
  // нормали к цели (остриё входит строго под 90°), из окна линия выходит перпенд.
  // его грани. Начало берётся из ЖИВОГО положения окна, конец — из живого положения
  // рамки, поэтому во время плавных переездов стрелка следует за обоими.
  const drawArrowRects = (rr, pr) => {
    const rcx = rr.left + rr.width / 2, rcy = rr.top + rr.height / 2;
    const pcx = pr.left + pr.width / 2, pcy = pr.top + pr.height / 2;
    const below = pcy > rcy;                 // окно ниже цели → стрелка вверх
    let start, end, sN, tN;
    if (below) {
      end = { x: rcx, y: rr.top + rr.height + GAP_R }; tN = { x: 0, y: 1 };
      start = { x: pcx, y: pr.top - EDGE };            sN = { x: 0, y: -1 };
    } else {
      end = { x: rcx, y: rr.top - GAP_R };             tN = { x: 0, y: -1 };
      start = { x: pcx, y: pr.top + pr.height + EDGE }; sN = { x: 0, y: 1 };
    }
    const dist = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const k = Math.max(26, Math.min(78, dist * 0.42));
    const c1 = { x: start.x + sN.x * k, y: start.y + sN.y * k };
    const c2 = { x: end.x + tN.x * k, y: end.y + tN.y * k };
    arrowLine.setAttribute('d',
      `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`);
    svg.style.display = '';
  };

  // Перерисовка стрелки по живым прямоугольникам окна и рамки.
  const drawArrowLive = () => drawArrowRects(ring.getBoundingClientRect(), pop.getBoundingClientRect());

  let curStep = null, curZone = null, zonePop = null;
  let animId = 0;
  // Пока едут рамка и/или окно (CSS-переходы), обновляем стрелку каждый кадр.
  const animateArrow = () => {
    cancelAnimationFrame(animId);
    const t0 = performance.now();
    const tick = (now) => {
      drawArrowLive();
      if (now - t0 < 440) animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
  };

  const reposition = () => {
    if (!curStep) return;
    const rect = visibleRect(curStep.target);
    if (!rect) return;
    positionRing(rect, curStep.shape);
    if (!zonePop) zonePop = computeZonePop(curStep.zone);
    pop.style.left = zonePop.left + 'px';
    pop.style.top = zonePop.top + 'px';
    drawArrowLive();
  };
  const onResize = () => { zonePop = null; reposition(); };
  window.addEventListener('resize', onResize);
  // Пересчёт стрелки при прокрутке (нижние цели могут быть за пределами экрана).
  // Фаза перехвата — чтобы ловить прокрутку любого внутреннего контейнера.
  window.addEventListener('scroll', drawArrowLive, true);

  const step = (dir) => {
    let i = idx + dir;
    while (i >= 0 && i < STEPS.length && !visibleRect(STEPS[i].target)) i += dir;
    if (i < 0 || i >= STEPS.length) { finish(); return; }
    show(i);
  };

  let firstShow = true;
  const show = (i) => {
    idx = i;
    const zoneChanged = !curStep || curStep.zone !== STEPS[i].zone;
    curStep = STEPS[i];
    // При смене зоны — прокрутить область в зону видимости и пересчитать окно.
    if (zoneChanged) {
      const node = document.querySelector(curStep.target);
      if (node && node.scrollIntoView) node.scrollIntoView({ block: 'center', behavior: 'auto' });
      curZone = curStep.zone;
      zonePop = null;
    }
    title.textContent = t('ob_' + curStep.key + '_t');
    desc.textContent = t('ob_' + curStep.key + '_d');
    // «Далее» на всех, кроме последнего видимого шага впереди.
    let hasNext = false;
    for (let k = i + 1; k < STEPS.length; k++) if (visibleRect(STEPS[k].target)) { hasNext = true; break; }
    next.textContent = hasNext ? t('ob_next') : t('ob_done_btn');
    clear(dots);
    for (let k = 0; k < STEPS.length; k++) dots.appendChild(el('.tour-dot', { class: k === i ? 'active' : '' }));

    if (firstShow) {
      // Первый показ без анимации переезда (иначе окно «прилетало» из угла).
      pop.style.transition = 'none';
      reposition();
      requestAnimationFrame(() => { pop.style.transition = ''; });
      firstShow = false;
    } else {
      reposition();
      animateArrow();   // рамка/окно едут по CSS-переходам — стрелка следует за ними
    }
  };

  // Стартуем с первого видимого шага.
  const first = STEPS.findIndex((s) => visibleRect(s.target));
  if (first < 0) { finish(); return; }
  show(first);
}
