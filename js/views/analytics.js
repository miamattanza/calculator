// views/analytics.js — аналитика: кольцевая диаграмма по категориям и
// столбчатая динамика доходов/расходов по месяцам.

import * as store from '../store.js';
import { t } from '../i18n.js';
import { el, clear, segmented, field, rowCols, catIcon } from '../dom.js';
import { money, dateISO, addDays } from '../format.js';
import { donut, groupedBars } from '../charts.js';

let period = 'month';
let type = 'expense';
let customFrom = addDays(dateISO(), -30);
let customTo = dateISO();

export function renderAnalytics(root) {
  clear(root);
  const base = store.baseCurrency();
  const [from, to] = period === 'custom' ? [customFrom, customTo] : store.periodRange(period);

  root.appendChild(el('.screen-title', { text: t('analytics_title') }));

  root.appendChild(el('.period-bar', {}, [segmented([
    { value: 'week', label: t('period_week') },
    { value: 'month', label: t('period_month') },
    { value: 'year', label: t('period_year') },
    { value: 'custom', label: t('period_custom') },
  ], period, (v) => { period = v; renderAnalytics(root); })]));

  // Для «Выбранного периода» — поля дат начала и конца.
  if (period === 'custom') {
    const fromInput = el('input.select', { type: 'date', value: customFrom });
    const toInput = el('input.select', { type: 'date', value: customTo });
    fromInput.addEventListener('change', () => { customFrom = fromInput.value || customFrom; renderAnalytics(root); });
    toInput.addEventListener('change', () => { customTo = toInput.value || customTo; renderAnalytics(root); });
    root.appendChild(el('.card', {}, [rowCols(field(t('date_from'), fromInput).row, field(t('date_to'), toInput).row)]));
  }

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
      color: b.category ? b.category.color : '#726B65',
    }));
    card.appendChild(donut(data, {
      centerTop: money(total, base),
      centerBottom: type === 'expense' ? t('expense') : t('income'),
    }));

    const legend = el('.legend');
    // Длину полос считаем относительно САМОЙ крупной категории (у неё — вся ширина),
    // иначе доли от общей суммы (обычно < 50%) короче названия и «диаграмма» не видна.
    const maxAmount = breakdown.reduce((m, b) => Math.max(m, b.amount), 0) || 1;
    for (const b of breakdown) {
      const pct = total > 0 ? Math.round(b.amount / total * 100) : 0;
      const barLen = Math.round(b.amount / maxAmount * 100);
      const color = b.category ? b.category.color : '#726B65';
      // Сама «кнопка-плитка» с иконкой и названием удлиняется вправо пропорционально
      // сумме — сплошным цветом (тем же, что в круговой диаграмме). Иконка остаётся
      // на месте, высота и радиус углов постоянны.
      legend.appendChild(el('.legend-row', {}, [
        el('.legend-track', {}, [
          el('.legend-pill', { style: { '--chip': color, flexBasis: barLen + '%' } }, [
            b.category ? catIcon(b.category, 'legend-icon') : el('.legend-icon', { style: { '--chip': color } }),
            el('.legend-name', { text: b.category ? store.categoryName(b.category) : '—' }),
          ]),
        ]),
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
