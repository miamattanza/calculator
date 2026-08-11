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
  { key: 'cats',     target: '.cat-viewport',          shape: 'rect',   zone: 'cats' },
  { key: 'history',  target: '.mini-hist .swipe-wrap', shape: 'rect',   zone: 'hist' },
  { key: 'expand',   target: '.mini-more',             shape: 'rect',   zone: 'expand', tight: true, pad: { x: 16, y: 9 } },
];

// Сторона подсказки для зон, где важно её зафиксировать снизу/над.
const ZONE_SIDE = { top: 'below', entry: 'below', keys: 'below' };

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

// Прямоугольник цели (по тексту, если tight). null — если не видно.
function targetRect(step) {
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

  const pop = el('.tour-pop');
  const dots = el('.tour-dots');                 // шкала-точки вверху окна
  const title = el('.tour-title');
  const desc = el('.tour-desc');
  const skip = el('button.tour-skip', { type: 'button', text: t('ob_skip') });
  const next = el('button.tour-next', { type: 'button' });
  pop.append(dots, title, desc, el('.tour-actions', {}, [skip, next]));
  overlay.append(svg, ring, pop);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  const content = document.getElementById('content');
  const FIXED_W = Math.min(300, window.innerWidth - 24);
  pop.style.width = FIXED_W + 'px';

  // Текущее применённое состояние (для tween) и параметры зоны.
  let curStep = null, zonePop = null, zoneH = 0, activeDot = null;
  let ringApplied = null, popApplied = null;
  let animId = 0, tweening = false, firstShow = true;

  const finish = async () => {
    active = false;
    cancelAnimationFrame(animId);
    overlay.remove();
    document.body.classList.remove('modal-open');
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll, true);
    if (!store.getState().settings.onboarded) await store.setSetting('onboarded', true);
  };
  skip.addEventListener('click', finish);
  next.addEventListener('click', () => step(1));

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
    const rr = ringApplied, pr = popApplied;
    const rcx = rr.l + rr.w / 2, rcy = rr.t + rr.h / 2;
    const pcy = pr.t + pr.h / 2;
    let sx = pr.l + pr.w / 2;
    if (activeDot) { const d = activeDot.getBoundingClientRect(); if (d.width) sx = d.left + d.width / 2; }
    const below = pcy > rcy;                        // окно ниже цели → стрелка вверх
    let start, end, sN, tN;
    if (below) { end = { x: rcx, y: rr.t + rr.h + GAP_R }; tN = { x: 0, y: 1 }; start = { x: sx, y: pr.t - EDGE }; sN = { x: 0, y: -1 }; }
    else { end = { x: rcx, y: rr.t - GAP_R }; tN = { x: 0, y: -1 }; start = { x: sx, y: pr.t + pr.h + EDGE }; sN = { x: 0, y: 1 }; }
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
  const centerScrollTop = (rect) => {
    const sr = content.getBoundingClientRect();
    let tgt = content.scrollTop + (rect.top + rect.height / 2) - (sr.top + sr.height / 2);
    return Math.max(0, Math.min(tgt, content.scrollHeight - content.clientHeight));
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
    clear(dots);
    const dotEls = [];
    for (let k = 0; k < STEPS.length; k++) { const d = el('.tour-dot', { class: k === i ? 'active' : '' }); dots.appendChild(d); dotEls.push(d); }
    activeDot = dotEls[i];
    setCircle(curStep.shape === 'circle');

    const rect = targetRect(curStep);
    if (!rect) return;
    const vh = window.innerHeight;

    // Предсказание скролла (для синхронного tween).
    let doScroll = false, fromScroll = 0, toScroll = 0, delta = 0;
    if ((rect.top < 100 || rect.bottom > vh - 100) && canScroll()) {
      fromScroll = content.scrollTop; toScroll = centerScrollTop(rect); delta = toScroll - fromScroll;
      doScroll = Math.abs(delta) > 2;
    }
    const shift = (r) => ({ left: r.left, top: r.top - delta, right: r.right, bottom: r.bottom - delta, width: r.width, height: r.height });
    const finalRing = ringBoxFrom(shift(rect), curStep.shape, curStep.pad);
    if (zoneChanged) zoneH = measureZoneHeight(curStep.zone);
    const fp = zoneChanged ? computeZonePop(curStep.zone, delta) : zonePop;
    zonePop = fp;
    const finalPop = { l: fp.left, t: fp.top, w: fp.width, h: fp.height };

    if (firstShow) {
      firstShow = false;
      if (doScroll) content.scrollTop = toScroll;
      settleNow();
      return;
    }
    tween({
      scroll: doScroll, fromScroll, toScroll,
      fromRing: ringApplied || finalRing, toRing: finalRing,
      fromPop: popApplied || finalPop, toPop: finalPop,
      dur: doScroll ? 540 : (zoneChanged ? 420 : 340),
    });
  };

  const first = STEPS.findIndex((s) => visible(s));
  if (first < 0) { finish(); return; }
  show(first);
}
