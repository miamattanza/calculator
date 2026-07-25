// views/transactions.js — экран «Обзор»: баланс, период, список операций,
// а также форма создания/редактирования операции (используется и на других экранах).

import * as store from '../store.js';
import { t } from '../i18n.js';
import { el, clear, sheet, field, segmented, toast, confirmDialog } from '../dom.js';
import { money, signedMoney, formatDate, dateISO, CURRENCIES } from '../format.js';
import { openAmountPad } from '../keypad.js';
import { openSearch } from './search.js';

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

let currentPeriod = 'month';
let homeMode = 'expense'; // 'expense' | 'income'
let showAllHistory = false; // «Показать всю историю» в режиме с лимитом строк

function toggleMode(root, incomingFrom = null) {
  homeMode = homeMode === 'expense' ? 'income' : 'expense';
  showAllHistory = false;
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
// окнами «Расходы»/«Доходы». Вешается на .pager (пересоздаётся каждый рендер).
function attachPagerSwipe(pager, root) {
  let sx = 0, sy = 0, dir = null, dragging = false, w = window.innerWidth;
  const start = (x, y) => { sx = x; sy = y; dir = null; dragging = true; w = window.innerWidth || pager.offsetWidth; pager.style.transition = 'none'; };
  const move = (x, y, e) => {
    if (!dragging) return;
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
  pager.addEventListener('touchstart', (e) => { const p = e.changedTouches[0]; start(p.clientX, p.clientY); }, { passive: true });
  pager.addEventListener('touchmove', (e) => { const p = e.changedTouches[0]; move(p.clientX, p.clientY, e); }, { passive: false });
  pager.addEventListener('touchend', (e) => { const p = e.changedTouches[0]; end(p.clientX, p.clientY); }, { passive: true });
  pager.addEventListener('mousedown', (e) => {
    start(e.clientX, e.clientY);
    const mm = (ev) => move(ev.clientX, ev.clientY, ev);
    const mu = (ev) => { end(ev.clientX, ev.clientY); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
  });
}

// Быстрый ввод: клавиатура → выбор категории → сохранение.
export function openQuickAdd(type = homeMode) {
  openAmountPad({
    type,
    onConfirm: (amount) => openCategoryPicker(type, async (categoryId) => {
      await store.saveTransaction({
        type, amount, currency: store.baseCurrency(), rate: 1,
        categoryId, date: dateISO(), note: '',
      });
      toast(type === 'income' ? t('income') : t('expense'));
    }),
  });
}

function openCategoryPicker(type, onPick) {
  const body = el('.form');
  const grid = el('.cat-grid');
  for (const c of store.categoriesByType(type)) {
    grid.appendChild(el('button.cat-chip', {
      type: 'button', style: { '--chip': c.color },
      onClick: async () => { modal.close(); await onPick(c.id); },
    }, [el('.cat-emoji', { text: c.icon }), el('.cat-name', { text: store.categoryName(c) })]));
  }
  body.appendChild(grid);
  const modal = sheet(t('category'), body);
}

// Распознавание свайпов: горизонтальный — смена окна, вверх — клавиатура.
function onSwipe(node, { onHoriz, onUp }) {
  let sx = 0, sy = 0, tracking = false;
  const begin = (x, y) => { sx = x; sy = y; tracking = true; };
  const finish = (x, y) => {
    if (!tracking) return;
    tracking = false;
    const dx = x - sx, dy = y - sy;
    if (onHoriz && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) onHoriz(dx);
    else if (onUp && dy < -45 && Math.abs(dy) > Math.abs(dx)) onUp();
  };
  node.addEventListener('touchstart', (e) => { const p = e.changedTouches[0]; begin(p.clientX, p.clientY); }, { passive: true });
  node.addEventListener('touchend', (e) => { const p = e.changedTouches[0]; finish(p.clientX, p.clientY); }, { passive: true });
  node.addEventListener('mousedown', (e) => begin(e.clientX, e.clientY));
  node.addEventListener('mouseup', (e) => finish(e.clientX, e.clientY));
}

export function renderHome(root) {
  clear(root);
  const base = store.baseCurrency();
  const [from, to] = store.periodRange(currentPeriod);
  const totals = store.totals(from, to);
  const balance = store.currentBalance();
  const isExpense = homeMode === 'expense';

  // Название окна выносим в шапку рядом с гамбургером, цветом сектора.
  const modeLabel = document.getElementById('mode-label');
  if (modeLabel) {
    modeLabel.textContent = isExpense ? t('expense') : t('income');
    modeLabel.className = isExpense ? 'expense' : 'income';
  }

  const mainValue = isExpense ? totals.expense : totals.income;
  const otherLabel = isExpense ? t('income') : t('expense');
  const otherValue = isExpense ? totals.income : totals.expense;
  const otherSign = isExpense ? '+' : '−';

  // Карточка активного окна (синяя для расходов, зелёная для доходов).
  const card = el('.balance-card', { class: isExpense ? 'expense-mode' : 'income-mode' }, [
    el('.balance-value', { text: money(mainValue, base) }),
    el('.balance-split', {}, [
      el('.split-item', {}, [
        el('.split-label', { text: otherLabel }),
        el('.split-value', { text: otherSign + money(otherValue, base) }),
      ]),
      el('.split-item', {}, [
        el('.split-label', { text: t('balance') }),
        el('.split-value', { text: money(balance, base) }),
      ]),
    ]),
    el('.pad-hint', { text: '↑ ' + t('add_transaction') }),
  ]);

  const dots = el('.win-dots', {}, [
    el('.win-dot', { class: isExpense ? 'active' : '' }),
    el('.win-dot', { class: !isExpense ? 'active' : '' }),
  ]);

  const periodSeg = segmented([
    { value: 'week', label: t('period_week') },
    { value: 'month', label: t('period_month') },
    { value: 'year', label: t('period_year') },
    { value: 'all', label: t('period_all') },
  ], currentPeriod, (v) => { currentPeriod = v; showAllHistory = false; renderHome(root); });

  // Свайп вверх по карточке — клавиатура ввода. Горизонтальный свайп по всей
  // странице обрабатывает attachPagerSwipe.
  onSwipe(card, { onUp: () => openQuickAdd(homeMode) });

  const settings = store.getState().settings;
  const split = settings.splitHistory !== false;
  const scope = split ? homeMode : null;
  const list = store.sortedTransactions().filter((x) =>
    x.date >= from && x.date <= to && (!split || x.type === homeMode));
  const fit = settings.fitHistory !== false;

  // Вся страница окна — в контейнере .pager, который тащится пальцем по экрану.
  const pager = el('.pager');
  pager.append(card, dots, el('.period-bar', {}, [periodSeg]));

  // Строка поиска показывается только в режиме с лимитом (fitHistory выключен).
  if (!fit) {
    pager.appendChild(el('button.search-pill', {
      type: 'button', onClick: () => openSearch({ type: scope, title: t('history') }),
    }, [el('span.search-ico', { text: '🔍' }), el('span', { text: t('search') })]));
  }

  root.classList.toggle('fit-mode', !!(fit && list.length));
  root.appendChild(pager);
  attachPagerSwipe(pager, root);

  if (!list.length) {
    pager.appendChild(el('.empty', {}, [
      el('.empty-emoji', { text: isExpense ? '💸' : '💰' }),
      el('.empty-title', { text: t('no_transactions') }),
      el('.empty-hint', { text: t('no_transactions_hint') }),
    ]));
    return;
  }

  const listWrap = el('.trx-list');
  pager.appendChild(listWrap);

  if (!fit) {
    // Режим v1.3: список с прокруткой, ограниченный настраиваемым числом строк,
    // и кнопка «Показать всю историю».
    const maxRows = Math.max(1, parseInt(settings.maxRows, 10) || 10);
    const limit = showAllHistory ? list.length : maxRows;
    renderGroupedRows(listWrap, list.slice(0, limit), base);
    if (!showAllHistory && list.length > maxRows) {
      pager.appendChild(el('button.expand-history', {
        type: 'button', onClick: () => { showAllHistory = true; renderHome(root); },
      }, [
        el('span', { text: t('show_all_history') }),
        el('span.expand-count', { text: String(list.length) }),
      ]));
    }
    return;
  }

  // Режим подгонки под экран: считываем реальное положение кнопки «+» и
  // добавляем строки, пока они помещаются над ней. Это устойчиво к разным
  // размерам экрана и системным панелям — используем фактическую геометрию.
  const fabEl = document.getElementById('fab');
  const fabTop = fabEl ? fabEl.getBoundingClientRect().top : 0;
  const vpBottom = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const bottomAnchor = fabTop > 120 ? fabTop : vpBottom - 78;
  const limitY = bottomAnchor - 54; // зазор + место под кнопку «Развернуть историю»

  let overflow = false;
  let lastDate = null;
  let group = null;
  for (const trx of list) {
    if (trx.date !== lastDate) {
      const header = el('.trx-day', { text: dayLabel(trx.date) });
      listWrap.appendChild(header);
      if (header.getBoundingClientRect().bottom > limitY) { listWrap.removeChild(header); overflow = true; break; }
      lastDate = trx.date;
      group = el('.trx-group');
      listWrap.appendChild(group);
    }
    const row = renderRow(trx, base);
    group.appendChild(row);
    if (row.getBoundingClientRect().bottom > limitY) {
      group.removeChild(row);
      if (!group.childElementCount) {
        const hdr = group.previousElementSibling;
        listWrap.removeChild(group);
        if (hdr && hdr.classList.contains('trx-day')) listWrap.removeChild(hdr);
      }
      overflow = true; break;
    }
  }

  if (overflow) {
    pager.appendChild(el('button.expand-history', {
      type: 'button', onClick: () => openSearch({ type: scope, title: t('history') }),
    }, [
      el('span', { text: t('expand_history') }),
      el('span.expand-count', { text: String(list.length) }),
    ]));
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
    el('.trx-icon', { style: { '--chip': cat ? cat.color : '#8E8E93' }, text: cat ? cat.icon : '🔖' }),
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
