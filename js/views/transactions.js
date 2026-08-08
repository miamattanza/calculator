// views/transactions.js — экран «Обзор»: баланс, период, список операций,
// а также форма создания/редактирования операции (используется и на других экранах).

import * as store from '../store.js';
import { t } from '../i18n.js';
import { el, clear, sheet, field, segmented, toast, confirmDialog, choiceDialog, catIcon } from '../dom.js';
import { money, signedMoney, formatDate, dateISO, CURRENCIES, roundRate, locale } from '../format.js';
import { openSearch } from './search.js';
import { openCategoryEditor, openConverter } from './settings.js';

// ---- Форма операции (переиспользуемая) ----

export function openTransactionForm(existing) {
  const base = store.baseCurrency();
  const startCur = store.currentCurrency();
  const model = existing ? { ...existing } : {
    type: 'expense', amount: '', currency: startCur, rate: store.rateToBase(startCur) || 1,
    categoryId: null, date: dateISO(), note: '',
  };

  const body = el('.form');

  // Тип
  const typeSeg = segmented([
    { value: 'expense', label: t('expense') },
    { value: 'income', label: t('income') },
  ], model.type, (v) => { model.type = v; renderCategories(); });

  // Сумма
  const amountInput = el('input.amount-input', {
    type: 'text', inputmode: 'decimal', placeholder: '0', value: model.amount || '',
  });
  amountInput.addEventListener('input', () => {
    amountInput.value = amountInput.value.replace(/[^\d.,]/g, '').replace(',', '.');
    model.amount = amountInput.value;
  });

  // Символ валюты рядом с суммой — валюты операции (не основной).
  const curSymbol = (code) => (CURRENCIES[code] && CURRENCIES[code].symbol) || code;
  const amountCur = el('.amount-cur', { text: curSymbol(model.currency) });

  // Валюта + курс
  const currencySelect = el('select.select', {}, Object.keys(CURRENCIES).map((code) =>
    el('option', { value: code, selected: code === model.currency }, `${code} ${CURRENCIES[code].symbol}`)));
  const rateField = field(t('rate_to_base', { base }), el('input.select', {
    type: 'text', inputmode: 'decimal', value: model.currency === base ? '' : roundRate(model.rate),
  }));
  rateField.input.addEventListener('input', () => {
    rateField.input.value = rateField.input.value.replace(/[^\d.,]/g, '').replace(',', '.');
    model.rate = rateField.input.value;
  });
  function syncRateVisibility() {
    rateField.row.style.display = model.currency === base ? 'none' : '';
  }
  currencySelect.addEventListener('change', () => {
    model.currency = currencySelect.value;
    amountCur.textContent = curSymbol(model.currency);
    if (model.currency === base) { model.rate = 1; rateField.input.value = 1; }
    else { const r = store.rateToBase(model.currency); if (r) { model.rate = roundRate(r); rateField.input.value = roundRate(r); } }
    syncRateVisibility();
  });

  // Категории
  const catGrid = el('.cat-grid');
  function renderCategories() {
    clear(catGrid);
    const cats = store.categoriesByType(model.type);
    // Если операция принадлежит архивной категории — добавляем её в список, чтобы
    // при редактировании не потерять привязку (иначе её бы не было среди активных).
    const curCat = model.categoryId ? store.categoryById(model.categoryId) : null;
    if (curCat && curCat.type === model.type && !cats.some((c) => c.id === curCat.id)) cats.unshift(curCat);
    if (model.categoryId && !cats.some((c) => c.id === model.categoryId)) model.categoryId = null;
    for (const c of cats) {
      const chip = el('button.cat-chip', {
        type: 'button',
        class: c.id === model.categoryId ? 'active' : '',
        style: { '--chip': c.color },
        onClick: () => {
          model.categoryId = c.id;
          catGrid.querySelectorAll('.cat-chip').forEach((x) => x.classList.remove('active'));
          chip.classList.add('active');
        },
      }, [catIcon(c), el('.cat-name', { text: store.categoryName(c) })]);
      catGrid.appendChild(chip);
    }
  }
  renderCategories();

  // Дата
  const dateInput = el('input.select', { type: 'date', value: model.date });
  dateInput.addEventListener('change', () => { model.date = dateInput.value; });

  // Заметка
  const noteInput = el('input.select', { type: 'text', placeholder: t('note_ph'), value: model.note });
  noteInput.addEventListener('input', () => { model.note = noteInput.value; });

  const error = el('.form-error');

  const saveBtn = el('button.btn-primary', { type: 'button', text: t('save') });

  body.append(
    // Тип показываем только при создании; при редактировании тип операции
    // фиксирован (расход остаётся расходом, доход — доходом).
    ...(existing ? [] : [field(t('type'), typeSeg).row]),
    el('.amount-wrap', {}, [amountInput, amountCur]),
    field(t('category'), catGrid).row,
    field(t('currency'), currencySelect).row,
    rateField.row,
    field(t('date'), dateInput).row,
    field(t('note'), noteInput).row,
    error,
    saveBtn,
  );

  if (existing) {
    const delBtn = el('button.btn-danger', {
      type: 'button', text: t('delete'),
      onClick: async () => {
        if (await confirmDialog(t('confirm_delete'))) {
          await store.deleteTransaction(existing.id);
          modal.close(); toast(t('delete'));
        }
      },
    });
    body.appendChild(delBtn);
  }

  syncRateVisibility();

  const modal = sheet(existing ? t('edit_transaction') : t('add_transaction'), body);

  saveBtn.addEventListener('click', async () => {
    const amt = parseFloat(model.amount);
    if (!amt || amt <= 0) { error.textContent = t('invalid_amount'); return; }
    if (!model.categoryId) { error.textContent = t('required'); return; }
    await store.saveTransaction({
      id: existing ? existing.id : undefined,
      type: model.type, amount: amt,
      currency: model.currency, rate: parseFloat(model.rate) || 1,
      categoryId: model.categoryId, date: model.date, note: model.note,
    });
    modal.close();
  });

  setTimeout(() => amountInput.focus(), 300);
}

// ---- Экран «Обзор» ----
// Два окна со свайпом: «Расходы» (синее) и «Доходы» (зелёное).
// В окне «Расходы» главное число — расходы, ниже доходы и общий баланс;
// в окне «Доходы» — наоборот. Тип быстрой операции берётся из активного окна.

let homeMode = 'expense'; // 'expense' | 'income'
let entryDigits = '';     // набираемая сумма (целое, в основной валюте)
let sumParts = [];        // «лента» калькулятора: [{v, op}] — op ('+'/'×') связывает v со следующим числом
let opMode = '+';         // текущий оператор кнопки: '+' или '×' (переключается долгим нажатием)
let catPage = 0;          // текущая страница категорий
const CATS_PER_PAGE = 8;
// Зазор между страницами категорий (должен совпадать с gap в CSS .cat-track и
// с шагом сетки .cat-page), чтобы промежуток на стыке страниц был как между
// соседними кнопками. Шаг прокрутки карусели = ширина окна + этот зазор.
const CAT_PAGE_GAP = 8;
// Просвет между окнами «Расходы»/«Доходы» при свайпе — доля от ширины окна
// (~50%). Задаётся инлайн на .pager-slide; шаг ленты = W + gap.
const PAGE_GAP_RATIO = 0.5;
// Пока строим «встречную» страницу для живого свайпа Расходы/Доходы, шапку
// (метка окна, баланс, кольцо лимита) не обновляем — она переключится по факту.
let suppressHeader = false;

