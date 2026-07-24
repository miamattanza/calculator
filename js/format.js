// format.js — форматирование денег и дат с учётом языка и валюты.

import { getLang } from './i18n.js';

// Поддерживаемые валюты. Курсы к базовой валюте хранятся у операций,
// здесь только метаданные для отображения.
export const CURRENCIES = {
  RUB: { symbol: '₽', name: 'Рубль' },
  USD: { symbol: '$', name: 'Доллар США' },
  EUR: { symbol: '€', name: 'Евро' },
  KZT: { symbol: '₸', name: 'Тенге' },
  UAH: { symbol: '₴', name: 'Гривна' },
  GBP: { symbol: '£', name: 'Фунт' },
  CNY: { symbol: '¥', name: 'Юань' },
  TRY: { symbol: '₺', name: 'Лира' },
  GEL: { symbol: '₾', name: 'Лари' },
};

const LOCALE = { ru: 'ru-RU', en: 'en-US' };

export function locale() {
  return LOCALE[getLang()] || 'ru-RU';
}

// Денежное форматирование. Пытаемся через Intl с валютой, при ошибке —
// ручной вариант с символом.
export function money(amount, currency = 'RUB') {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(locale(), {
      style: 'currency',
      currency,
      maximumFractionDigits: Math.abs(n) % 1 === 0 ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(n);
  } catch {
    const sym = (CURRENCIES[currency] && CURRENCIES[currency].symbol) || currency;
    return `${n.toLocaleString(locale())} ${sym}`;
  }
}

// Число со знаком (+/−) для доходов/расходов.
export function signedMoney(amount, currency = 'RUB') {
  const n = Number(amount) || 0;
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return sign + money(Math.abs(n), currency);
}

export function dateISO(d = new Date()) {
  const x = new Date(d);
  const off = x.getTimezoneOffset();
  const local = new Date(x.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

export function formatDate(iso, opts) {
  const d = new Date(iso);
  return d.toLocaleDateString(locale(), opts || { day: 'numeric', month: 'long', year: 'numeric' });
}

export function monthKey(iso) {
  return String(iso).slice(0, 7); // YYYY-MM
}

export function monthName(iso) {
  return new Date(iso).toLocaleDateString(locale(), { month: 'short' });
}

export function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toISO + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dateISO(d);
}
