// charts.js — лёгкие SVG-графики без внешних зависимостей (CSP-friendly).

import { el } from './dom.js';

const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Кольцевая диаграмма. data: [{label, amount, color}]. centerLabel опционально.
export function donut(data, { size = 180, thickness = 22, centerTop = '', centerBottom = '' } = {}) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'donut' });

  if (total <= 0) {
    svg.appendChild(svgEl('circle', { cx, cy, r, fill: 'none', stroke: 'var(--sep)', 'stroke-width': thickness }));
  } else {
    let offset = 0;
    for (const d of data) {
      const frac = d.amount / total;
      if (frac <= 0) continue;
      const arc = svgEl('circle', {
        cx, cy, r, fill: 'none',
        stroke: d.color || 'var(--accent)',
        'stroke-width': thickness,
        'stroke-dasharray': `${frac * circ} ${circ}`,
        'stroke-dashoffset': -offset * circ,
        transform: `rotate(-90 ${cx} ${cy})`,
        'stroke-linecap': 'butt',
      });
      svg.appendChild(arc);
      offset += frac;
    }
  }

  const wrap = el('.donut-wrap');
  wrap.appendChild(svg);
  wrap.appendChild(el('.donut-center', {}, [
    el('.donut-top', { text: centerTop }),
    el('.donut-bottom', { text: centerBottom }),
  ]));
  return wrap;
}

// Столбчатая диаграмма доходов/расходов по месяцам.
// data: [{label, income, expense}]
export function groupedBars(data, { fmt = (n) => String(Math.round(n)) } = {}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const wrap = el('.bars');
  for (const d of data) {
    const col = el('.bar-col', {}, [
      el('.bar-pair', {}, [
        el('.bar.income', { style: { height: (d.income / max * 100) + '%' }, title: fmt(d.income) }),
        el('.bar.expense', { style: { height: (d.expense / max * 100) + '%' }, title: fmt(d.expense) }),
      ]),
      el('.bar-label', { text: d.label }),
    ]);
    wrap.appendChild(col);
  }
  return wrap;
}

// Горизонтальный прогресс-бар (для бюджетов).
export function progressBar(ratio, color) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const over = ratio > 1;
  return el('.progress', {}, [
    el('.progress-fill', {
      class: over ? 'over' : '',
      style: { width: (clamped * 100) + '%', background: over ? '' : (color || 'var(--accent)') },
    }),
  ]);
}
