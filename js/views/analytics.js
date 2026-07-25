// views/analytics.js — аналитика: кольцевая диаграмма по категориям и
// столбчатая динамика доходов/расходов по месяцам.

import * as store from '../store.js';
import { t } from '../i18n.js';
import { el, clear, segmented } from '../dom.js';
import { money } from '../format.js';
import { donut, groupedBars } from '../charts.js';

let period = 'month';
let type = 'expense';

export function renderAnalytics(root) {
  clear(root);
  const base = store.baseCurrency();
  const [from, to] = store.periodRange(period);

  root.appendChild(el('.screen-title', { text: t('analytics_title') }));

  root.appendChild(el('.period-bar', {}, [segmented([
    { value: 'week', label: t('period_week') },
    { value: 'month', label: t('period_month') },
    { value: 'year', label: t('period_year') },
    { value: 'all', label: t('period_all') },
  ], period, (v) => { period = v; renderAnalytics(root); })]));

  root.appendChild(el('.period-bar', {}, [segmented([
    { value: 'expense', label: t('expense') },
    { value: 'income', label: t('income') },
  ], type, (v) => { type = v; renderAnalytics(root); })]));

  const breakdown = store.breakdownByCategory(type, from, to);
  const total = breakdown.reduce((s, b) => s + b.amount, 0);

  const card = el('.card');
  card.appendChild(el('.card-title', { text: t('by_category') }));

  if (!breakdown.length) {
    card.appendChild(el('.empty-inline', { text: t('no_data') }));
  } else {
    const data = breakdown.map((b) => ({
      label: b.category ? store.categoryName(b.category) : '—',
      amount: b.amount,
      color: b.category ? b.category.color : '#8E8E93',
    }));
    card.appendChild(donut(data, {
      centerTop: money(total, base),
      centerBottom: type === 'expense' ? t('expense') : t('income'),
    }));

    const legend = el('.legend');
    for (const b of breakdown) {
      const pct = total > 0 ? Math.round(b.amount / total * 100) : 0;
      legend.appendChild(el('.legend-row', {}, [
        el('.legend-dot', { style: { background: b.category ? b.category.color : '#8E8E93' } }),
        el('.legend-name', { text: b.category ? `${b.category.icon} ${store.categoryName(b.category)}` : '—' }),
        el('.legend-pct', { text: pct + '%' }),
        el('.legend-amount', { text: money(b.amount, base) }),
      ]));
    }
    card.appendChild(legend);
  }
  root.appendChild(card);

  // Динамика по месяцам
  const trend = store.monthlyTrend(6);
  const trendCard = el('.card');
  trendCard.appendChild(el('.card-title', { text: t('trend') }));
  trendCard.appendChild(groupedBars(
    trend.map((b) => ({ label: monthShort(b.date), income: b.income, expense: b.expense })),
    { fmt: (n) => money(n, base) },
  ));
  trendCard.appendChild(el('.legend', {}, [
    el('.legend-row', {}, [el('.legend-dot.income'), el('.legend-name', { text: t('income') })]),
    el('.legend-row', {}, [el('.legend-dot.expense'), el('.legend-name', { text: t('expense') })]),
  ]));
  root.appendChild(trendCard);
}

function monthShort(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short' });
}
