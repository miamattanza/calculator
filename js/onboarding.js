// onboarding.js — вводный тур: статичная рамка вокруг элемента (без пульсации)
// + пунктирная «текучая» стрелка от подсказки к элементу. Форма рамки повторяет
// форму элемента. Подсказки сгруппированы по «зонам»: пока объясняются элементы
// одной зоны, окно неподвижно и не меняет размер — двигаются только рамка и конец
// стрелки; начало стрелки привязано к активной точке шкалы (вверху окна). Между
// зонами окно и экран плавно переезжают (единый tween: скролл + позиции + стрелка).
// Полностью офлайн, тексты — из i18n (все языки).

import * as store from './store.js';
import { t } from './i18n.js';
import { el, clear } from './dom.js';

// Шаги тура. target — CSS-селектор; shape — 'rect'|'circle'; zone — область
// (в пределах зоны окно фиксировано); tight — рамка по тексту (не по всему блоку);
// pad — отступ рамки {x,y} или число.
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
  // Свайп-демо: подсвечиваем область «шапка + табло + клавиши» (кроме меню
  // категорий) и показываем анимацию свайпа влево/вправо (Расходы⇄Доходы).
  { key: 'swipe',    region: 'topSwipe',               shape: 'rect',   zone: 'swipe', pad: 0, swipeDemo: true, peekSel: '.home-pager', peekDx: -50 },
  { key: 'cats',     target: '.cat-viewport',          shape: 'rect',   zone: 'cats' },
  // Тот же жест свайпа для категорий (листание страниц) — окно не двигается.
  { key: 'swipecats', target: '.cat-viewport',         shape: 'rect',   zone: 'cats', swipeDemo: true, peekSel: '.cat-viewport', peekDx: -50 },
  { key: 'history',  target: '.mini-hist .swipe-wrap', shape: 'rect',   zone: 'hist' },
  // И для строки истории — свайп влево/вправо.
  { key: 'swipehist', target: '.mini-hist .swipe-wrap', shape: 'rect',  zone: 'hist', swipeDemo: true, peekSel: '.mini-hist .swipe-wrap .swipe-content', peekDx: -64 },
  { key: 'expand',   target: '.mini-more',             shape: 'rect',   zone: 'expand', tight: true, pad: { x: 16, y: 9 } },
];

// Сторона подсказки для каждой зоны: 'below' — окно под элементом (стрелка вверх,
// шкала-точки вверху окна); 'above' — окно над элементом (стрелка вниз, шкала
// внизу окна). Начало стрелки всегда у активной точки на грани, обращённой к цели.
const ZONE_SIDE = { top: 'below', entry: 'below', keys: 'below', swipe: 'below', cats: 'above', hist: 'above', expand: 'above' };

const NS = 'http://www.w3.org/2000/svg';
const GAP_R = 11, MIN_LEN = 66, EDGE = 6;

let active = false;
export function isOnboardingActive() { return active; }

export function startOnboarding() {
  if (active) return;
  document.dispatchEvent(new CustomEvent('go-section', { detail: 'home' }));
  setTimeout(runTour, 220);
}

export function maybeOnboard() {
  const s = store.getState().settings;
  if (!s.onboarded && s.langChosen) setTimeout(startOnboarding, 500);
}