// Строит «встречную» страницу (для окна mode) в отдельном узле, не трогая шапку
// и не очищая реальный #content. Возвращает готовый .pager (открепляем от tmp).
function buildIncoming(mode) {
  const tmp = document.createElement('div');
  const savedMode = homeMode, savedPage = catPage;
  suppressHeader = true;
  homeMode = mode; catPage = 0;
  try { renderHome(tmp); } finally { homeMode = savedMode; catPage = savedPage; suppressHeader = false; }
  const p = tmp.querySelector('.pager');
  if (p) p.remove();
  return p;
}

// Живой свайп-карусель между окнами «Расходы»/«Доходы»: обе страницы лежат в
// общей flex-ленте и едут за пальцем одновременно (встречная въезжает по мере
// ухода текущей). Свайпы, начатые в зоне категорий/истории, пропускаются.
let sliding = false;
function attachPagerSwipe(pager, root) {
  let sx = 0, sy = 0, dir = null, dragging = false, skip = false, w = window.innerWidth;
  // Состояние ленты: slide — контейнер, incoming — встречная страница, base —
  // смещение ленты, при котором видна текущая страница; toIncome — направление.
  let slide = null, incoming = null, base = 0, toIncome = false, W = 0, gap = 0;
  const inCat = (target) => !!(target && target.closest && target.closest('.cat-pager, .swipe-wrap'));
  const rubber = (over) => over * 0.3;   // сопротивление за пределами диапазона
  // Кроссфейд названия окна (Расходы/Доходы) синхронно со свайпом. Одно поле:
  // текущее гаснет на 0.5→0.75 прогресса, встречное проявляется на 0.75→1.0.
  const modeLabel = document.getElementById('mode-label');
  const showLabel = (mode, opacity) => {
    if (!modeLabel) return;
    modeLabel.textContent = mode === 'expense' ? t('expense') : t('income');
    modeLabel.className = mode === 'expense' ? 'expense' : 'income';
    modeLabel.style.opacity = String(opacity);
  };
  const labelForProgress = (p) => {
    const tgt = toIncome ? 'income' : 'expense';
    if (p < 0.75) showLabel(homeMode, p <= 0.5 ? 1 : (0.75 - p) / 0.25);
    else showLabel(tgt, Math.min(1, (p - 0.75) / 0.25));
  };
  const resetLabel = () => { if (modeLabel) { modeLabel.style.opacity = ''; modeLabel.style.transition = ''; } };
  const teardown = (keepCurrent) => {
    // keepCurrent — вернуть текущую страницу в root (отмена свайпа).
    if (!slide) return;
    if (keepCurrent) {
      incoming && incoming.remove();
      pager.style.transform = ''; pager.style.transition = '';
      slide.remove(); root.appendChild(pager);
    }
    root.style.overflowX = '';
    slide = null; incoming = null;
  };
  const start = (x, y) => { if (sliding) { dragging = false; return; } sx = x; sy = y; dir = null; dragging = true; w = window.innerWidth || pager.offsetWidth; };
  const buildSlide = (target) => {
    W = pager.offsetWidth || w;
    toIncome = target === 'income';
    incoming = buildIncoming(target);
    if (!incoming) return false;
    gap = Math.round(W * PAGE_GAP_RATIO);    // просвет между окнами ~50% ширины
    slide = el('.pager-slide');
    slide.style.gap = gap + 'px';
    (toIncome ? [pager, incoming] : [incoming, pager]).forEach((p) => slide.appendChild(p));
    base = toIncome ? 0 : -(W + gap);        // так, что видна текущая страница
    slide.style.transition = 'none';
    slide.style.transform = `translateX(${base}px)`;
    pager.style.transform = ''; pager.style.transition = '';
    root.style.overflowX = 'hidden';
    root.appendChild(slide);
    return true;
  };
  const move = (x, y, e) => {
    if (!dragging || skip || sliding) return;
    const dx = x - sx, dy = y - sy;
    if (dir === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (dir !== 'h') return;
    if (e && e.cancelable) e.preventDefault();
    const target = dx < 0 ? 'income' : 'expense'; // влево → доходы, вправо → расходы
    if (target === homeMode && !slide) {
      // В эту сторону страницы нет: тугая резинка (без встречной страницы).
      pager.style.transition = 'none';
      pager.style.transform = `translateX(${Math.sign(dx) * Math.min(Math.abs(dx) * 0.35, w * 0.4)}px)`;
      return;
    }
    if (!slide && !buildSlide(target)) return;
    // Двигаем ленту за пальцем в диапазоне [base-(W+gap) .. base]; за пределами —
    // сопротивление. Прогресс p (0 — текущее окно, 1 — встречное) — для названия.
    const span = W + gap;
    let t = base + dx;
    const lo = -span, hi = 0;
    if (t > hi) t = hi + rubber(t - hi);
    else if (t < lo) t = lo + rubber(t - lo);
    slide.style.transition = 'none';
    slide.style.transform = `translateX(${t}px)`;
    labelForProgress(Math.max(0, Math.min(1, Math.abs(t - base) / span)));
  };
  const finishSlide = (targetT, commit, targetMode) => {
    sliding = true;
    slide.style.transition = 'transform .28s cubic-bezier(.32,.72,0,1)';
    slide.style.transform = `translateX(${targetT}px)`;
    // Доводим название синхронно с доводкой ленты.
    if (modeLabel) modeLabel.style.transition = 'opacity .2s ease';
    showLabel(commit ? targetMode : homeMode, 1);
    setTimeout(() => {
      if (commit) {
        homeMode = targetMode; catPage = 0;
        renderHome(root);            // свежая страница (правильная шапка и слушатели); очистит ленту
        root.style.overflowX = '';
        slide = null; incoming = null;
      } else {
        teardown(true);
      }
      resetLabel();
      sliding = false;
    }, 290);
  };
  const end = (x) => {
    if (!dragging) return;
    dragging = false;
    if (skip) return;
    if (dir !== 'h') { pager.style.transform = ''; return; }
    const dx = x - sx;
    if (!slide) { pager.style.transition = 'transform .24s ease'; pager.style.transform = 'translateX(0)'; return; }
    const commit = toIncome ? (dx < -W * 0.25) : (dx > W * 0.25);
    const targetMode = toIncome ? 'income' : 'expense';
    if (commit) finishSlide(toIncome ? -(W + gap) : 0, true, targetMode);
    else finishSlide(base, false, null);
  };
  pager.addEventListener('touchstart', (e) => { skip = inCat(e.target); const p = e.changedTouches[0]; start(p.clientX, p.clientY); }, { passive: true });
  pager.addEventListener('touchmove', (e) => { const p = e.changedTouches[0]; move(p.clientX, p.clientY, e); }, { passive: false });
  pager.addEventListener('touchend', (e) => { const p = e.changedTouches[0]; end(p.clientX, p.clientY); }, { passive: true });
  pager.addEventListener('mousedown', (e) => {
    skip = inCat(e.target);
    start(e.clientX, e.clientY);
    const mm = (ev) => move(ev.clientX, ev.clientY, ev);
    const mu = (ev) => { end(ev.clientX, ev.clientY); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
  });
}

// Свайп внутри зоны категорий — листание страниц категорий.
function attachCatSwipe(node, onPrev, onNext) {
  let sx = 0, sy = 0, tracking = false;
  const begin = (x, y) => { sx = x; sy = y; tracking = true; };
  const finish = (x, y) => {
    if (!tracking) return;
    tracking = false;
    const dx = x - sx, dy = y - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) onNext(); else onPrev(); }
  };
  node.addEventListener('touchstart', (e) => { const p = e.changedTouches[0]; begin(p.clientX, p.clientY); }, { passive: true });
  node.addEventListener('touchend', (e) => { const p = e.changedTouches[0]; finish(p.clientX, p.clientY); }, { passive: true });
  node.addEventListener('mousedown', (e) => begin(e.clientX, e.clientY));
  node.addEventListener('mouseup', (e) => finish(e.clientX, e.clientY));
}

