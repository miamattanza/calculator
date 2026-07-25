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

function toggleMode(root, incomingFrom = null) {
  homeMode = homeMode === 'expense' ? 'income' : 'expense';
  catPage = 0;
  renderHome(root);
  // Анимация «въезда» новой страницы со стороны свайпа (эффект как в Instagram).
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
  const inCat = (target) => !!(target && target.closest && target.closest('.cat-pager'));
  const start = (x, y) => { sx = x; sy = y; dir = null; dragging = true; w = window.innerWidth || pager.offsetWidth; pager.style.transition = 'none'; };
  const move = (x, y, e) => {
    if (!dragging || skip) return;
    const dx = x - sx, dy = y - sy;
    if (dir === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (dir === 'h') {
      if (e && e.cancelable) e.preventDefault();
      pager.style.transform = `translateX(${dx}px)`;
      pager.style.opacity = String(1 - Math.min(Math.abs(dx) / w, 1) * 0.35);
    }
  };
  const end = (x, y) => {
    if (!dragging) return;
    dragging = false;
    if (skip) return;
    const dx = x - sx;
    if (dir !== 'h') { pager.style.transform = ''; pager.style.opacity = ''; return; }
    pager.style.transition = 'transform .24s ease, opacity .24s ease';
    if (Math.abs(dx) > w * 0.25) {
      const outX = dx < 0 ? -w : w;
      pager.style.transform = `translateX(${outX}px)`;
      pager.style.opacity = '0';
      setTimeout(() => toggleMode(root, dx < 0 ? w : -w), 190);
    } else {
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
    await store.saveTransaction({ type: homeMode, amount: v, currency: base, rate: 1, categoryId, date: dateISO(), note: '' });
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
        grid.appendChild(el('button.cat-chip', {
          type: 'button', style: { '--chip': c.color }, onClick: () => commit(c.id),
        }, [catIcon(c), el('.cat-name', { text: store.categoryName(c) })]));
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
    head.appendChild(el('button.mini-more', { type: 'button', text: t('expand_history'), onClick: () => openSearch({ type: scope, title: t('history') }) }));
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
  return el('.trx-row', { onClick: () => openTransactionForm(trx) }, [
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
}

function dayLabel(iso) {
  const today = dateISO();
  const y = dateISO(new Date(Date.now() - 86400000));
  if (iso === today) return t('today');
  if (iso === y) return t('yesterday');
  return formatDate(iso, { day: 'numeric', month: 'long' });
}