// Прямоугольник цели (по тексту, если tight; объединение, если unionOf).
function targetRect(step) {
  // Свайп-область сверху: по ширине клавиатуры (цифры), сверху — до кнопок
  // «гамбургер»/«настройки», снизу — низ клавиатуры. Внутренний отступ ~5–6px
  // даёт бирюзовая обводка (box-shadow), поэтому берём точные границы.
  if (step.region === 'topSwipe') {
    const kp = document.querySelector('.entry-keypad');
    if (!kp) return null;
    const k = kp.getBoundingClientRect();
    if (k.width < 2) return null;
    const tops = ['#menu-btn', '#settings-btn'].map((s) => document.querySelector(s))
      .filter(Boolean).map((e) => e.getBoundingClientRect().top).filter((y) => y > -50);
    const top = tops.length ? Math.min(...tops) : k.top;
    return { left: k.left, top, right: k.right, bottom: k.bottom, width: k.right - k.left, height: k.bottom - top };
  }
  if (step.unionOf) {
    let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity, any = false;
    for (const sel of step.unionOf) {
      const n = document.querySelector(sel); if (!n) continue;
      const r = n.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      any = true; L = Math.min(L, r.left); T = Math.min(T, r.top); R = Math.max(R, r.right); B = Math.max(B, r.bottom);
    }
    return any ? { left: L, top: T, right: R, bottom: B, width: R - L, height: B - T } : null;
  }
  const node = document.querySelector(step.target);
  if (!node) return null;
  let r;
  if (step.tight) { const rg = document.createRange(); rg.selectNodeContents(node); r = rg.getBoundingClientRect(); }
  else r = node.getBoundingClientRect();
  if (!r || r.width < 2 || r.height < 2) return null;
  return r;
}
function visible(step) { return !!targetRect(step); }