// Кольцо-индикатор лимита для шапки. muted=true — уведомление отключено:
// индикатор остаётся на месте, но «заморожен» (серый, без пульса, с косой
// чертой), чтобы было понятно, что оповещение выключено.
function budgetRingSvg(ratio, muted) {
  const NS = 'http://www.w3.org/2000/svg';
  const size = 26, sw = 3.5, r = (size - sw) / 2, cx = size / 2, c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));
  let color = 'var(--text-3)';
  if (muted) color = 'var(--text-3)';
  // Цвета из палитры: перерасход — тёмный вариант красного S04, 80% — предупреждение S03.
  else if (ratio >= 1) color = '#8E2224'; else if (ratio >= 0.9) color = 'var(--red)'; else if (ratio >= 0.8) color = 'var(--warning)';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('class', 'budget-ring-svg' + (muted ? ' muted' : (ratio >= 1 ? ' over' : '')));
  const mk = (stroke, dash) => {
    const el2 = document.createElementNS(NS, 'circle');
    el2.setAttribute('cx', cx); el2.setAttribute('cy', cx); el2.setAttribute('r', r);
    el2.setAttribute('fill', 'none'); el2.setAttribute('stroke', stroke); el2.setAttribute('stroke-width', sw);
    if (dash) { el2.setAttribute('stroke-dasharray', dash); el2.setAttribute('stroke-linecap', 'round'); el2.setAttribute('transform', `rotate(-90 ${cx} ${cx})`); }
    return el2;
  };
  svg.appendChild(mk('var(--sep)'));
  svg.appendChild(mk(color, `${clamped * c} ${c}`));
  // Отключено: косая черта поверх кольца (как у «выкл»/🔕).
  if (muted) {
    const off = size * 0.5 / Math.SQRT2 * 0.62; // длина черты от центра
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', cx - off); line.setAttribute('y1', cx + off);
    line.setAttribute('x2', cx + off); line.setAttribute('y2', cx - off);
    line.setAttribute('stroke', 'var(--text-2)'); line.setAttribute('stroke-width', 2.2); line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);
  }
  return svg;
}

// SVG мусорной корзины с крышкой на «тыльной» стороне клавиши «0». Крышка
// (.trash-lid) открывается, когда плитку подносят к корзине (класс .trash-over).
const TRASH_CAN_SVG = `<svg class="trashcan" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 19 L16.5 38 Q16.7 40.5 19.2 40.5 L28.8 40.5 Q31.3 40.5 31.5 38 L33 19"/><path d="M21 24 V35" stroke-width="2"/><path d="M27 24 V35" stroke-width="2"/><g class="trash-lid"><path d="M12.5 19 H35.5"/><path d="M20.5 19 L21.5 15.5 H26.5 L27.5 19"/></g></svg>`;

// Долгое нажатие (hold) на кнопку: короткий тап → onTap, удержание → onHold.
// Порог 350 мс; сдвиг пальца отменяет. Используется на клавише «.» (конвертер).
function attachHold(btn, onTap, onHold) {
  let timer = null, held = false, sx = 0, sy = 0, moved = false;
  const begin = (x, y) => {
    sx = x; sy = y; moved = false; held = false;
    timer = setTimeout(() => {
      held = true;
      if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) {} }
      onHold();
    }, 350);
  };
  const track = (x, y) => { if (!moved && (Math.abs(x - sx) > 10 || Math.abs(y - sy) > 10)) { moved = true; clearTimeout(timer); } };
  const finish = () => { clearTimeout(timer); if (!held && !moved) onTap(); };
  btn.addEventListener('touchstart', (e) => { const p = e.changedTouches[0]; begin(p.clientX, p.clientY); }, { passive: true });
  btn.addEventListener('touchmove', (e) => { const p = e.changedTouches[0]; track(p.clientX, p.clientY); }, { passive: true });
  btn.addEventListener('touchend', finish, { passive: true });
  btn.addEventListener('touchcancel', () => clearTimeout(timer), { passive: true });
  btn.addEventListener('mousedown', (e) => {
    begin(e.clientX, e.clientY);
    const mm = (ev) => track(ev.clientX, ev.clientY);
    const mu = () => { finish(); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
  });
}

// Вычисление «ленты» калькулятора с учётом приоритета умножения над сложением.
// parts: [{v, op}], tail — текущее набираемое число (последний операнд).
function evalTape(parts, tail) {
  const values = parts.map((p) => p.v).concat(tail);
  const ops = parts.map((p) => p.op);
  const nums = [values[0]];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i] === '×') nums[nums.length - 1] *= values[i + 1];
    else nums.push(values[i + 1]);
  }
  return nums.reduce((a, b) => a + b, 0);
}

