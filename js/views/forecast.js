// views/forecast.js — прогноз остатка к выбранной дате.
// Основной метод: текущий баланс + плановые платежи до целевой даты.
// Дополнительно: оценка по средним тратам за 30 дней.

import * as store from '../store.js';
import { t } from '../i18n.js';
import { el, clear, sheet, field, segmented, toast, confirmDialog } from '../dom.js';
import { money, formatDate, dateISO, addDays, CURRENCIES } from '../format.js';

// целевая дата по умолчанию — конец текущего месяца
let targetDate = defaultTarget();
function defaultTarget() {
  const d = new Date();
  return dateISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function renderForecast(root) {
  clear(root);
  const base = store.baseCurrency();
  root.appendChild(el('.screen-title', { text: t('forecast_title') }));

  // Выбор целевой даты + быстрые пресеты
  const dateInput = el('input.select', { type: 'date', value: targetDate, min: dateISO() });
  dateInput.addEventListener('change', () => { targetDate = dateInput.value; renderForecast(root); });

  const presets = el('.preset-row', {}, [
    presetBtn('+7', () => addDays(dateISO(), 7), root),
    presetBtn('+30', () => addDays(dateISO(), 30), root),
    presetBtn(t('period_month'), () => defaultTarget(), root),
    presetBtn('+90', () => addDays(dateISO(), 90), root),
  ]);

  const card = el('.card', {}, [
    field(t('target_date'), dateInput).row,
    presets,
  ]);
  root.appendChild(card);

  const f = store.forecast(targetDate);

  // Главная цифра — прогнозируемый остаток
  const hero = el('.forecast-hero', { class: f.projected < 0 ? 'negative' : '' }, [
    el('.forecast-hero-label', { text: t('projected_balance') }),
    el('.forecast-hero-value', { text: money(f.projected, base) }),
    el('.forecast-hero-sub', { text: formatDate(targetDate) + ' · +' + f.daysAhead + (t('app_name') ? ' дн.' : '') }),
  ]);
  root.appendChild(hero);

  // Расшифровка
  const breakdown = el('.card', {}, [
    lineRow(t('current_balance'), money(f.balance, base)),
    lineRow(t('planned_in'), '+' + money(f.plannedIn, base), 'income'),
    lineRow(t('planned_out'), '−' + money(f.plannedOut, base), 'expense'),
  ]);
  root.appendChild(breakdown);

  // Оценка по средним тратам
  const avg = el('.card.avg-card', {}, [
    el('.card-title', { text: t('avg_estimate') }),
    el('.avg-value', { class: f.avgEstimate < 0 ? 'expense' : '', text: money(f.avgEstimate, base) }),
    el('.avg-hint', { text: t('avg_estimate_hint') }),
  ]);
  root.appendChild(avg);

  // Список плановых платежей
  const header = el('.list-header', {}, [
    el('.list-header-title', { text: t('planned_payments') }),
    el('button.list-add', { type: 'button', text: '+', onClick: () => openPlannedForm(null, root) }),
  ]);
  root.appendChild(header);

  const planned = store.getState().planned;
  if (!planned.length) {
    root.appendChild(el('.empty-inline', { text: t('no_planned') }));
  } else {
    const list = el('.trx-group');
    const recLabel = {
      once: t('rec_once'), daily: t('rec_daily'), weekly: t('rec_weekly'),
      monthly: t('rec_monthly'), yearly: t('rec_yearly'),
    };
    for (const p of [...planned].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))) {
      const cat = store.categoryById(p.categoryId);
      list.appendChild(el('.trx-row', { onClick: () => openPlannedForm(p, root) }, [
        el('.trx-icon', { style: { '--chip': cat ? cat.color : '#8E8E93' }, text: cat ? cat.icon : (p.type === 'income' ? '💰' : '🧾') }),
        el('.trx-main', {}, [
          el('.trx-title', { text: p.note || (cat ? cat.name : (p.type === 'income' ? t('income') : t('expense'))) }),
          el('.trx-note', { text: `${recLabel[p.recurrence]} · ${t('start_date')}: ${formatDate(p.startDate, { day: 'numeric', month: 'short' })}` }),
        ]),
        el('.trx-amount', {}, [
          el('.trx-amount-main', { class: p.type, text: (p.type === 'income' ? '+' : '−') + money(store.baseAmount(p), base) }),
        ]),
      ]));
    }
    root.appendChild(list);
  }
}

function presetBtn(label, compute, root) {
  return el('button.preset', {
    type: 'button', text: label,
    onClick: () => { targetDate = compute(); renderForecast(root); },
  });
}

