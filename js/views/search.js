// views/search.js — поиск по истории операций с фильтрами:
// текст (заметка/категория), категория, диапазон дат, диапазон сумм.

import * as store from '../store.js';
import { t } from '../i18n.js';
import { el, clear, sheet, field, rowCols } from '../dom.js';
import { money, signedMoney, formatDate } from '../format.js';
import { openTransactionForm } from './transactions.js';

export function openSearch(initial = {}) {
  const base = store.baseCurrency();
  const f = {
    query: '', categoryId: '', dateFrom: '', dateTo: '', amountMin: '', amountMax: '',
    type: initial.type || '',
  };

  const queryInput = el('input.select', { type: 'search', placeholder: t('search_hint') });
  const cats = initial.type ? store.categoriesByType(initial.type) : store.getState().categories;
  const catSelect = el('select.select', {}, [
    el('option', { value: '' }, t('all_categories')),
    ...cats.map((c) => el('option', { value: c.id }, `${c.icon} ${c.name}`)),
  ]);
  const dateFrom = el('input.select', { type: 'date' });
  const dateTo = el('input.select', { type: 'date' });
  const amtMin = el('input.select', { type: 'number', inputmode: 'decimal', placeholder: '0' });
  const amtMax = el('input.select', { type: 'number', inputmode: 'decimal', placeholder: '∞' });

  const bind = (node, key, evt = 'input') =>
    node.addEventListener(evt, () => { f[key] = node.value; run(); });
  bind(queryInput, 'query');
  bind(catSelect, 'categoryId', 'change');
  bind(dateFrom, 'dateFrom', 'change');
  bind(dateTo, 'dateTo', 'change');
  bind(amtMin, 'amountMin');
  bind(amtMax, 'amountMax');

  const summary = el('.search-summary');
  const results = el('.search-results');

  const resetBtn = el('button.btn-danger', {
    type: 'button', text: t('reset_filters'),
    onClick: () => {
      Object.keys(f).forEach((k) => { f[k] = ''; });
      f.type = initial.type || '';
      queryInput.value = ''; catSelect.value = ''; dateFrom.value = '';
      dateTo.value = ''; amtMin.value = ''; amtMax.value = '';
      run();
    },
  });

  const body = el('.form', {}, [
    field(t('search'), queryInput).row,
    field(t('category'), catSelect).row,
    rowCols(field(t('date_from'), dateFrom).row, field(t('date_to'), dateTo).row),
    rowCols(field(t('amount_from'), amtMin).row, field(t('amount_to'), amtMax).row),
    resetBtn,
    summary,
    results,
  ]);

  function run() {
    const list = store.searchTransactions(f);
    const net = list.reduce((s, trx) => s + store.baseAmount(trx) * (trx.type === 'income' ? 1 : -1), 0);
    summary.textContent = `${t('found')}: ${list.length} · ${money(net, base)}`;
    clear(results);
    if (!list.length) {
      results.appendChild(el('.empty-inline', { text: t('nothing_found') }));
      return;
    }
    const group = el('.trx-group');
    for (const trx of list) group.appendChild(row(trx, base));
    results.appendChild(group);
  }

  function row(trx, base) {
    const cat = store.categoryById(trx.categoryId);
    const amountBase = store.baseAmount(trx) * (trx.type === 'income' ? 1 : -1);
    return el('.trx-row', { onClick: () => { modal.close(); openTransactionForm(trx); } }, [
      el('.trx-icon', { style: { '--chip': cat ? cat.color : '#8E8E93' }, text: cat ? cat.icon : '🔖' }),
      el('.trx-main', {}, [
        el('.trx-title', { text: cat ? cat.name : '—' }),
        el('.trx-note', { text: (trx.note ? trx.note + ' · ' : '') + formatDate(trx.date, { day: 'numeric', month: 'short', year: 'numeric' }) }),
      ]),
      el('.trx-amount', {}, [
        el('.trx-amount-main', { class: trx.type, text: signedMoney(amountBase, base) }),
      ]),
    ]);
  }

  run();
  const modal = sheet(initial.title || t('search'), body, { full: true });
  setTimeout(() => queryInput.focus(), 300);
}
