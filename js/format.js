// format.js — форматирование денег и дат с учётом языка и валюты.

import { getLang } from './i18n.js';

// Поддерживаемые валюты. Курсы к базовой валюте хранятся у операций,
// здесь только метаданные для отображения. Коды — ISO 4217 (их же понимает
// онлайн-сервис курсов), поэтому список можно свободно расширять.
export const CURRENCIES = {
  // Основные мировые
  RUB: { symbol: '₽', name: 'Рубль' },
  USD: { symbol: '$', name: 'Доллар США' },
  EUR: { symbol: '€', name: 'Евро' },
  GBP: { symbol: '£', name: 'Фунт стерлингов' },
  CNY: { symbol: '¥', name: 'Юань' },
  JPY: { symbol: '¥', name: 'Иена' },
  CHF: { symbol: '₣', name: 'Швейцарский франк' },
  // СНГ / ЕАЭС
  KZT: { symbol: '₸', name: 'Тенге' },
  UAH: { symbol: '₴', name: 'Гривна' },
  BYN: { symbol: 'Br', name: 'Белорусский рубль' },
  GEL: { symbol: '₾', name: 'Лари' },
  AMD: { symbol: '֏', name: 'Драм' },
  AZN: { symbol: '₼', name: 'Азербайджанский манат' },
  KGS: { symbol: 'с', name: 'Киргизский сом' },
  TJS: { symbol: 'смн', name: 'Сомони' },
  UZS: { symbol: 'сўм', name: 'Узбекский сум' },
  MDL: { symbol: 'L', name: 'Молдавский лей' },
  TMT: { symbol: 'm', name: 'Туркменский манат' },
  // Азия / Ближний Восток
  TRY: { symbol: '₺', name: 'Турецкая лира' },
  AED: { symbol: 'د.إ', name: 'Дирхам ОАЭ' },
  INR: { symbol: '₹', name: 'Индийская рупия' },
  IDR: { symbol: 'Rp', name: 'Индонезийская рупия' },
  THB: { symbol: '฿', name: 'Тайский бат' },
  VND: { symbol: '₫', name: 'Вьетнамский донг' },
  KRW: { symbol: '₩', name: 'Корейская вона' },
  HKD: { symbol: 'HK$', name: 'Гонконгский доллар' },
  SGD: { symbol: 'S$', name: 'Сингапурский доллар' },
  MYR: { symbol: 'RM', name: 'Малайзийский ринггит' },
  PHP: { symbol: '₱', name: 'Филиппинское песо' },
  ILS: { symbol: '₪', name: 'Шекель' },
  EGP: { symbol: 'E£', name: 'Египетский фунт' },
  // Европа / прочее
  PLN: { symbol: 'zł', name: 'Злотый' },
  CZK: { symbol: 'Kč', name: 'Чешская крона' },
  RSD: { symbol: 'дин', name: 'Сербский динар' },
  CAD: { symbol: 'C$', name: 'Канадский доллар' },
  AUD: { symbol: 'A$', name: 'Австралийский доллар' },
};

const LOCALE = { ru: 'ru-RU', en: 'en-US', it: 'it-IT', id: 'id-ID', es: 'es-ES', ar: 'ar', fr: 'fr-FR' };

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

// Курс валюты — короткое представление: до десятых для курсов ≥ 1
// (длинные хвосты после точки не нужны); для мелких курсов сохраняем
// значимость, чтобы не получить 0.
export function roundRate(r) {
  r = Number(r) || 0;
  if (r <= 0) return 0;
  if (r >= 1) return Math.round(r * 10) / 10;
  return Number(r.toPrecision(2));
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
