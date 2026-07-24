// keypad.js — цифровая клавиатура для быстрого ввода суммы.
// Вызывается свайпом вверх или кнопкой «+». Раскладка: 1–9, снизу ⌫ / 0 / ✓.
// Ввод целочисленный (без копеек), в основной валюте.

import { el } from './dom.js';
import { CURRENCIES } from './format.js';
import { baseCurrency } from './store.js';
import { t } from './i18n.js';

export function openAmountPad({ initial = 0, type, onConfirm }) {
  const base = baseCurrency();
  const sym = (CURRENCIES[base] && CURRENCIES[base].symbol) || base;
  let digits = initial && initial > 0 ? String(Math.round(initial)) : '';

  const amountEl = el('.pad-amount');
  const okBtn = el('button.pad-key.ok', { type: 'button', text: '✓', 'aria-label': t('save') });

  const update = () => {
    const val = digits ? parseInt(digits, 10) : 0;
    amountEl.textContent = val.toLocaleString('ru-RU') + ' ' + sym;
    okBtn.classList.toggle('disabled', val <= 0);
  };
  const press = (d) => { if (digits.length < 12) { digits = (digits === '0' ? '' : digits) + d; update(); } };
  const del = () => { digits = digits.slice(0, -1); update(); };

  const grid = el('.pad-grid');
  ['1','2','3','4','5','6','7','8','9'].forEach((n) =>
    grid.appendChild(el('button.pad-key', { type: 'button', text: n, onClick: () => press(n) })));
  grid.appendChild(el('button.pad-key.del', { type: 'button', text: '⌫', 'aria-label': t('delete'), onClick: del }));
  grid.appendChild(el('button.pad-key', { type: 'button', text: '0', onClick: () => press('0') }));
  grid.appendChild(okBtn);

  const backdrop = el('.pad-backdrop', { role: 'dialog', 'aria-modal': 'true' });
  const panel = el('.pad', {}, [
    el('.sheet-grabber'),
    type ? el('.pad-type', { class: type, text: type === 'income' ? t('income') : t('expense') }) : null,
    amountEl,
    grid,
  ]);
  backdrop.appendChild(panel);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.appendChild(backdrop);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => backdrop.classList.add('open'));
  update();

  okBtn.addEventListener('click', () => {
    const val = digits ? parseInt(digits, 10) : 0;
    if (val <= 0) return;
    close();
    onConfirm(val);
  });

  function close() {
    backdrop.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(() => backdrop.remove(), 250);
  }
  return { close };
}
