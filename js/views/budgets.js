// views/budgets.js — бюджеты и лимиты.
// Режимы: общий месячный лимит (по умолчанию) с предупреждением о превышении,
// либо детальные лимиты по категориям (переключатель «Детализировать лимит»).

import * as store from '../store.js';
import { t } from '../i18n.js';
import { el, clear, sheet, field, toast, confirmDialog, toggle, catIcon } from '../dom.js';
import { money, CURRENCIES } from '../format.js';
import { progressBar } from '../charts.js';

export function renderBudgets(root) {
  clear(root);
  const base = store.baseCurrency();
  const settings = store.getState().settings;
  const detailed = settings.budgetDetailed === true;

  root.appendChild(el('.screen-title', { text: t('budgets_title') }));

  // Переключатель детализации.
  const detailToggle = toggle(detailed, async (v) => { await store.setSetting('budgetDetailed', v); });
  root.appendChild(el('.settings-group', {}, [
    el('.setting-row', {}, [el('.setting-label', { text: t('budget_detail') }), detailToggle]),
  ]));

  if (!detailed) {
    renderTotal(root, base);
  } else {
    renderDetailed(root, base);
  }

  // Управление уведомлением о превышении лимита.
  const bs = store.budgetOverallStatus();
  if (bs.has) {
    const muted = bs.muted;
    root.appendChild(el('.settings-group', {}, [
      el('.nav-row', {
        onClick: async () => { await store.setSetting('budgetMutedMonth', muted ? '' : store.currentMonthKey()); },
      }, [
        el('.nav-icon', { text: muted ? '🔔' : '🔕' }),
        el('.nav-label', { text: muted ? t('unmute_alert') : t('mute_alert') }),
      ]),
    ]));
  }
}

// ---- Общий лимит ----

function renderTotal(root, base) {
  const total = Number(store.getState().settings.budgetTotal) || 0;
  const spent = store.monthExpenseTotal();
  const over = total > 0 && spent > total;
  const ratio = total > 0 ? spent / total : 0;

  const card = el('.card.budget-card', { onClick: () => openTotalLimitForm() }, [
    el('.budget-head', {}, [
      el('.budget-title', {}, [el('span', { text: t('budget_total') })]),
      el('.budget-nums', { text: total > 0 ? `${money(spent, base)} / ${money(total, base)}` : money(spent, base) }),
    ]),
    total > 0 ? progressBar(ratio, null) : null,
    el('.budget-foot', { class: over ? 'over' : '' }, [
      total > 0
        ? el('span', { text: over ? t('budget_over') : `${t('remaining')}: ${money(total - spent, base)}` })
        : el('span', { text: t('set_limit') }),
    ]),
  ]);
  root.appendChild(card);

  if (over) {
    root.appendChild(el('.budget-alert', { text: `⚠️ ${t('budget_over')} · ${money(spent - total, base)}` }));
  }
}

function openTotalLimitForm() {
  const base = store.baseCurrency();
  const sym = (CURRENCIES[base] && CURRENCIES[base].symbol) || base;
  const input = el('input.amount-input', {
    type: 'text', inputmode: 'numeric', placeholder: '0',
    value: Number(store.getState().settings.budgetTotal) || '',
  });
  input.addEventListener('input', () => { input.value = input.value.replace(/[^\d]/g, ''); });
  const body = el('.form', {}, [
    el('.amount-wrap', {}, [input, el('.amount-cur', { text: sym })]),
    el('button.btn-primary', {
      type: 'button', text: t('save'),
      onClick: async () => { await store.setSetting('budgetTotal', parseInt(input.value, 10) || 0); modal.close(); },
    }),
  ]);
  const modal = sheet(t('budget_total'), body);
  setTimeout(() => input.focus(), 300);
}

// ---- Детальные лимиты по категориям ----

function renderDetailed(root, base) {
  root.appendChild(el('.list-header', {}, [
    el('.list-header-title', { text: t('period_month') }),
    el('button.list-add', { type: 'button', text: '+', onClick: () => openBudgetForm(null) }),
  ]));

  const statuses = store.budgetStatus();
  if (!statuses.length) {
    root.appendChild(el('.empty-inline', { text: t('no_budgets') }));
    return;
  }
  for (const s of statuses) {
    const over = s.remaining < 0;
    root.appendChild(el('.card.budget-card', { onClick: () => openBudgetForm(s.budget) }, [
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
    ]));
  }
}

function openBudgetForm(existing) {
  const base = store.baseCurrency();
  const sym = (CURRENCIES[base] && CURRENCIES[base].symbol) || base;
  const model = existing ? { ...existing } : { categoryId: null, limit: '', currency: base };
  const body = el('.form');

  const catGrid = el('.cat-grid');
  const usedIds = new Set(store.getState().budgets
    .filter((b) => !existing || b.id !== existing.id).map((b) => b.categoryId));
  for (const c of store.categoriesByType('expense')) {
    const disabled = usedIds.has(c.id);
    const chip = el('button.cat-chip', {
      type: 'button',
      class: (c.id === model.categoryId ? 'active ' : '') + (disabled ? 'disabled' : ''),
      style: { '--chip': c.color }, disabled,
      onClick: () => {
        if (disabled) return;
        model.categoryId = c.id;
        catGrid.querySelectorAll('.cat-chip').forEach((x) => x.classList.remove('active'));
        chip.classList.add('active');
      },
    }, [catIcon(c), el('.cat-name', { text: store.categoryName(c) })]);
    catGrid.appendChild(chip);
  }

  const limitInput = el('input.amount-input', { type: 'text', inputmode: 'numeric', placeholder: '0', value: model.limit || '' });
  limitInput.addEventListener('input', () => { limitInput.value = limitInput.value.replace(/[^\d]/g, ''); model.limit = limitInput.value; });

  const error = el('.form-error');
  const saveBtn = el('button.btn-primary', { type: 'button', text: t('save') });

  body.append(
    field(t('category'), catGrid).row,
    el('.amount-wrap', {}, [limitInput, el('.amount-cur', { text: sym })]),
    error, saveBtn,
  );

  if (existing) {
    body.appendChild(el('button.btn-danger', {
      type: 'button', text: t('delete'),
      onClick: async () => { if (await confirmDialog(t('confirm_delete'))) { await store.deleteBudget(existing.id); modal.close(); } },
    }));
  }

  const modal = sheet(t('add_budget'), body);
  saveBtn.addEventListener('click', async () => {
    const lim = parseInt(model.limit, 10);
    if (!model.categoryId) { error.textContent = t('required'); return; }
    if (!lim || lim <= 0) { error.textContent = t('invalid_amount'); return; }
    await store.saveBudget({ id: existing ? existing.id : undefined, categoryId: model.categoryId, limit: lim, currency: base });
    modal.close();
  });
}