function lineRow(label, value, cls) {
  return el('.line-row', {}, [
    el('.line-label', { text: label }),
    el('.line-value', { class: cls || '', text: value }),
  ]);
}

// ---- Форма планового платежа ----

function openPlannedForm(existing, root) {
  const base = store.baseCurrency();
  const model = existing ? { ...existing } : {
    type: 'expense', amount: '', currency: base, rate: 1, categoryId: null,
    note: '', recurrence: 'monthly', startDate: dateISO(), endDate: null,
  };
  const body = el('.form');

  const typeSeg = segmented([
    { value: 'expense', label: t('expense') },
    { value: 'income', label: t('income') },
  ], model.type, (v) => { model.type = v; renderCats(); });

  const amountInput = el('input.amount-input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: model.amount || '' });
  amountInput.addEventListener('input', () => {
    amountInput.value = amountInput.value.replace(/[^\d.,]/g, '').replace(',', '.');
    model.amount = amountInput.value;
  });

  const currencySelect = el('select.select', {}, Object.keys(CURRENCIES).map((code) =>
    el('option', { value: code, selected: code === model.currency }, `${code} ${CURRENCIES[code].symbol}`)));
  const rateField = field(t('rate_to_base', { base }), el('input.select', { type: 'text', inputmode: 'decimal', value: model.rate }));
  rateField.input.addEventListener('input', () => {
    rateField.input.value = rateField.input.value.replace(/[^\d.,]/g, '').replace(',', '.');
    model.rate = rateField.input.value;
  });
  const syncRate = () => { rateField.row.style.display = model.currency === base ? 'none' : ''; };
  currencySelect.addEventListener('change', () => {
    model.currency = currencySelect.value;
    if (model.currency === base) { model.rate = 1; rateField.input.value = 1; }
    syncRate();
  });

  const catGrid = el('.cat-grid');
  function renderCats() {
    clear(catGrid);
    const cats = store.categoriesByType(model.type);
    if (model.categoryId && !cats.some((c) => c.id === model.categoryId)) model.categoryId = null;
    for (const c of cats) {
      const chip = el('button.cat-chip', {
        type: 'button', class: c.id === model.categoryId ? 'active' : '', style: { '--chip': c.color },
        onClick: () => {
          model.categoryId = c.id;
          catGrid.querySelectorAll('.cat-chip').forEach((x) => x.classList.remove('active'));
          chip.classList.add('active');
        },
      }, [el('.cat-emoji', { text: c.icon }), el('.cat-name', { text: c.name })]);
      catGrid.appendChild(chip);
    }
  }
  renderCats();

  const recSelect = el('select.select', {}, [
    ['once', t('rec_once')], ['daily', t('rec_daily')], ['weekly', t('rec_weekly')],
    ['monthly', t('rec_monthly')], ['yearly', t('rec_yearly')],
  ].map(([v, l]) => el('option', { value: v, selected: v === model.recurrence }, l)));
  recSelect.addEventListener('change', () => { model.recurrence = recSelect.value; });

  const startInput = el('input.select', { type: 'date', value: model.startDate });
  startInput.addEventListener('change', () => { model.startDate = startInput.value; });

  const endInput = el('input.select', { type: 'date', value: model.endDate || '' });
  endInput.addEventListener('change', () => { model.endDate = endInput.value || null; });

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
    field(t('recurrence'), recSelect).row,
    field(t('start_date'), startInput).row,
    field(t('end_date'), endInput).row,
    field(t('note'), noteInput).row,
    error, saveBtn,
  );

  if (existing) {
    body.appendChild(el('button.btn-danger', {
      type: 'button', text: t('delete'),
      onClick: async () => {
        if (await confirmDialog(t('confirm_delete'))) {
          await store.deletePlanned(existing.id); modal.close(); toast(t('delete'));
        }
      },
    }));
  }

  syncRate();
  const modal = sheet(existing ? t('add_planned') : t('add_planned'), body);

  saveBtn.addEventListener('click', async () => {
    const amt = parseFloat(model.amount);
    if (!amt || amt <= 0) { error.textContent = t('invalid_amount'); return; }
    await store.savePlanned({
      id: existing ? existing.id : undefined,
      type: model.type, amount: amt, currency: model.currency, rate: parseFloat(model.rate) || 1,
      categoryId: model.categoryId, note: model.note, recurrence: model.recurrence,
      startDate: model.startDate, endDate: model.endDate,
    });
    modal.close();
  });
}
