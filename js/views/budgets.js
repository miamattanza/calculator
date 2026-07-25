// views/budgets.js — месячные лимиты по категориям расходов с прогрессом.

import * as store from '../store.js';
import { t } from '../i18n.js';
import { el, clear, sheet, field, toast, confirmDialog } from '../dom.js';
import { money, CURRENCIES } from '../format.js';
import { progressBar } from '../charts.js';

export function renderBudgets(root) {
  clear(root);
  const base = store.baseCurrency();
  root.appendChild(el('.screen-title', { text: t('budgets_title') }));

  const header = el('.list-header', {}, [
    el('.list-header-title', { text: t('period_month') }),
    el('button.list-add', { type: 'button', text: '+', onClick: () => openBudgetForm(null, root) }),
  ]);
  root.appendChild(header);

  const statuses = store.budgetStatus();
  if (!statuses.length) {
    root.appendChild(el('.empty-inline', { text: t('no_budgets') }));
    return;
  }

  for (const s of statuses) {
    const over = s.remaining < 0;
    const card = el('.card.budget-card', { onClick: () => openBudgetForm(s.budget, root) }, [
      el('.budget-head', {}, [
        el('.budget-title', {}, [
          el('span.budget-emoji', { text: s.category ? s.category.icon : '🔖' }),
          el('span', { text: s.category ? store.categoryName(s.category) : '—' }),
        ]),
        el('.budget-nums', { text: `${money(s.spent, base)} / ${money(s.limit, base)}` }),
      ]),
      progressBar(s.ratio, s.category ? s.category.color : null),
      el('.budget-foot', { class: over ? 'over' : '' }, [
        over
          ? el('span', { text: t('over_budget', { amount: money(-s.remaining, base) }) })
          : el('span', { text: `${t('remaining')}: ${money(s.remaining, base)}` }),
      ]),
    ]);
    root.appendChild(card);
  }
}

function openBudgetForm(existing, root) {
  const base = store.baseCurrency();
  const model = existing ? { ...existing } : { categoryId: null, limit: '', currency: base };
  const body = el('.form');

  // Выбор категории расхода
  const catGrid = el('.cat-grid');
  const usedIds = new Set(store.getState().budgets
    .filter((b) => !existing || b.id !== existing.id).map((b) => b.categoryId));
  for (const c of store.categoriesByType('expense')) {
    const disabled = usedIds.has(c.id);
    const chip = el('button.cat-chip', {
      type: 'button',
      class: (c.id === model.categoryId ? 'active ' : '') + (disabled ? 'disabled' : ''),
      style: { '--chip': c.color },
      disabled,
      onClick: () => {
        if (disabled) return;
        model.categoryId = c.id;
        catGrid.querySelectorAll('.cat-chip').forEach((x) => x.classList.remove('active'));
        chip.classList.add('active');
      },
    }, [el('.cat-emoji', { text: c.icon }), el('.cat-name', { text: store.categoryName(c) })]);
    catGrid.appendChild(chip);
  }

  const limitInput = el('input.amount-input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: model.limit || '' });
  limitInput.addEventListener('input', () => {
    limitInput.value = limitInput.value.replace(/[^\d.,]/g, '').replace(',', '.');
    model.limit = limitInput.value;
  });

  const error = el('.form-error');
  const saveBtn = el('button.btn-primary', { type: 'button', text: t('save') });

  body.append(
    field(t('category'), catGrid).row,
    el('.amount-wrap', {}, [limitInput, el('.amount-cur', { text: CURRENCIES[base].symbol })]),
    error, saveBtn,
  );

  if (existing) {
    body.appendChild(el('button.btn-danger', {
      type: 'button', text: t('delete'),
      onClick: async () => {
        if (await confirmDialog(t('confirm_delete'))) { await store.deleteBudget(existing.id); modal.close(); }
      },
    }));
  }

  const modal = sheet(t('add_budget'), body);

  saveBtn.addEventListener('click', async () => {
    const lim = parseFloat(model.limit);
    if (!model.categoryId) { error.textContent = t('required'); return; }
    if (!lim || lim <= 0) { error.textContent = t('invalid_amount'); return; }
    await store.saveBudget({ id: existing ? existing.id : undefined, categoryId: model.categoryId, limit: lim, currency: base });
    modal.close();
  });
}