export function renderHome(root) {
  clear(root);
  root.classList.remove('fit-mode');
  const base = store.baseCurrency();
  const settings = store.getState().settings;
  const isExpense = homeMode === 'expense';
  const split = settings.splitHistory !== false;
  const scope = split ? homeMode : null;

  // Шапка: метка окна (цветом сектора) + компактный баланс. При построении
  // «встречной» страницы для свайпа шапку не трогаем (suppressHeader).
  if (!suppressHeader) {
  const modeLabel = document.getElementById('mode-label');
  if (modeLabel) { modeLabel.textContent = isExpense ? t('expense') : t('income'); modeLabel.className = isExpense ? 'expense' : 'income'; }
  const headBalance = document.getElementById('head-balance');
  if (headBalance) {
    headBalance.style.display = '';
    clear(headBalance);
    headBalance.append(
      el('.hb-label', { text: t('balance') }),
      el('.hb-value', { text: money(Math.round(store.currentBalance()), base) }),
    );
    // Тап по балансу → «Аналитика» (быстрый доступ к статистике из шапки).
    headBalance.classList.add('tappable');
    headBalance.onclick = () => document.dispatchEvent(new CustomEvent('go-section', { detail: 'analytics' }));
  }

  // Сигнал лимита: круг-индикатор между меткой окна и балансом. Оранжевый ≥80%,
  // красный ≥90%, бордовый пульсирующий при превышении. Тап → «Бюджеты».
  const ringHost = document.getElementById('budget-ring');
  if (ringHost) {
    clear(ringHost);
    const bs = store.budgetOverallStatus();
    if (bs.has) {
      // Индикатор показываем всегда (если задан лимит). При отключённом
      // уведомлении он остаётся на месте, но «заморожен» (см. budgetRingSvg).
      ringHost.style.display = '';
      ringHost.appendChild(budgetRingSvg(bs.ratio, bs.muted));
      ringHost.onclick = () => document.dispatchEvent(new CustomEvent('go-section', { detail: 'budgets' }));
    } else {
      ringHost.style.display = 'none';
      ringHost.onclick = null;
    }
  }
  } // /suppressHeader

  const pager = el('.pager.home-pager', { class: isExpense ? 'expense-mode' : 'income-mode' });

  // --- Табло суммы ---
  const amountEl = el('.entry-amount');
  const tapeEl = el('.entry-tape', { 'aria-hidden': 'true' });   // «лента» слагаемых (кнопка +)
  const entryCur = store.currentCurrency(); // ввод — в текущей («ходовой») валюте
  const curSym = (CURRENCIES[entryCur] && CURRENCIES[entryCur].symbol) || entryCur;
  const decSep = () => (1.1).toLocaleString(locale()).replace(/[0-9]/g, '') || '.';
  const fmtNum = (n) => n.toLocaleString(locale(), { maximumFractionDigits: 2 });
  const renderTape = () => {
    if (sumParts.length) {
      tapeEl.textContent = sumParts.map((p) => `${fmtNum(p.v)} ${p.op}`).join(' ');
      tapeEl.classList.add('show');
    } else {
      tapeEl.textContent = '';
      tapeEl.classList.remove('show');
    }
  };
  const renderAmount = () => {
    let disp;
    if (!entryDigits) {
      disp = '0';
    } else {
      const [ip, fp] = entryDigits.split('.');
      const s = (parseInt(ip || '0', 10) || 0).toLocaleString(locale());
      disp = entryDigits.indexOf('.') >= 0 ? s + decSep() + (fp || '') : s;
    }
    amountEl.textContent = disp + ' ' + curSym;
    amountEl.classList.toggle('zero', (parseFloat(entryDigits) || 0) <= 0 && !sumParts.length);
    renderTape();
  };

  // --- Клавиатура (без подтверждения — запись по тапу на категорию).
  // Точка «.» слева от нуля — для дробных сумм (до 2 знаков после точки). ---
  const keypad = el('.entry-keypad');
  const pressDigit = (d) => {
    const dot = entryDigits.indexOf('.');
    if (dot >= 0 && entryDigits.length - dot - 1 >= 2) return;   // максимум 2 знака после точки
    if (entryDigits.replace('.', '').length >= 12) return;
    entryDigits = (entryDigits === '0' ? '' : entryDigits) + d;
    renderAmount();
  };
  const pressDot = () => {
    if (entryDigits.indexOf('.') >= 0) return;
    entryDigits = (entryDigits === '' ? '0' : entryDigits) + '.';
    renderAmount();
  };
  // Кнопка «+»/«×»: складываем/умножаем несколько сумм в одну операцию.
  // Текущее число уходит в «ленту» с текущим оператором, поле обнуляется под
  // следующее. Оператор («+» либо «×») переключается долгим нажатием кнопки.
  const pressOp = () => {
    const v = parseFloat(entryDigits);
    if (!(v > 0)) return;
    sumParts.push({ v, op: opMode });
    entryDigits = '';
    renderAmount();
  };
  // Backspace: сперва стираем цифры текущего числа, затем — последнее слагаемое.
  const del = () => {
    if (entryDigits) entryDigits = entryDigits.slice(0, -1);
    else if (sumParts.length) sumParts.pop();
    renderAmount();
  };
  ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach((n) =>
    keypad.appendChild(el('button.key', { type: 'button', text: n, onClick: () => pressDigit(n) })));
  // Клавиша «.»: короткий тап — десятичная точка; долгое нажатие — конвертер
  // валют. Значок ⇄ в углу подсказывает, что у кнопки есть второе действие.
  const dotKey = el('button.key.key-dot', { type: 'button', text: '.', 'aria-label': '.' });
  // Вертикальный значок конвертера, одной колонкой: $ сверху, под ним две
  // закруглённые стрелки (вниз $→€ и вверх €→$), € снизу. Крупный, но тусклее точки.
  dotKey.appendChild(el('.key-dot-badge', { 'aria-hidden': 'true', html:
    '<svg viewBox="0 0 26 48" fill="none" aria-hidden="true">' +
    '<text x="13" y="15" text-anchor="middle" font-size="17" font-weight="700" fill="currentColor" font-family="-apple-system,system-ui,sans-serif">$</text>' +
    '<g stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
    '<path d="M10 20 V30"/><path d="M7.4 27.4 L10 30 L12.6 27.4"/>' +
    '<path d="M16 30 V20"/><path d="M13.4 22.6 L16 20 L18.6 22.6"/>' +
    '</g>' +
    '<text x="13" y="45" text-anchor="middle" font-size="17" font-weight="700" fill="currentColor" font-family="-apple-system,system-ui,sans-serif">€</text>' +
    '</svg>' }));
  attachHold(dotKey, pressDot, () => openConverter());
  keypad.appendChild(dotKey);
  // Клавиша «0»: в режиме перемещения переворачивается на тыльную сторону —
  // мусорную корзину с крышкой (перетаскивание категории сюда её удаляет).
  const zeroKey = el('button.key.key-zero', { type: 'button', 'aria-label': '0', onClick: () => pressDigit('0') }, [
    el('.key0-inner', {}, [
      el('.key0-front', { text: '0' }),
      el('.key0-back', { 'aria-hidden': 'true', html: TRASH_CAN_SVG }),
    ]),
  ]);
  keypad.appendChild(zeroKey);
  keypad.appendChild(el('button.key.key-del', { type: 'button', text: '⌫', 'aria-label': t('delete'), onClick: del }));

  const commit = async (categoryId) => {
    const tail = entryDigits ? (parseFloat(entryDigits) || 0) : 0;
    const v = evalTape(sumParts, tail);   // «лента» с учётом × перед +
    if (v <= 0) { amountEl.classList.add('shake'); setTimeout(() => amountEl.classList.remove('shake'), 400); return; }
    entryDigits = ''; sumParts = []; opMode = '+';
    const cat = store.categoryById(categoryId);
    // Валюта операции: своя у категории, иначе — текущая («ходовая»).
    let cur = (cat && cat.currency) || store.currentCurrency();
    let rate = store.rateToBase(cur);
    // Защита: без известного курса не записываем в чужой валюте (иначе 1:1 —
    // доллары превратились бы в рубли). Пишем в основной валюте.
    if (rate == null) { cur = base; rate = 1; }
    await store.saveTransaction({ type: homeMode, amount: v, currency: cur, rate, categoryId, date: dateISO(), note: '' });
    // saveTransaction → подписка → renderHome (табло сбрасывается, история обновляется)
  };

  // --- Категории: 2 ряда по 4 (8 на страницу). Позиции АБСОЛЮТНЫЕ (по slot =
  // order): каждая категория стоит на своём месте, пустые ячейки — «+». Перенос/
  // удаление оставляют пустые места, ничего автоматически не сдвигая. ---
  const cats = store.categoriesByType(homeMode);
  const bySlot = new Map();
  let maxSlot = -1;
  for (const c of cats) { const s = c.order || 0; bySlot.set(s, c); if (s > maxSlot) maxSlot = s; }
  // +1 — чтобы после последней занятой всегда была хотя бы одна пустая ячейка «+».
  const pages = Math.max(1, Math.ceil((maxSlot + 2) / CATS_PER_PAGE));
  if (catPage >= pages) catPage = 0;
  // Добавление новой категории в конкретную (нажатую) свободную ячейку.
  const openAdd = (slot) => openCategoryEditor(null, () => {}, homeMode, slot);

  const catViewport = el('.cat-viewport');
  const catTrack = el('.cat-track');

  // Перетаскивание иконок для смены порядка (долгое нажатие «отрывает» иконку,
  // тащим на место другой — они меняются местами). Пока карточка «взята»,
  // карусель категорий не листается (dragActive). Короткий тап — запись.
  let dragActive = false;
  // Визуальное сопровождение режима перемещения: затемнение экрана (кроме самих
  // категорий) + лёгкая «дрожь» остальных плиток, как в режиме редактирования
  // домашнего экрана iOS. Вибро — при старте (работает на Android; на iOS
  // Vibration API недоступен).
  const reorderDim = el('.reorder-dim');
  pager.appendChild(reorderDim);
  // Корзина живёт на «тыльной» стороне клавиши «0»: при входе в режим клавиша
  // переворачивается (CSS по body.reordering), при наведении плитки крышка
  // открывается (.trash-over), при выходе — крышка захлопывается и клавиша
  // разворачивается обратно.
  const enterReorder = () => {
    document.body.classList.add('reordering');
    requestAnimationFrame(() => reorderDim.classList.add('on'));
  };
  const exitReorder = () => {
    document.body.classList.remove('reordering');
    reorderDim.classList.remove('on');
    zeroKey.classList.remove('trash-over');
    zeroKey.style.removeProperty('--trash-red');
  };
  const overTrash = (x, y) => {
    if (!document.body.classList.contains('reordering')) return false;
    const r = zeroKey.getBoundingClientRect();
    const pad = 12;
    return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  };
  // Удаление категории через корзину. Если она занята в операциях — предлагаем
  // выбор: удалить только категорию (историю сохранить) или удалить всё.
  const handleTrash = async (c) => {
    if (store.categoryInUse(c.id)) {
      const choice = await choiceDialog(t('category_in_use'), [
        { label: t('delete_keep_history'), value: 'keep' },
        { label: t('delete_all'), value: 'all', danger: true },
        { label: t('cancel'), value: null },
      ]);
      if (choice === 'keep') await store.archiveCategory(c.id);
      else if (choice === 'all') await store.deleteCategoryWithData(c.id);
      return;
    }
    if (await confirmDialog(t('delete_category_q', { name: store.categoryName(c) }))) {
      await store.deleteCategory(c.id);
    }
  };
  const attachChipDrag = (chip, cat) => {
    chip.dataset.catId = cat.id;
    let timer = null, sx = 0, sy = 0, moved = false, dragging = false, longFired = false;
    let startPage = 0, lastX = 0, lastY = 0, edgeDir = 0, edgeTimer = null;
    // «Призрак» пустой ячейки с плюсиком на месте, откуда «взята» плитка.
    let ghost = null;
    const removeGhost = () => { if (ghost) { ghost.remove(); ghost = null; } };
    // Прозрачность контура растёт пропорционально смещению плитки от её ячейки:
    // 1% пути = 1% видимости, 100% — когда плитка полностью покинула ячейку
    // (сместилась на свою ширину по горизонтали или высоту по вертикали).
    const updateGhost = () => {
      if (!ghost) return;
      const w = catViewport.offsetWidth || 1;
      const dx = (lastX - sx) + (catPage - startPage) * (w + CAT_PAGE_GAP);
      const dy = lastY - sy;
      const cw = chip.offsetWidth || 1, ch = chip.offsetHeight || 1;
      const frac = Math.min(1, Math.max(Math.abs(dx) / cw, Math.abs(dy) / ch));
      ghost.style.opacity = String(frac);
    };
    // Плавное покраснение корзины по расстоянию между плиткой и корзиной:
    // касание (зазор 0) = 100%, 10px → 90%, …, 100px и дальше → 0% (белая).
    const updateTrash = () => {
      if (!document.body.classList.contains('reordering')) return;
      const tr = zeroKey.getBoundingClientRect();
      const cr = chip.getBoundingClientRect();
      const dx = Math.max(0, tr.left - cr.right, cr.left - tr.right);
      const dy = Math.max(0, tr.top - cr.bottom, cr.top - tr.bottom);
      const gap = Math.hypot(dx, dy);
      const red = Math.max(0, Math.min(1, (100 - gap) / 100));
      zeroKey.style.setProperty('--trash-red', String(red));
    };
    const clearTargets = () => {
      catViewport.querySelectorAll('.cat-chip.drop-target').forEach((x) => x.classList.remove('drop-target'));
      zeroKey.classList.remove('trash-over');
    };
    // Что под пальцем: корзина / другая плитка (обмен) / пустая ячейка (в конец).
    const resolveDrop = (x, y) => {
      if (overTrash(x, y)) return { kind: 'trash' };
      const e = document.elementFromPoint(x, y);
      const c = e && e.closest && e.closest('.cat-chip');
      if (!c || c === chip) return null;
      if (c.classList.contains('cat-add')) return { kind: 'empty', el: c };
      if (c.dataset.catId) return { kind: 'chip', el: c };
      return null;
    };
    const highlight = (x, y) => {
      clearTargets();
      const d = resolveDrop(x, y);
      if (!d) return null;
      if (d.kind === 'trash') zeroKey.classList.add('trash-over');
      else d.el.classList.add('drop-target');
      return d;
    };
    // Позиция «взятой» плитки. Смещение (catPage-startPage)*w компенсирует
    // прокрутку карусели при автолистании, чтобы плитка оставалась под пальцем.
    const setPos = (anim) => {
      const w = catViewport.offsetWidth || 1;
      chip.style.transition = anim ? 'transform .26s cubic-bezier(.32,.72,0,1)' : 'none';
      chip.style.transform = `translate(${(lastX - sx) + (catPage - startPage) * (w + CAT_PAGE_GAP)}px, ${lastY - sy}px) scale(1.12)`;
      updateGhost();
      updateTrash();
    };
    const clearEdge = () => { clearTimeout(edgeTimer); edgeTimer = null; edgeDir = 0; };
    // Насколько плитка «скрылась» за краем зоны категорий (>20% ширины → лист).
    const checkEdge = () => {
      const vp = catViewport.getBoundingClientRect();
      const r = chip.getBoundingClientRect();
      const thr = r.width * 0.2;
      if (vp.left - r.left > thr) return -1;   // за левым краем → предыдущая страница
      if (r.right - vp.right > thr) return 1;   // за правым краем → следующая
      return 0;
    };
    const fireEdge = () => {
      const dir = edgeDir; edgeTimer = null;
      const target = catPage + dir;
      if (dir === 0 || target < 0 || target >= pages) { edgeDir = 0; return; }
      catPage = target;
      applyTrack(true);
      setPos(true);   // синхронно с лентой — плитка визуально «стоит» под пальцем
      highlight(lastX, lastY);
      // Пока палец удерживается у края и есть куда листать — продолжаем.
      if (checkEdge() === dir && catPage + dir >= 0 && catPage + dir < pages) {
        edgeTimer = setTimeout(fireEdge, 450);
      } else { edgeDir = 0; }
    };
    const armEdge = () => {
      const e = pages > 1 ? checkEdge() : 0;
      if (e === edgeDir) return;
      clearTimeout(edgeTimer); edgeTimer = null; edgeDir = e;
      if (e !== 0) edgeTimer = setTimeout(fireEdge, 350);
    };
    const startDrag = () => {
      dragging = true; dragActive = true; longFired = true; startPage = catPage;
      chip.classList.add('dragging'); enterReorder();
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
      // Контур «+» на освобождаемой ячейке (под самой плиткой). Координаты —
      // относительно .cat-page (у неё position: relative), трансформы плитки
      // на offsetLeft/Top не влияют, поэтому это её «родная» позиция.
      removeGhost();
      ghost = el('.cat-chip.cat-add.cat-add-ghost', {}, [el('.cat-add-plus', { text: '+' })]);
      ghost.style.left = chip.offsetLeft + 'px';
      ghost.style.top = chip.offsetTop + 'px';
      ghost.style.width = chip.offsetWidth + 'px';
      ghost.style.height = chip.offsetHeight + 'px';
      chip.parentElement.appendChild(ghost);
      setPos(false);
    };
    const down = (x, y) => { sx = x; sy = y; lastX = x; lastY = y; moved = false; dragging = false; longFired = false; timer = setTimeout(startDrag, 350); };
    const move = (x, y, e) => {
      if (!dragging) { if (Math.abs(x - sx) > 10 || Math.abs(y - sy) > 10) { moved = true; clearTimeout(timer); } return; }
      if (e && e.cancelable) e.preventDefault();
      lastX = x; lastY = y;
      setPos(false);
      const d = highlight(x, y);
      if (d && d.kind === 'trash') clearEdge(); else armEdge();
    };
    const up = (x, y) => {
      clearTimeout(timer); clearEdge();
      if (dragging) {
        const d = resolveDrop(x, y);
        chip.classList.remove('dragging'); chip.style.transition = ''; chip.style.transform = ''; clearTargets();
        removeGhost();
        exitReorder();
        dragging = false; setTimeout(() => { dragActive = false; }, 60);
        if (d && d.kind === 'trash') handleTrash(cat);
        else if (d && d.kind === 'chip') store.reorderCategorySwap(homeMode, cat.id, d.el.dataset.catId);
        else if (d && d.kind === 'empty') store.moveCategoryToSlot(homeMode, cat.id, parseInt(d.el.dataset.slot, 10) || 0);
        return;
      }
      if (!moved && !longFired) commit(cat.id);
    };
    chip.addEventListener('touchstart', (e) => { const p = e.changedTouches[0]; down(p.clientX, p.clientY); }, { passive: true });
    chip.addEventListener('touchmove', (e) => { const p = e.changedTouches[0]; move(p.clientX, p.clientY, e); }, { passive: false });
    chip.addEventListener('touchend', (e) => { const p = e.changedTouches[0]; up(p.clientX, p.clientY); }, { passive: true });
    chip.addEventListener('mousedown', (e) => {
      down(e.clientX, e.clientY);
      const mm = (ev) => move(ev.clientX, ev.clientY, ev);
      const mu = (ev) => { up(ev.clientX, ev.clientY); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
      window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
    });
  };
  for (let p = 0; p < pages; p++) {
    const grid = el('.cat-page');
    for (let i = 0; i < CATS_PER_PAGE; i++) {
      const slot = p * CATS_PER_PAGE + i;
      const c = bySlot.get(slot);
      if (c) {
        const badge = (c.currency && c.currency !== base)
          ? el('.cat-cur', { text: (CURRENCIES[c.currency] && CURRENCIES[c.currency].symbol) || c.currency }) : null;
        const chip = el('button.cat-chip', { type: 'button', style: { '--chip': c.color } },
          [catIcon(c), el('.cat-name', { text: store.categoryName(c) }), badge]);
        // Тап — записать операцию; долгое нажатие — перетащить (сменить место).
        // Редактирование категорий — через меню «Категории».
        attachChipDrag(chip, c);
        grid.appendChild(chip);
      } else {
        grid.appendChild(el('button.cat-chip.cat-add', { type: 'button', 'aria-label': t('add_category'), dataset: { slot: String(slot) }, onClick: () => openAdd(slot) }, [el('.cat-add-plus', { text: '+' })]));
      }
    }
    catTrack.appendChild(grid);
  }
  catViewport.appendChild(catTrack);
  const catDots = el('.cat-dots');
  const renderDots = () => { clear(catDots); if (pages > 1) for (let i = 0; i < pages; i++) catDots.appendChild(el('.cat-dot', { class: i === catPage ? 'active' : '' })); };
  const applyTrack = (animate) => {
    const w = catViewport.offsetWidth;
    catTrack.style.transition = animate ? 'transform .26s cubic-bezier(.32,.72,0,1)' : 'none';
    catTrack.style.transform = `translateX(${-catPage * (w + CAT_PAGE_GAP)}px)`;
    renderDots();
  };
  const catPager = el('.cat-pager', {}, [catViewport, catDots]);
  renderDots();
  requestAnimationFrame(() => applyTrack(false));

  // Карусель категорий (перетаскивание пальцем внутри зоны).
  let csx = 0, csy = 0, cdir = null, cdrag = false;
  const cStart = (x, y) => { if (dragActive) { cdrag = false; return; } csx = x; csy = y; cdir = null; cdrag = true; catTrack.style.transition = 'none'; };
  const cMove = (x, y, e) => {
    if (!cdrag || dragActive) return;
    const dx = x - csx, dy = y - csy;
    if (cdir === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) cdir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (cdir === 'h') {
      if (e && e.cancelable) e.preventDefault();
      const w = catViewport.offsetWidth;
      let pos = -catPage * (w + CAT_PAGE_GAP) + dx;
      const min = -(pages - 1) * (w + CAT_PAGE_GAP);
      if (pos > 0) pos *= 0.3; else if (pos < min) pos = min + (pos - min) * 0.3;
      catTrack.style.transform = `translateX(${pos}px)`;
    }
  };
  const cEnd = (x) => {
    if (!cdrag) return; cdrag = false;
    if (cdir !== 'h') return;
    const w = catViewport.offsetWidth, dx = x - csx;
    if (dx < -w * 0.2 && catPage < pages - 1) catPage++;
    else if (dx > w * 0.2 && catPage > 0) catPage--;
    applyTrack(true);
  };
  catPager.addEventListener('touchstart', (e) => { const p = e.changedTouches[0]; cStart(p.clientX, p.clientY); }, { passive: true });
  catPager.addEventListener('touchmove', (e) => { const p = e.changedTouches[0]; cMove(p.clientX, p.clientY, e); }, { passive: false });
  catPager.addEventListener('touchend', (e) => { const p = e.changedTouches[0]; cEnd(p.clientX); }, { passive: true });
  catPager.addEventListener('mousedown', (e) => {
    cStart(e.clientX, e.clientY);
    const mm = (ev) => cMove(ev.clientX, ev.clientY, ev);
    const mu = (ev) => { cEnd(ev.clientX); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
  });

  // Кнопка «+» над «3» (по умолчанию, для правшей) либо над «1» (настройка).
  const plusLeft = !!store.getState().settings.sumPlusLeft;
  const plusBtn = el('button.entry-plus', { type: 'button', 'aria-label': '+', text: '+', class: plusLeft ? 'left' : 'right' });
  // Короткий тап — применить текущий оператор; долгое нажатие — переключить
  // «+» ⇄ «×» (визуально знак «+» поворачивается на 45° и становится «×»).
  const applyOpMode = () => {
    plusBtn.classList.toggle('is-mul', opMode === '×');
    plusBtn.setAttribute('aria-label', opMode === '×' ? '×' : '+');
  };
  attachHold(plusBtn, pressOp, () => { opMode = opMode === '×' ? '+' : '×'; applyOpMode(); });
  applyOpMode();
  const amountRow = el('.entry-amount-row', {}, [amountEl, plusBtn]);
  pager.append(el('.entry-block', {}, [tapeEl, amountRow, keypad]), catPager);

  // --- Мини-история. Число строк управляется настройкой «Подгонять историю
  // под экран»: ВКЛ — сколько помещается до низа экрана; ВЫКЛ — до «Максимум
  // строк» (список прокручивается). ---
  const list = store.sortedTransactions().filter((x) => !split || x.type === homeMode);
  const fit = settings.fitHistory !== false;
  const maxRows = Math.max(1, parseInt(settings.maxRows, 10) || 10);
  const histWrap = el('.mini-hist');
  const head = el('.mini-hist-head', {}, [el('span', { text: t('history') })]);
  histWrap.appendChild(head);
  pager.appendChild(histWrap);

  root.appendChild(pager);
  attachPagerSwipe(pager, root);
  renderAmount();

  if (!list.length) {
    histWrap.appendChild(el('.mini-empty', { text: t('no_transactions') }));
    return;
  }

  const group = el('.trx-group');
  histWrap.appendChild(group);
  let shown = 0;
  if (fit && !suppressHeader) {
    // Показываем сколько помещается, но не меньше 5 последних (если замер даёт
    // мало из-за высокой клавиатуры — не оставляем пустое место). При построении
    // «встречной» страницы (suppressHeader) замер невозможен (узел вне DOM) —
    // используем простой лимит из ветки ниже.
    const vpBottom = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const limitY = vpBottom - 10;
    const minShow = Math.min(5, list.length);
    for (const trx of list) {
      const row = renderRow(trx, base);
      group.appendChild(row);
      shown++;
      if (shown >= minShow && row.getBoundingClientRect().bottom > limitY) { group.removeChild(row); shown--; break; }
    }
  } else {
    for (const trx of list.slice(0, maxRows)) { group.appendChild(renderRow(trx, base)); shown++; }
  }
  if (list.length > shown) {
    // Кнопка «Развернуть историю» — под последней строкой списка.
    histWrap.appendChild(el('button.mini-more', { type: 'button', text: t('expand_history'), onClick: () => openSearch({ type: scope, title: t('history') }) }));
  }
}

// Группировка операций по дням: заголовок дня + карточка-группа со строками.
function renderGroupedRows(container, items, base) {
  let lastDate = null, group = null;
  for (const trx of items) {
    if (trx.date !== lastDate) {
      container.appendChild(el('.trx-day', { text: dayLabel(trx.date) }));
      lastDate = trx.date;
      group = el('.trx-group');
      container.appendChild(group);
    }
    group.appendChild(renderRow(trx, base));
  }
}

// Ячейка суммы операции по текущему сценарию отображения валют:
//  • сценарий 1 (convertAll=false): крупно — в валюте операции; снизу мелко —
//    в основной валюте (если валюта операции отличается от основной);
//  • сценарий 2 (convertAll=true): крупно — в текущей валюте (с конвертацией);
//    снизу мелко — в основной (если текущая ≠ основной).
// Прошлые данные не меняются: у каждой операции своя валюта и сумма.
export function trxAmountNode(trx) {
  const base = store.baseCurrency();
  const sign = trx.type === 'income' ? 1 : -1;
  const baseVal = store.baseAmount(trx);
  let mainVal, mainCur, subText = null;
  if (store.getState().settings.convertAll) {
    mainCur = store.currentCurrency();
    mainVal = store.convertFromBase(baseVal, mainCur);
    if (mainCur !== base) subText = money(baseVal, base);
  } else {
    mainCur = trx.currency;
    mainVal = Number(trx.amount) || 0;
    if (trx.currency !== base) subText = money(baseVal, base);
  }
  return el('.trx-amount', {}, [
    el('.trx-amount-main', { class: trx.type, text: signedMoney(mainVal * sign, mainCur) }),
    subText ? el('.trx-amount-orig', { text: subText }) : null,
  ]);
}

function renderRow(trx, base) {
  const cat = store.categoryById(trx.categoryId);
  // Архивная категория (удалена из меню, но история сохранена) — иконка и имя
  // остаются, с маленькой оранжевой точкой-пометкой на углу иконки.
  const archived = !!(cat && cat.archived);
  const iconNode = archived
    ? el('.trx-icon-wrap', {}, [catIcon(cat, 'trx-icon'), el('.trx-archived-dot', { 'aria-label': t('archived_category') })])
    : catIcon(cat, 'trx-icon');
  const content = el('.trx-row', {}, [
    iconNode,
    el('.trx-main', {}, [
      el('.trx-title', { text: cat ? store.categoryName(cat) : '—' }),
      trx.note ? el('.trx-note', { text: trx.note }) : null,
    ]),
    trxAmountNode(trx),
  ]);
  return wrapSwipeRow(content, trx);
}

// Одновременно открыт только один ряд.
let closeOpenSwipe = null;

// Оборачивает строку истории в свайп-контейнер: строка выдвигается единой
// плашкой — влево показывается кнопка удаления (шириной со слово «Удалить»),
// вправо — поле комментария (остаётся «хвост», чтобы потянуть обратно).
// Реакция ТОЛЬКО на долгое нажатие (→ редактирование); короткий тап ничего
// не делает, чтобы исключить случайные нажатия. Никаких всплывающих окон.
export function wrapSwipeRow(content, trx) {
  content.classList.add('swipe-content');
  const del = el('button.swipe-del', { type: 'button', text: t('delete') });
  const noteInput = el('input.swipe-note-input', { type: 'text', placeholder: t('note_ph'), value: trx.note || '' });
  const comment = el('.swipe-comment', {}, [noteInput]);
  const wrap = el('.swipe-wrap', {}, [comment, del, content]);

  const TAIL = 64;   // сколько строки остаётся видно справа, чтобы потянуть обратно
  const SPRING = 'transform .32s cubic-bezier(.34,1.36,.5,1)'; // пружинка с лёгким перелётом
  const EASE = 'transform .22s ease';
  let COMMENT_W = 0, DEL_W = 0;
  const measure = () => {
    COMMENT_W = Math.max(140, wrap.offsetWidth - TAIL);
    DEL_W = del.offsetWidth || 96;
    comment.style.width = COMMENT_W + 'px';
  };

  let openState = 0; // 0 закрыт, -1 удаление, 1 комментарий

  // Параллакс трёх слоёв: строка двигается на x; плашка комментария выезжает
  // слева синхронно (единая плашка), кнопка удаления — справа. Обе спрятаны за
  // краями, поэтому при свайпе влево комментарий не «просвечивает».
  const place = (x) => {
    content.style.transform = `translateX(${x}px)`;
    comment.style.transform = `translateX(${-COMMENT_W + Math.max(0, x)}px)`;
    del.style.transform = `translateX(${DEL_W + Math.min(0, x)}px)`;
  };
  const anim = (on) => { content.style.transition = comment.style.transition = del.style.transition = on || 'none'; };

  // Комментарий сохраняется сам при закрытии (обратным свайпом за «хвост»,
  // тапом по другой строке или Enter) — отдельная кнопка-галочка не нужна.
  const commitNote = () => {
    const v = noteInput.value.trim();
    if (v !== (trx.note || '')) store.saveTransaction({ id: trx.id, note: v });
  };
  const closeFn = () => { openState = 0; anim(EASE); place(0); if (document.activeElement === noteInput) noteInput.blur(); commitNote(); if (closeOpenSwipe === closeFn) closeOpenSwipe = null; };
  const openDel = () => { if (closeOpenSwipe && closeOpenSwipe !== closeFn) closeOpenSwipe(); openState = -1; anim(SPRING); place(-DEL_W); closeOpenSwipe = closeFn; };
  const openComment = () => { if (closeOpenSwipe && closeOpenSwipe !== closeFn) closeOpenSwipe(); openState = 1; anim(SPRING); place(COMMENT_W); closeOpenSwipe = closeFn; setTimeout(() => noteInput.focus(), 220); };

  del.addEventListener('click', async (e) => { e.stopPropagation(); if (await confirmDialog(t('confirm_delete'))) await store.deleteTransaction(trx.id); });
  noteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { noteInput.blur(); closeFn(); } });

  // Резинка за пределами открытого положения (сопротивление у краёв).
  const clamp = (nx) => {
    if (nx > COMMENT_W) return COMMENT_W + (nx - COMMENT_W) * 0.25;
    if (nx < -DEL_W) return -DEL_W + (nx + DEL_W) * 0.25;
    return nx;
  };

  let sx = 0, sy = 0, dir = null, dragging = false, longFired = false, longTimer = null, startX = 0;
  const begin = (x, y, target) => {
    measure();
    sx = x; sy = y; dir = null; dragging = true; longFired = false;
    startX = openState === -1 ? -DEL_W : openState === 1 ? COMMENT_W : 0;
    anim(false);
    // Долгое нажатие → редактирование только для закрытой строки. Когда открыт
    // комментарий, касание поля ввода/кнопки не должно запускать таймер (чтобы
    // можно было спокойно печатать), но обратный свайп по всей плашке — закрывал.
    const interactive = !!(target && target.closest && target.closest('.swipe-note-input, .swipe-del'));
    if (openState === 0 && !interactive) {
      longTimer = setTimeout(() => { longFired = true; dragging = false; closeFn(); openTransactionForm(trx); }, 500);
    }
  };
  const move = (x, y, e) => {
    if (!dragging) return;
    const dx = x - sx, dy = y - sy;
    if (dir === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) { dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'; clearTimeout(longTimer); }
    if (dir === 'h') {
      if (e && e.cancelable) e.preventDefault();
      place(clamp(startX + dx));
    }
  };
  const end = (x) => {
    clearTimeout(longTimer);
    if (!dragging) return;
    dragging = false;
    // Вертикаль или короткий тап — ничего не делаем (защита от случайных
    // нажатий). Редактирование срабатывает только по долгому нажатию (выше).
    if (dir !== 'h') return;
    const moved = x - sx;
    // Магнит: доводим до ближайшего устойчивого положения.
    if (openState === 0) {
      if (moved < -DEL_W * 0.5) openDel();
      else if (moved > COMMENT_W * 0.4) openComment();
      else closeFn();
    } else if (openState === -1) {
      if (moved > DEL_W * 0.35) closeFn(); else openDel();
    } else {
      if (moved < -COMMENT_W * 0.25) closeFn(); else openComment();
    }
  };
  // Слушаем всю плашку (.swipe-wrap), а не только видимую строку: когда открыт
  // комментарий, обратный свайп работает по всей его области, а не только «за
  // иконку», и не «проваливается» в листание страницы.
  wrap.addEventListener('touchstart', (e) => { const p = e.changedTouches[0]; begin(p.clientX, p.clientY, e.target); }, { passive: true });
  wrap.addEventListener('touchmove', (e) => { const p = e.changedTouches[0]; move(p.clientX, p.clientY, e); }, { passive: false });
  wrap.addEventListener('touchend', (e) => { const p = e.changedTouches[0]; end(p.clientX); }, { passive: true });
  wrap.addEventListener('mousedown', (e) => {
    begin(e.clientX, e.clientY, e.target);
    const mm = (ev) => move(ev.clientX, ev.clientY, ev);
    const mu = (ev) => { end(ev.clientX); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
  });
  return wrap;
}

export function dayLabel(iso) {
  const today = dateISO();
  const y = dateISO(new Date(Date.now() - 86400000));
  if (iso === today) return t('today');
  if (iso === y) return t('yesterday');
  return formatDate(iso, { day: 'numeric', month: 'long', year: 'numeric' });
}
