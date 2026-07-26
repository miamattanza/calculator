// views/planning.js — Планирование: цель (сумма + название) → примерная дата
// накопления по тренду доходов/расходов, плюс справка по займу.

import * as store from '../store.js';
import { t } from '../i18n.js';
import { el, clear, confirmDialog, toast } from '../dom.js';
import { money, formatDate, CURRENCIES } from '../format.js';

function durationText(days) {
  if (days == null) return '';
  if (days < 31) return `≈ ${days} ${t('days_short')}`;
  const months = Math.floor(days / 30.44);
  const weeks = Math.round((days - months * 30.44) / 7);
  return `≈ ${months} ${t('months_short')}` + (weeks ? ` ${weeks}×7${t('days_short')}` : '');
}

export function renderPlanning(root) {
  clear(root);
  const base = store.baseCurrency();
  const sym = (CURRENCIES[base] && CURRENCIES[base].symbol) || base;
  root.appendChild(el('.screen-title', { text: t('tab_planning') }));

  // Форма новой цели.
  const nameInput = el('input.select', { type: 'text', placeholder: t('goal_name') });
  const amountInput = el('input.select', { type: 'text', inputmode: 'numeric', placeholder: `${t('goal_amount')}, ${sym}` });
  amountInput.addEventListener('input', () => { amountInput.value = amountInput.value.replace(/[^\d]/g, ''); });
  const calcBtn = el('button.btn-primary', {
    type: 'button', text: t('calc'),
    onClick: async () => {
      const amount = parseInt(amountInput.value, 10);
      if (!amount || amount <= 0) { amountInput.focus(); return; }
      await store.saveGoal({ name: nameInput.value.trim() || '—', amount, currency: base });
      nameInput.value = ''; amountInput.value = '';
      toast(t('calc'));
    },
  });
  root.appendChild(el('.card', {}, [nameInput, el('div', { style: { height: '10px' } }), amountInput, el('div', { style: { height: '12px' } }), calcBtn]));

  // Средний темп (в месяц) — общая справка.
  const est0 = store.planningEstimate(0);
  root.appendChild(el('.card.avg-card', {}, [
    el('.card-title', { text: t('monthly_rate') }),
    el('.avg-value', { class: est0.monthlyRate < 0 ? 'expense' : '', text: (est0.monthlyRate >= 0 ? '+' : '−') + money(Math.abs(est0.monthlyRate), base) }),
    !est0.enoughData ? el('.avg-hint', { text: t('not_enough_data') }) : null,
  ]));

  // Список целей.
  const goals = [...store.getState().goals].sort((a, b) => b.createdAt - a.createdAt);
  if (!goals.length) {
    root.appendChild(el('.empty-inline', { text: t('no_goals') }));
    return;
  }
  for (const g of goals) {
    const est = store.planningEstimate(g.amount);
    let resultNode;
    if (est.canBuyNow) {
      resultNode = el('.goal-result', {}, [
        el('.goal-eta', {}, [el('span.goal-eta-date', { text: '✅ ' + t('buy_now') })]),
        el('.goal-loan', { text: `${t('remaining_after')}: ${money(est.remainingAfter, base)}` }),
      ]);
    } else if (!est.enoughData) {
      resultNode = el('.goal-note', { text: t('not_enough_data') });
    } else if (!est.reachable) {
      resultNode = el('.goal-note.warn', { text: t('goal_unreachable') });
    } else {
      resultNode = el('.goal-result', {}, [
        el('.goal-eta', {}, [
          el('span.goal-eta-label', { text: t('goal_eta') + ' ' }),
          el('span.goal-eta-date', { text: `${formatDate(est.date, { day: 'numeric', month: 'long', year: 'numeric' })} (${durationText(est.days)})` }),
        ]),
        el('.goal-loan', { text: t('loan_info') }),
      ]);
    }
    root.appendChild(el('.card.goal-card', {}, [
      el('.goal-head', {}, [
        el('.goal-name', { text: g.name }),
        el('.goal-amount', { text: money(g.amount, g.currency || base) }),
      ]),
      resultNode,
      el('button.goal-del', {
        type: 'button', text: t('delete'),
        onClick: async () => { if (await confirmDialog(t('confirm_delete'))) store.deleteGoal(g.id); },
      }),
    ]));
  }
}
