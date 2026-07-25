// views/search.js — поиск по истории операций с фильтрами:
// текст (заметка/категория), категория, диапазон дат, диапазон сумм.

import * as store from '../store.js';
import { t } from '../i18n.js';
import { el, clear, sheet, field, rowCols, catIcon } from '../dom.js';
import { money, signedMoney, formatDate } from '../format.js';
import { openTransactionForm, attachRowActions } from './transactions.js';

export function openSearch(initial = {}) {
  const base = store.baseCurrency();
  const f = {
    query: '', categoryId: '', dateFrom: '', dateTo: '', amountMin: '', amountMax: '',
    type: initial.type || '',
  };

  // Строка поиска: слева — живой текстовый поиск, справа — квадратная кнопка
  // «Фильтр», которая раскрывает дополнительные фильтры (не покидая экран).
  const queryInput = el('input.hist-search', { type: 'search', placeholder: t('search_hint') });
  const filterBtn = el('button.filter-btn', { type: 'button', 'aria-label': t('filters') }, [filterIcon()]);
  const searchRow = el('.search-row', {}, [queryInput, filterBtn]);

  const cats = initial.type ? store.categoriesByType(initial.type) : store.getState().categories;
  const catSelect = el('select.select', {}, [
    el('option', { value: '' }, t('all_categories')),
    ...cats.map((c) => el('option', { value: c.id }, `${c.icon} ${store.categoryName(c)}`)),
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

  const resetBtn = el('button.btn-danger', {
    type: 'button', text: t('reset_filters'),
    onClick: () => {
      Object.keys(f).forEach((k) => { f[k] = ''; });
      f.type = initial.type || '';
      catSelect.value = ''; dateFrom.value = '';
      dateTo.value = ''; amtMin.value = ''; amtMax.value = '';
      run();
    },
  });

  // Панель фильтров — скрыта по умолчанию, раскрывается кнопкой «Фильтр».
  const filterPanel = el('.filter-panel', {}, [
    field(t('category'), catSelect).row,
    rowCols(field(t('date_from'), dateFrom).row, field(t('date_to'), dateTo).row),
    rowCols(field(t('amount_from'), amtMin).row, field(t('amount_to'), amtMax).row),
    resetBtn,
  ]);
  let filtersOpen = false;
  filterBtn.addEventListener('click', () => {
    filtersOpen = !filtersOpen;
    filterPanel.classList.toggle('open', filtersOpen);
    filterBtn.classList.toggle('active', filtersOpen);
  });

  const summary = el('.search-summary');
  const results = el('.search-results');

  const body = el('.form', {}, [
    searchRow,
    filterPanel,
    summary,
    results,
  ]);

  function run() {
    const list = store.searchTransactions(f);
    const net = list.reduce((s, trx) => s + store.baseAmount(trx) * (trx.type === 'income' ? 1 : -1), 0);
    summary.textContent = `${t('found')}: ${list.length} · ${money(net, base)}`;
    // Отметка на кнопке, если задан хотя бы один дополнительный фильтр.
    const adv = !!(f.categoryId || f.dateFrom || f.dateTo || f.amountMin || f.amountMax);
    filterBtn.classList.toggle('has-filters', adv);
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
    const row = el('.trx-row', {}, [
      catIcon(cat, 'trx-icon'),
      el('.trx-main', {}, [
        el('.trx-title', { text: cat ? store.categoryName(cat) : '—' }),
        el('.trx-note', { text: (trx.note ? trx.note + ' · ' : '') + formatDate(trx.date, { day: 'numeric', month: 'short', year: 'numeric' }) }),
      ]),
      el('.trx-amount', {}, [
        el('.trx-amount-main', { class: trx.type, text: signedMoney(amountBase, base) }),
      ]),
    ]);
    attachRowActions(row, trx);
    return row;
  }

  run();
  const modal = sheet(initial.title || t('search'), body, { full: true });
  setTimeout(() => queryInput.focus(), 300);
}

// Иконка «Фильтр» (три сужающиеся линии — стандартный значок фильтра).
function filterIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22'); svg.setAttribute('height', '22');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round');
  for (const d of ['M4 7h16', 'M7 12h10', 'M10 17h4']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}
