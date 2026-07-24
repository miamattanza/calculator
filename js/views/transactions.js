// views/transactions.js — экран «Обзор»: баланс, период, список операций,
// а также форма создания/редактирования операции (используется и на других экранах).

import * as store from '../store.js';
import { t } from '../i18n.js';
import { el, clear, sheet, field, segmented, toast, confirmDialog } from '../dom.js';
import { money, signedMoney, formatDate, dateISO, CURRENCIES } from '../format.js';

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
      }, [el('.cat-emoji', { text: c.icon }), el('.cat-name', { text: c.name })]);
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

let currentPeriod = 'month';

export function renderHome(root) {
  clear(root);
  const base = store.baseCurrency();
  const [from, to] = store.periodRange(currentPeriod);
  const totals = store.totals(from, to);

  // Карточка баланса
  const balance = store.currentBalance();
  const card = el('.balance-card', {}, [
    el('.balance-label', { text: t('balance') }),
    el('.balance-value', { text: money(balance, base) }),
    el('.balance-split', {}, [
      el('.split-item.income', {}, [
        el('.split-label', { text: t('income') }),
        el('.split-value', { text: '+' + money(totals.income, base) }),
      ]),
      el('.split-item.expense', {}, [
        el('.split-label', { text: t('expense') }),
        el('.split-value', { text: '−' + money(totals.expense, base) }),
      ]),
    ]),
  ]);

  const periodSeg = segmented([
    { value: 'week', label: t('period_week') },
    { value: 'month', label: t('period_month') },
    { value: 'year', label: t('period_year') },
    { value: 'all', label: t('period_all') },
  ], currentPeriod, (v) => { currentPeriod = v; renderHome(root); });

  root.append(card, el('.period-bar', {}, [periodSeg]));

  // Список операций, сгруппированный по дате
  const list = store.sortedTransactions().filter((x) => x.date >= from && x.date <= to);
  if (!list.length) {
    root.appendChild(el('.empty', {}, [
      el('.empty-emoji', { text: '📊' }),
      el('.empty-title', { text: t('no_transactions') }),
      el('.empty-hint', { text: t('no_transactions_hint') }),
    ]));
    return;
  }

  const groups = new Map();
  for (const trx of list) {
    if (!groups.has(trx.date)) groups.set(trx.date, []);
    groups.get(trx.date).push(trx);
  }

  const listWrap = el('.trx-list');
  for (const [date, items] of groups) {
    listWrap.appendChild(el('.trx-day', { text: dayLabel(date) }));
    const group = el('.trx-group');
    for (const trx of items) group.appendChild(renderRow(trx, base));
    listWrap.appendChild(group);
  }
  root.appendChild(listWrap);
}

function renderRow(trx, base) {
  const cat = store.categoryById(trx.categoryId);
  const sign = trx.type === 'income' ? 1 : -1;
  const amountBase = store.baseAmount(trx) * sign;
  const showOrig = trx.currency !== base;
  return el('.trx-row', { onClick: () => openTransactionForm(trx) }, [
    el('.trx-icon', { style: { '--chip': cat ? cat.color : '#8E8E93' }, text: cat ? cat.icon : '🔖' }),
    el('.trx-main', {}, [
      el('.trx-title', { text: cat ? cat.name : '—' }),
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