function runTour() {
  active = true;
  let idx = 0;

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

  // Индикатор жеста «свайп влево/вправо» (для шага swipe): палец-точка скользит
  // по двойной стрелке внутри подсвеченной области.
  const swipeHint = el('.tour-swipe', {}, [el('.tour-swipe-dot')]);

  const pop = el('.tour-pop');
  const dots = el('.tour-dots');                 // шкала-точки вверху окна
  const title = el('.tour-title');
  const desc = el('.tour-desc');
  const skip = el('button.tour-skip', { type: 'button', text: t('ob_skip') });
  const back = el('button.tour-back', { type: 'button', text: t('ob_back') });
  const next = el('button.tour-next', { type: 'button' });
  const nav = el('.tour-nav', {}, [back, next]);
  pop.append(dots, title, desc, el('.tour-actions', {}, [skip, nav]));
  overlay.append(svg, swipeHint, ring, pop);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  const content = document.getElementById('content');
  const FIXED_W = Math.min(300, window.innerWidth - 24);
  pop.style.width = FIXED_W + 'px';

  // Текущее применённое состояние (для tween) и параметры зоны.
  let curStep = null, zonePop = null, zoneH = 0, activeDot = null;
  let ringApplied = null, popApplied = null;
  let animId = 0, tweening = false, firstShow = true, peekTimer = 0;

  // «Живой» намёк: реально двигаем сам элемент (окно/страницу/строку) на секунду —
  // видно, что он двигается и рядом есть ещё. Кадр-рамка при этом стоит на месте.
  const stopPeek = () => { clearInterval(peekTimer); peekTimer = 0; };
  const doPeek = (sel, dx) => {
    const node = document.querySelector(sel);
    if (!node) return;
    node.style.transition = 'transform .34s cubic-bezier(.34,1.2,.5,1)';
    const seq = [dx, Math.round(-dx * 0.55), 0];   // туда → чуть обратно → на место
    let i = 0;
    const nx = () => {
      if (!active || i >= seq.length) { node.style.transition = ''; node.style.transform = ''; return; }
      node.style.transform = `translateX(${seq[i++]}px)`;
      setTimeout(nx, 360);
    };
    nx();
  };
  const startPeek = () => {
    stopPeek();
    if (!curStep || !curStep.swipeDemo || !curStep.peekSel) return;
    const run = () => doPeek(curStep.peekSel, curStep.peekDx || -48);
    setTimeout(run, 520);
    peekTimer = setInterval(run, 2600);
  };

  const finish = async () => {
    active = false;
    stopPeek();
    cancelAnimationFrame(animId);
    overlay.remove();
    document.body.classList.remove('modal-open');
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll, true);
    if (!store.getState().settings.onboarded) await store.setSetting('onboarded', true);
  };
  skip.addEventListener('click', finish);
  next.addEventListener('click', () => step(1));
  back.addEventListener('click', () => step(-1));

  // ── Геометрия ──────────────────────────────────────────────────────────────
  const ringBoxFrom = (rect, shape, pad) => {
    const px = pad && pad.x != null ? pad.x : (typeof pad === 'number' ? pad : 7);
    const py = pad && pad.y != null ? pad.y : (typeof pad === 'number' ? pad : 7);
    let w = rect.width + px * 2, h = rect.height + py * 2, l = rect.left - px, t2 = rect.top - py;
    if (shape === 'circle') { const d = Math.max(w, h); l -= (d - w) / 2; t2 -= (d - h) / 2; w = h = d; }
    return { l, t: t2, w, h };
  };

  const zoneRect = (zone) => {
    let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity, any = false;
    for (const s of STEPS) {
      if (s.zone !== zone) continue;
      const r = targetRect(s);
      if (!r) continue;
      any = true;
      L = Math.min(L, r.left); T = Math.min(T, r.top); R = Math.max(R, r.right); B = Math.max(B, r.bottom);
    }
    return any ? { left: L, top: T, right: R, bottom: B } : null;
  };

  // Высота окна для зоны = максимум по её шагам (в пределах зоны не меняется).
  const measureZoneHeight = (zone) => {
    const st = title.textContent, sd = desc.textContent, sh = pop.style.height;
    pop.style.height = 'auto';
    let maxH = 0;
    for (const s of STEPS) {
      if (s.zone !== zone) continue;
      title.textContent = t('ob_' + s.key + '_t');
      desc.textContent = t('ob_' + s.key + '_d');
      maxH = Math.max(maxH, pop.offsetHeight);
    }
    title.textContent = st; desc.textContent = sd; pop.style.height = sh;
    return maxH;
  };

  // Фиксированное положение окна для зоны (delta — предсказанный сдвиг из-за скролла).
  const computeZonePop = (zone, delta) => {
    delta = delta || 0;
    let zr = zoneRect(zone);
    if (!zr) { const r = targetRect(curStep) || { left: 0, top: 0, right: 0, bottom: 0 }; zr = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }
    zr = { left: zr.left, right: zr.right, top: zr.top - delta, bottom: zr.bottom - delta };
    const vw = window.innerWidth, vh = window.innerHeight, m = 12;
    const pw = FIXED_W, ph = zoneH || pop.offsetHeight;
    let left = Math.round((zr.left + zr.right) / 2 - pw / 2);
    left = Math.max(m, Math.min(left, vw - pw - m));
    const need = ph + GAP_R + EDGE + MIN_LEN + m;
    const roomAbove = zr.top, roomBelow = vh - zr.bottom;
    let side = ZONE_SIDE[zone] || (roomBelow >= roomAbove ? 'below' : 'above');
    if (side === 'below' && roomBelow < need && roomAbove >= need) side = 'above';
    if (side === 'above' && roomAbove < need && roomBelow >= need) side = 'below';
    let top = side === 'below' ? zr.bottom + GAP_R + EDGE + MIN_LEN : zr.top - GAP_R - EDGE - MIN_LEN - ph;
    top = Math.max(m, Math.min(top, vh - ph - m));
    return { left, top, width: pw, height: ph };
  };

  const applyRing = (b) => { ring.style.display = ''; ring.style.left = b.l + 'px'; ring.style.top = b.t + 'px'; ring.style.width = b.w + 'px'; ring.style.height = b.h + 'px'; };
  const applyPop = (b) => { pop.style.left = b.l + 'px'; pop.style.top = b.t + 'px'; pop.style.height = b.h + 'px'; };
  const setCircle = (on) => ring.classList.toggle('circle', on);

  // Стрелка: касательная в конце — по нормали к цели (вход под 90°); начало —
  // от активной точки шкалы (её x), с выходом из грани окна, обращённой к цели.
  const drawArrow = () => {
    if (!ringApplied || !popApplied) return;
    // Шаги-демо свайпа: вместо стрелки — анимированный жест по центру области.
    if (curStep && curStep.swipeDemo) {
      svg.style.display = 'none';
      swipeHint.style.display = '';
      swipeHint.style.left = (ringApplied.l + ringApplied.w / 2) + 'px';
      swipeHint.style.top = (ringApplied.t + ringApplied.h / 2) + 'px';
      return;
    }
    swipeHint.style.display = 'none';
    const rr = ringApplied, pr = popApplied;
    const rcx = rr.l + rr.w / 2, rcy = rr.t + rr.h / 2;
    const pcy = pr.t + pr.h / 2;
    let sx = pr.l + pr.w / 2;
    if (activeDot) { const d = activeDot.getBoundingClientRect(); if (d.width) sx = d.left + d.width / 2; }
    const below = pcy > rcy;                        // окно ниже цели → стрелка вверх
    // Остриё заходит ВНУТРЬ элемента (~70% пути от грани к центру, но не глубже 22px).
    const depth = Math.min(0.7 * (rr.h / 2), 22);
    let start, end, sN, tN;
    if (below) { end = { x: rcx, y: rr.t + rr.h - depth }; tN = { x: 0, y: 1 }; start = { x: sx, y: pr.t - EDGE }; sN = { x: 0, y: -1 }; }
    else { end = { x: rcx, y: rr.t + depth }; tN = { x: 0, y: -1 }; start = { x: sx, y: pr.t + pr.h + EDGE }; sN = { x: 0, y: 1 }; }
    const dist = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const k = Math.max(26, Math.min(78, dist * 0.42));
    const c1 = { x: start.x + sN.x * k, y: start.y + sN.y * k };
    const c2 = { x: end.x + tN.x * k, y: end.y + tN.y * k };
    arrowLine.setAttribute('d', `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`);
    svg.style.display = '';
  };

  // ── Скролл (плавный, предсказуемый) ─────────────────────────────────────────
  const canScroll = () => content && content.scrollHeight > content.clientHeight + 2 &&
    getComputedStyle(content).overflowY !== 'hidden';
  // Желаемый scrollTop: разместить зону так, чтобы с нужной стороны осталось место
  // под окно + зазор для стрелки (для 'above' — двигаем зону ниже, для 'below' —
  // выше). Только для целей внутри прокручиваемого #content.
  const scrollForZone = (zone, side) => {
    if (!canScroll() || !curStep.target) return null;    // unionOf/шапка — не скроллим
    const node = document.querySelector(curStep.target);
    if (!node || !content.contains(node)) return null;   // напр., шапка — не скроллим
    const zr = zoneRect(zone); if (!zr) return null;
    const vh = window.innerHeight;
    const need = (zoneH || pop.offsetHeight) + GAP_R + EDGE + MIN_LEN + 16;
    const zh = zr.bottom - zr.top;
    const desiredTop = side === 'above' ? need + 12 : Math.max(12, vh - need - 12 - zh);
    let ts = content.scrollTop + (zr.top - desiredTop);
    return Math.max(0, Math.min(ts, content.scrollHeight - content.clientHeight));
  };

  const lerp = (a, b, e) => a + (b - a) * e;
  const lerpBox = (a, b, e) => ({ l: lerp(a.l, b.l, e), t: lerp(a.t, b.t, e), w: lerp(a.w, b.w, e), h: lerp(a.h, b.h, e) });
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);

  // Единый tween: скролл + рамка + окно + стрелка синхронно.
  const tween = (o) => {
    cancelAnimationFrame(animId);
    tweening = true;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / o.dur), e = easeOut(p);
      if (o.scroll) content.scrollTop = lerp(o.fromScroll, o.toScroll, e);
      ringApplied = lerpBox(o.fromRing, o.toRing, e);
      popApplied = lerpBox(o.fromPop, o.toPop, e);
      applyRing(ringApplied); applyPop(popApplied); drawArrow();
      if (p < 1) animId = requestAnimationFrame(tick);
      else { tweening = false; settleNow(); }
    };
    animId = requestAnimationFrame(tick);
  };

  // Точная посадка по живым прямоугольникам (после скролла/резайза).
  const settleNow = () => {
    const r = targetRect(curStep); if (!r) return;
    ringApplied = ringBoxFrom(r, curStep.shape, curStep.pad);
    const fp = computeZonePop(curStep.zone, 0); zonePop = fp;
    popApplied = { l: fp.left, t: fp.top, w: fp.width, h: fp.height };
    applyRing(ringApplied); applyPop(popApplied); drawArrow();
  };

  const onScroll = () => { if (tweening) return; const r = targetRect(curStep); if (!r) return; ringApplied = ringBoxFrom(r, curStep.shape, curStep.pad); applyRing(ringApplied); drawArrow(); };
  const onResize = () => { if (!curStep) return; zoneH = measureZoneHeight(curStep.zone); settleNow(); };
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onScroll, true);

  // ── Навигация ───────────────────────────────────────────────────────────────
  const step = (dir) => {
    let i = idx + dir;
    while (i >= 0 && i < STEPS.length && !visible(STEPS[i])) i += dir;
    if (i < 0 || i >= STEPS.length) { finish(); return; }
    show(i);
  };

  const show = (i) => {
    const prev = curStep;
    idx = i; curStep = STEPS[i];
    const zoneChanged = !prev || prev.zone !== curStep.zone;

    title.textContent = t('ob_' + curStep.key + '_t');
    desc.textContent = t('ob_' + curStep.key + '_d');
    let hasNext = false;
    for (let k = i + 1; k < STEPS.length; k++) if (visible(STEPS[k])) { hasNext = true; break; }
    next.textContent = hasNext ? t('ob_next') : t('ob_done_btn');
    let hasPrev = false;
    for (let k = i - 1; k >= 0; k--) if (visible(STEPS[k])) { hasPrev = true; break; }
    back.style.display = hasPrev ? '' : 'none';
    clear(dots);
    const dotEls = [];
    for (let k = 0; k < STEPS.length; k++) { const d = el('.tour-dot', { class: k === i ? 'active' : '' }); dots.appendChild(d); dotEls.push(d); }
    activeDot = dotEls[i];
    setCircle(curStep.shape === 'circle');

    // Сторона окна и грань со шкалой (сверху/снизу — к цели).
    const side = ZONE_SIDE[curStep.zone] || 'below';
    pop.classList.toggle('dots-bottom', side === 'above');
    if (zoneChanged) zoneH = measureZoneHeight(curStep.zone);

    const rect = targetRect(curStep);
    if (!rect) return;

    // Предсказание скролла (для синхронного tween): двигаем зону так, чтобы с нужной
    // стороны хватило места под окно и зазор для стрелки.
    let doScroll = false, fromScroll = content ? content.scrollTop : 0, toScroll = fromScroll, delta = 0;
    const ts = scrollForZone(curStep.zone, side);
    if (ts != null && Math.abs(ts - fromScroll) > 2) { toScroll = ts; delta = ts - fromScroll; doScroll = true; }

    const shift = (r) => ({ left: r.left, top: r.top - delta, right: r.right, bottom: r.bottom - delta, width: r.width, height: r.height });
    const finalRing = ringBoxFrom(shift(rect), curStep.shape, curStep.pad);
    const fp = zoneChanged ? computeZonePop(curStep.zone, delta) : zonePop;
    zonePop = fp;
    const finalPop = { l: fp.left, t: fp.top, w: fp.width, h: fp.height };

    if (firstShow) {
      firstShow = false;
      if (doScroll) content.scrollTop = toScroll;
      settleNow();
      startPeek();
      return;
    }
    tween({
      scroll: doScroll, fromScroll, toScroll,
      fromRing: ringApplied || finalRing, toRing: finalRing,
      fromPop: popApplied || finalPop, toPop: finalPop,
      dur: doScroll ? 540 : (zoneChanged ? 420 : 340),
    });
    startPeek();
  };

  const first = STEPS.findIndex((s) => visible(s));
  if (first < 0) { finish(); return; }
  show(first);
}
