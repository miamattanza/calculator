// views/transactions.js — экран «Обзор»: баланс, период, список операций,
// а также форма создания/редактирования операции (используется и на других экранах).

import * as store from '../store.js';
import { t } from '../i18n.js';
import { el, clear, sheet, field, segmented, toast, confirmDialog, catIcon } from '../dom.js';
import { money, signedMoney, formatDate, dateISO, CURRENCIES } from '../format.js';
import { openSearch } from './search.js';
import { openCategoryEditor } from './settings.js';

// ---- Форма операции (переиспользуемая) ----

export function openTransactionForm(existing) {
  const base = store.baseCurrency();
  const model = existing ? { ...existing } : {
    type: 'expense', amount: '', currency: base, rate: 1,
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

  // Валюта + курс
  const currencySelect = el('select.select', {}, Object.keys(CURRENCIES).map((code) =>
    el('option', { value: code, selected: code === model.currency }, `${code} ${CURRENCIES[code].symbol}`)));
  const rateField = field(t('rate_to_base', { base }), el('input.select', {
    type: 'text', inputmode: 'decimal', value: model.rate,
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
    if (model.currency === base) { model.rate = 1; rateField.input.value = 1; }
    syncRateVisibility();
  });

  // Категории
  const catGrid = el('.cat-grid');
  function renderCategories() {
    clear(catGrid);
    const cats = store.categoriesByType(model.type);
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
      }, [el('.cat-emoji', { text: c.icon }), el('.cat-name', { text: store.categoryName(c) })]);
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
    field(t('type'), typeSeg).row,
    el('.amount-wrap', {}, [amountInput, el('.amount-cur', { text: CURRENCIES[base].symbol })]),
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
let catPage = 0;          // текущая страница категорий
const CATS_PER_PAGE = 8;

// Переход к конкретному окну (без зацикливания: expense — левое, income —
// правое; на краю страница просто возвращается на место).
function setMode(root, mode, incomingFrom = null) {
  if (mode === homeMode) {
    const pager = root.querySelector('.pager');
    if (pager) { pager.style.transition = 'transform .2s ease, opacity .2s ease'; pager.style.transform = 'translateX(0)'; pager.style.opacity = '1'; }
    return;
  }
  homeMode = mode;
  catPage = 0;
  renderHome(root);
  if (incomingFrom != null) {
    const pager = root.querySelector('.pager');
    if (pager) {
      pager.style.transition = 'none';
      pager.style.transform = `translateX(${incomingFrom}px)`;
      pager.style.opacity = '0';
      requestAnimationFrame(() => {
        pager.style.transition = 'transform .26s ease, opacity .26s ease';
        pager.style.transform = 'translateX(0)';
        pager.style.opacity = '1';
      });
    }
  }
}

// Перетаскивание страницы пальцем по всему экрану + плавный переход между
// окнами «Расходы»/«Доходы». Свайпы, начатые в зоне категорий (.cat-pager),
// пропускаются — там своя постраничная листалка.
function attachPagerSwipe(pager, root) {
  let sx = 0, sy = 0, dir = null, dragging = false, skip = false, w = window.innerWidth;
  // Свайпы, начатые в зоне категорий или на строке истории, не переключают окно.
  const inCat = (target) => !!(target && target.closest && target.closest('.cat-pager, .trx-row'));
  const start = (x, y) => { sx = x; sy = y; dir = null; dragging = true; w = window.innerWidth || pager.offsetWidth; pager.style.transition = 'none'; };
  const move = (x, y, e) => {
    if (!dragging || skip) return;
    const dx = x - sx, dy = y - sy;
    if (dir === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (dir === 'h') {
      if (e && e.cancelable) e.preventDefault();
      let d = dx;
      const target = dx < 0 ? 'income' : 'expense'; // влево → доходы, вправо → расходы
      if (target === homeMode) {
        // В эту сторону страницы нет: тугая резинка со стопом на ~40% ширины,
        // дальше листать нельзя.
        const max = w * 0.4;
        d = Math.sign(dx) * Math.min(Math.abs(dx) * 0.35, max);
      }
      pager.style.transform = `translateX(${d}px)`;
      pager.style.opacity = String(1 - Math.min(Math.abs(d) / w, 1) * 0.35);
    }
  };
  const end = (x, y) => {
    if (!dragging) return;
    dragging = false;
    if (skip) return;
    const dx = x - sx;
    if (dir !== 'h') { pager.style.transform = ''; pager.style.opacity = ''; return; }
    pager.style.transition = 'transform .24s ease, opacity .24s ease';
    const target = dx < 0 ? 'income' : 'expense'; // влево → доходы, вправо → расходы
    if (Math.abs(dx) > w * 0.25 && target !== homeMode) {
      const outX = dx < 0 ? -w : w;
      pager.style.transform = `translateX(${outX}px)`;
      pager.style.opacity = '0';
      setTimeout(() => setMode(root, target, dx < 0 ? w : -w), 190);
    } else {
      // край или недостаточный свайп — возвращаем страницу на место (без зацикливания)
      pager.style.transform = 'translateX(0)';
      pager.style.opacity = '1';
    }
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

// Кольцо-индикатор лимита для шапки.
function budgetRingSvg(ratio) {
  const NS = 'http://www.w3.org/2000/svg';
  const size = 26, sw = 3.5, r = (size - sw) / 2, cx = size / 2, c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));
  let color = 'var(--text-3)';
  if (ratio >= 1) color = '#8B1A1A'; else if (ratio >= 0.9) color = 'var(--red)'; else if (ratio >= 0.8) color = '#FF9500';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('class', ratio >= 1 ? 'budget-ring-svg over' : 'budget-ring-svg');
  const mk = (stroke, dash) => {
    const el2 = document.createElementNS(NS, 'circle');
    el2.setAttribute('cx', cx); el2.setAttribute('cy', cx); el2.setAttribute('r', r);
    el2.setAttribute('fill', 'none'); el2.setAttribute('stroke', stroke); el2.setAttribute('stroke-width', sw);
    if (dash) { el2.setAttribute('stroke-dasharray', dash); el2.setAttribute('stroke-linecap', 'round'); el2.setAttribute('transform', `rotate(-90 ${cx} ${cx})`); }
    return el2;
  };
  svg.appendChild(mk('var(--sep)'));
  svg.appendChild(mk(color, `${clamped * c} ${c}`));
  return svg;
}

// Долгое нажатие (500мс) + обычный тап, с отменой при движении пальца.
function attachLongPress(node, { onTap, onLong }) {
  let timer = null, longFired = false, sx = 0, sy = 0, moved = false;
  const begin = (x, y) => { sx = x; sy = y; moved = false; longFired = false; timer = setTimeout(() => { longFired = true; if (onLong) onLong(); }, 500); };
  const track = (x, y) => { if (Math.abs(x - sx) > 10 || Math.abs(y - sy) > 10) { moved = true; clearTimeout(timer); } };
  const finish = () => { clearTimeout(timer); };
  node.addEventListener('touchstart', (e) => { const p = e.changedTouches[0]; begin(p.clientX, p.clientY); }, { passive: true });
  node.addEventListener('touchmove', (e) => { const p = e.changedTouches[0]; track(p.clientX, p.clientY); }, { passive: true });
  node.addEventListener('touchend', finish, { passive: true });
  node.addEventListener('click', (e) => { if (longFired) { e.preventDefault(); e.stopPropagation(); longFired = false; return; } if (!moved && onTap) onTap(); });
  node.addEventListener('mousedown', (e) => begin(e.clientX, e.clientY));
  node.addEventListener('mouseup', finish);
  node.addEventListener('mouseleave', finish);
}

// Всплывающий выбор валюты для категории — рядом с самой категорией.
function openCurrencyPopover(cat, anchor) {
  const base = store.baseCurrency();
  const cur = cat.currency || base;
  const backdrop = el('.pop-backdrop');
  const menu = el('.currency-pop');
  for (const code of Object.keys(CURRENCIES)) {
    menu.appendChild(el('button.cur-opt', {
      type: 'button', class: code === cur ? 'active' : '',
      onClick: async () => { await store.saveCategory({ id: cat.id, currency: code === base ? null : code }); close(); },
    }, `${CURRENCIES[code].symbol}  ${code}`));
  }
  backdrop.appendChild(menu);
  document.body.appendChild(backdrop);
  const r = anchor.getBoundingClientRect();
  const mw = 150;
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8)) + 'px';
  const below = r.bottom + 6;
  if (below + 240 > window.innerHeight) menu.style.top = Math.max(8, r.top - 244) + 'px';
  else menu.style.top = below + 'px';
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  requestAnimationFrame(() => backdrop.classList.add('open'));
  function close() { backdrop.classList.remove('open'); setTimeout(() => backdrop.remove(), 180); }
}

export function renderHome(root) {
  clear(root);
  root.classList.remove('fit-mode');
  const base = store.baseCurrency();
  const settings = store.getState().settings;
  const isExpense = homeMode === 'expense';
  const split = settings.splitHistory !== false;
  const scope = split ? homeMode : null;

  // Шапка: метка окна (цветом сектора) + компактный баланс.
  const modeLabel = document.getElementById('mode-label');
  if (modeLabel) { modeLabel.textContent = isExpense ? t('expense') : t('income'); modeLabel.className = isExpense ? 'expense' : 'income'; }
  const headBalance = document.getElementById('head-balance');
  if (headBalance) {
    headBalance.style.display = '';
    clear(headBalance);
    headBalance.append(
      el('.hb-label', { text: t('balance') }),
      el('.hb-value', { text: money(store.currentBalance(), base) }),
    );
  }

  // Сигнал лимита: круг-индикатор между меткой окна и балансом. Оранжевый ≥80%,
  // красный ≥90%, бордовый пульсирующий при превышении. Тап → «Бюджеты».
  const ringHost = document.getElementById('budget-ring');
  if (ringHost) {
    clear(ringHost);
    const bs = store.budgetOverallStatus();
    if (bs.has && !bs.muted) {
      ringHost.style.display = '';
      ringHost.appendChild(budgetRingSvg(bs.ratio));
      ringHost.onclick = () => document.dispatchEvent(new CustomEvent('go-section', { detail: 'budgets' }));
    } else {
      ringHost.style.display = 'none';
      ringHost.onclick = null;
    }
  }

  const pager = el('.pager.home-pager', { class: isExpense ? 'expense-mode' : 'income-mode' });

  // --- Табло суммы ---
  const amountEl = el('.entry-amount');
  const renderAmount = () => {
    const v = entryDigits ? parseInt(entryDigits, 10) : 0;
    amountEl.textContent = money(v, base);
    amountEl.classList.toggle('zero', v <= 0);
  };

  // --- Клавиатура (без подтверждения — запись по тапу на категорию) ---
  const keypad = el('.entry-keypad');
  const pressDigit = (d) => { if (entryDigits.length < 12) { entryDigits = (entryDigits === '0' ? '' : entryDigits) + d; renderAmount(); } };
  const del = () => { entryDigits = entryDigits.slice(0, -1); renderAmount(); };
  ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach((n) =>
    keypad.appendChild(el('button.key', { type: 'button', text: n, onClick: () => pressDigit(n) })));
  keypad.appendChild(el('button.key.key-zero', { type: 'button', text: '0', onClick: () => pressDigit('0') }));
  keypad.appendChild(el('button.key.key-del', { type: 'button', text: '⌫', 'aria-label': t('delete'), onClick: del }));

  const commit = async (categoryId) => {
    const v = entryDigits ? parseInt(entryDigits, 10) : 0;
    if (v <= 0) { amountEl.classList.add('shake'); setTimeout(() => amountEl.classList.remove('shake'), 400); return; }
    entryDigits = '';
    const cat = store.categoryById(categoryId);
    const cur = (cat && cat.currency) || base; // у категории может быть своя валюта
    await store.saveTransaction({ type: homeMode, amount: v, currency: cur, rate: 1, categoryId, date: dateISO(), note: '' });
    // saveTransaction → подписка → renderHome (табло сбрасывается, история обновляется)
  };

  // --- Категории: всегда 2 ряда по 4 (8 на страницу). Пустые ячейки — «+»,
  // открывают добавление новой категории. Страницы листаются свайпом-каруселью
  // (плавно, без пробелов). Недавние категории — вперёд. >16 → доп. страницы. ---
  const cats = store.categoriesByRecency(homeMode);
  // +1 — чтобы всегда была хотя бы одна пустая ячейка «+» для добавления.
  const pages = Math.max(1, Math.ceil((cats.length + 1) / CATS_PER_PAGE));
  if (catPage >= pages) catPage = 0;
  const openAdd = () => openCategoryEditor(null, () => {}, homeMode);

  const catViewport = el('.cat-viewport');
  const catTrack = el('.cat-track');
  for (let p = 0; p < pages; p++) {
    const grid = el('.cat-page');
    for (let i = 0; i < CATS_PER_PAGE; i++) {
      const c = cats[p * CATS_PER_PAGE + i];
      if (c) {
        const badge = (c.currency && c.currency !== base)
          ? el('.cat-cur', { text: (CURRENCIES[c.currency] && CURRENCIES[c.currency].symbol) || c.currency }) : null;
        const chip = el('button.cat-chip', { type: 'button', style: { '--chip': c.color } },
          [catIcon(c), el('.cat-name', { text: store.categoryName(c) }), badge]);
        // Тап — записать операцию; долгое нажатие — выбрать валюту категории.
        attachLongPress(chip, { onTap: () => commit(c.id), onLong: () => openCurrencyPopover(c, chip) });
        grid.appendChild(chip);
      } else {
        grid.appendChild(el('button.cat-chip.cat-add', { type: 'button', 'aria-label': t('add_category'), onClick: openAdd }, [el('.cat-add-plus', { text: '+' })]));
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
    catTrack.style.transform = `translateX(${-catPage * w}px)`;
    renderDots();
  };
  const catPager = el('.cat-pager', {}, [catViewport, catDots]);
  renderDots();
  requestAnimationFrame(() => applyTrack(false));

  // Карусель категорий (перетаскивание пальцем внутри зоны).
  let csx = 0, csy = 0, cdir = null, cdrag = false;
  const cStart = (x, y) => { csx = x; csy = y; cdir = null; cdrag = true; catTrack.style.transition = 'none'; };
  const cMove = (x, y, e) => {
    if (!cdrag) return;
    const dx = x - csx, dy = y - csy;
    if (cdir === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) cdir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (cdir === 'h') {
      if (e && e.cancelable) e.preventDefault();
      const w = catViewport.offsetWidth;
      let pos = -catPage * w + dx;
      const min = -(pages - 1) * w;
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

  pager.append(el('.entry-block', {}, [amountEl, keypad]), catPager);

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
  if (fit) {
    // Показываем сколько помещается, но не меньше 5 последних (если замер даёт
    // мало из-за высокой клавиатуры — не оставляем пустое место).
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

function renderRow(trx, base) {
  const cat = store.categoryById(trx.categoryId);
  const sign = trx.type === 'income' ? 1 : -1;
  const amountBase = store.baseAmount(trx) * sign;
  const showOrig = trx.currency !== base;
  const content = el('.trx-row', {}, [
    catIcon(cat, 'trx-icon'),
    el('.trx-main', {}, [
      el('.trx-title', { text: cat ? store.categoryName(cat) : '—' }),
      trx.note ? el('.trx-note', { text: trx.note }) : null,
    ]),
    el('.trx-amount', {}, [
      el('.trx-amount-main', { class: trx.type, text: signedMoney(amountBase, base) }),
      showOrig ? el('.trx-amount-orig', { text: money(trx.amount, trx.currency) }) : null,
    ]),
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
  const begin = (x, y) => {
    measure();
    sx = x; sy = y; dir = null; dragging = true; longFired = false;
    startX = openState === -1 ? -DEL_W : openState === 1 ? COMMENT_W : 0;
    anim(false);
    longTimer = setTimeout(() => { longFired = true; dragging = false; closeFn(); openTransactionForm(trx); }, 500);
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
  content.addEventListener('touchstart', (e) => { const p = e.changedTouches[0]; begin(p.clientX, p.clientY); }, { passive: true });
  content.addEventListener('touchmove', (e) => { const p = e.changedTouches[0]; move(p.clientX, p.clientY, e); }, { passive: false });
  content.addEventListener('touchend', (e) => { const p = e.changedTouches[0]; end(p.clientX); }, { passive: true });
  content.addEventListener('mousedown', (e) => {
    begin(e.clientX, e.clientY);
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
