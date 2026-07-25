// store.js — единый источник состояния и бизнес-логики.
// Представления (views) читают данные и вызывают методы отсюда,
// напрямую с IndexedDB не работают. Это упрощает будущий перенос
// на облачную синхронизацию (iCloud): меняется только db-слой.

import { db } from './db.js';
import { setLang, t } from './i18n.js';
import { dateISO, monthKey, addDays, daysBetween } from './format.js';
import {
  DEFAULT_CATEGORIES, DEFAULT_SETTINGS, makeCategory,
  makeTransaction, makePlanned, makeBudget,
} from './models.js';

const state = {
  transactions: [],
  categories: [],
  planned: [],
  budgets: [],
  settings: { ...DEFAULT_SETTINGS },
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(state); }

// ---- Инициализация -------------------------------------------------------

export async function init() {
  const [transactions, categories, planned, budgets, settingsRows] = await Promise.all([
    db.getAll('transactions'),
    db.getAll('categories'),
    db.getAll('planned'),
    db.getAll('budgets'),
    db.getAll('settings'),
  ]);

  state.transactions = transactions;
  state.categories = categories;
  state.planned = planned;
  state.budgets = budgets;

  const settings = { ...DEFAULT_SETTINGS };
  for (const row of settingsRows) settings[row.key] = row.value;
  state.settings = settings;

  // Первый запуск — создаём дефолтные категории (с ключами перевода).
  if (!settings.seeded || categories.length === 0) {
    const seeded = DEFAULT_CATEGORIES.map((c, i) => makeCategory({ ...c, order: i }));
    await db.bulkPut('categories', seeded);
    state.categories = seeded;
    await setSetting('seeded', true);
  }

  // Миграция: у ранее созданных установок дефолтные категории без ключа —
  // проставляем ключ по совпадению имени и типа, чтобы имена переводились.
  const keyByName = new Map(DEFAULT_CATEGORIES.map((c) => [c.type + '|' + c.name, c.key]));
  const migrated = [];
  for (const c of state.categories) {
    if (!c.key) {
      const k = keyByName.get(c.type + '|' + c.name);
      if (k) { c.key = k; migrated.push(c); }
    }
  }
  if (migrated.length) await db.bulkPut('categories', migrated);

  setLang(state.settings.language);
  emit();
}

export function getState() { return state; }

// ---- Настройки -----------------------------------------------------------

export async function setSetting(key, value) {
  state.settings[key] = value;
  await db.put('settings', { key, value });
  if (key === 'language') setLang(value);
  emit();
}

export function baseCurrency() { return state.settings.baseCurrency; }

// ---- Категории -----------------------------------------------------------

export function categoriesByType(type) {
  return state.categories
    .filter((c) => c.type === type)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function categoryById(id) {
  return state.categories.find((c) => c.id === id) || null;
}

// Категории типа, отсортированные по недавнему использованию (часто/недавно
// используемые — вперёд), затем по порядку. Для быстрого ввода на «Обзоре».
export function categoriesByRecency(type) {
  const cats = categoriesByType(type);
  const lastUsed = new Map();
  for (const tr of state.transactions) {
    if (tr.type !== type) continue;
    const key = tr.date + '|' + String(tr.createdAt).padStart(16, '0');
    const cur = lastUsed.get(tr.categoryId);
    if (!cur || key > cur) lastUsed.set(tr.categoryId, key);
  }
  return [...cats].sort((a, b) => {
    const la = lastUsed.get(a.id), lb = lastUsed.get(b.id);
    if (la && lb) return la < lb ? 1 : -1;
    if (la) return -1;
    if (lb) return 1;
    return (a.order || 0) - (b.order || 0);
  });
}

// Локализованное имя категории: если задан key и есть перевод — берём его;
// иначе — пользовательское имя как есть.
export function categoryName(cat) {
  if (cat && cat.key) {
    const s = t('cat_' + cat.key);
    if (s && s !== 'cat_' + cat.key) return s;
  }
  return cat ? cat.name : '';
}

export async function saveCategory(data) {
  const existing = data.id ? categoryById(data.id) : null;
  const cat = existing ? { ...existing, ...data } : makeCategory(data);
  // Если пользователь переименовал дефолтную категорию (имя отличается от
  // локализованного), снимаем key — дальше показываем его собственное имя.
  if (existing && existing.key && data.name && data.name !== categoryName(existing)) {
    delete cat.key;
  }
  await db.put('categories', cat);
  const idx = state.categories.findIndex((c) => c.id === cat.id);
  if (idx >= 0) state.categories[idx] = cat; else state.categories.push(cat);
  emit();
  return cat;
}

export function categoryInUse(id) {
  return state.transactions.some((t) => t.categoryId === id) ||
         state.planned.some((p) => p.categoryId === id) ||
         state.budgets.some((b) => b.categoryId === id);
}

export async function deleteCategory(id) {
  await db.remove('categories', id);
  state.categories = state.categories.filter((c) => c.id !== id);
  emit();
}

// ---- Операции ------------------------------------------------------------

export async function saveTransaction(data) {
  const existing = data.id ? state.transactions.find((t) => t.id === data.id) : null;
  const trx = existing ? { ...existing, ...data, amount: Number(data.amount), rate: Number(data.rate) || 1 }
                       : makeTransaction(data);
  await db.put('transactions', trx);
  const idx = state.transactions.findIndex((t) => t.id === trx.id);
  if (idx >= 0) state.transactions[idx] = trx; else state.transactions.push(trx);
  emit();
  return trx;
}

export async function deleteTransaction(id) {
  await db.remove('transactions', id);
  state.transactions = state.transactions.filter((t) => t.id !== id);
  emit();
}

// Сумма операции в базовой валюте.
export function baseAmount(item) {
  return (Number(item.amount) || 0) * (Number(item.rate) || 1);
}

// Все операции, отсортированные по дате (новые сверху).
export function sortedTransactions() {
  return [...state.transactions].sort((a, b) =>
    (b.date < a.date ? -1 : b.date > a.date ? 1 : b.createdAt - a.createdAt));
}

// ---- Периоды и агрегаты --------------------------------------------------

// Возвращает [fromISO, toISO] для периода относительно якорной даты.
export function periodRange(period, anchor = dateISO()) {
  const d = new Date(anchor + 'T00:00:00');
  let from, to;
  if (period === 'day') {
    from = to = anchor;
  } else if (period === 'week') {
    const dow = (d.getDay() + 6) % 7; // понедельник = 0
    from = addDays(anchor, -dow);
    to = addDays(from, 6);
  } else if (period === 'year') {
    from = `${d.getFullYear()}-01-01`;
    to = `${d.getFullYear()}-12-31`;
  } else if (period === 'all') {
    from = '0000-01-01';
    to = '9999-12-31';
  } else { // month
    const y = d.getFullYear(), m = d.getMonth();
    from = dateISO(new Date(y, m, 1));
    to = dateISO(new Date(y, m + 1, 0));
  }
  return [from, to];
}

export function transactionsInRange(from, to) {
  return state.transactions.filter((t) => t.date >= from && t.date <= to);
}

export function totals(from, to) {
  let income = 0, expense = 0;
  for (const t of transactionsInRange(from, to)) {
    if (t.type === 'income') income += baseAmount(t);
    else expense += baseAmount(t);
  }
  return { income, expense, net: income - expense };
}

// Текущий баланс = все доходы − все расходы за всё время (в базовой валюте).
export function currentBalance() {
  let bal = 0;
  for (const t of state.transactions) {
    bal += t.type === 'income' ? baseAmount(t) : -baseAmount(t);
  }
  return bal;
}

// Разбивка по категориям за период для указанного типа.
export function breakdownByCategory(type, from, to) {
  const map = new Map();
  for (const t of transactionsInRange(from, to)) {
    if (t.type !== type) continue;
    const cat = categoryById(t.categoryId);
    const key = cat ? cat.id : 'none';
    const prev = map.get(key) || { category: cat, amount: 0, count: 0 };
    prev.amount += baseAmount(t);
    prev.count += 1;
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

// Помесячная динамика доходов/расходов за последние n месяцев.
export function monthlyTrend(n = 6) {
  const now = new Date();
  const buckets = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: monthKey(dateISO(d)), date: dateISO(d), income: 0, expense: 0 });
  }
  const index = new Map(buckets.map((b) => [b.key, b]));
  for (const t of state.transactions) {
    const b = index.get(monthKey(t.date));
    if (!b) continue;
    if (t.type === 'income') b.income += baseAmount(t);
    else b.expense += baseAmount(t);
  }
  return buckets;
}

// ---- Поиск по истории ----------------------------------------------------

// Фильтрация операций: текст (заметка/категория), категория, диапазон дат,
// диапазон сумм (в базовой валюте). Пустые поля не ограничивают выборку.
export function searchTransactions(f = {}) {
  const q = (f.query || '').trim().toLowerCase();
  const min = f.amountMin !== '' && f.amountMin != null ? parseFloat(f.amountMin) : null;
  const max = f.amountMax !== '' && f.amountMax != null ? parseFloat(f.amountMax) : null;
  return sortedTransactions().filter((t) => {
    if (f.type && t.type !== f.type) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.dateFrom && t.date < f.dateFrom) return false;
    if (f.dateTo && t.date > f.dateTo) return false;
    const amt = baseAmount(t);
    if (min != null && !Number.isNaN(min) && amt < min) return false;
    if (max != null && !Number.isNaN(max) && amt > max) return false;
    if (q) {
      const cat = categoryById(t.categoryId);
      const hay = ((t.note || '') + ' ' + categoryName(cat)).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---- Плановые платежи ----------------------------------------------------

export async function savePlanned(data) {
  const existing = data.id ? state.planned.find((p) => p.id === data.id) : null;
  const p = existing ? { ...existing, ...data, amount: Number(data.amount), rate: Number(data.rate) || 1 }
                     : makePlanned(data);
  await db.put('planned', p);
  const idx = state.planned.findIndex((x) => x.id === p.id);
  if (idx >= 0) state.planned[idx] = p; else state.planned.push(p);
  emit();
  return p;
}

export async function deletePlanned(id) {
  await db.remove('planned', id);
  state.planned = state.planned.filter((p) => p.id !== id);
  emit();
}

// Разворачивает один плановый платёж в список дат в диапазоне [from, to].
// Границы включительно: плановый платёж, датированный сегодняшним днём и
// ещё не проведённый как операция, должен учитываться в прогнозе.
function expandOccurrences(p, fromISO, toISO) {
  const dates = [];
  if (!p.active) return dates;
  const hardEnd = p.endDate && p.endDate < toISO ? p.endDate : toISO;
  let cur = nextOnOrAfter(p, fromISO);

  // Защита от бесконечного цикла.
  let guard = 0;
  while (cur && cur <= hardEnd && guard < 5000) {
    if (cur >= fromISO) dates.push(cur);
    if (p.recurrence === 'once') break;
    const next = stepDate(cur, p.recurrence);
    if (!next) break;
    cur = next;
    guard++;
  }
  return dates;
}

function stepDate(iso, rec) {
  const d = new Date(iso + 'T00:00:00');
  if (rec === 'daily') d.setDate(d.getDate() + 1);
  else if (rec === 'weekly') d.setDate(d.getDate() + 7);
  else if (rec === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (rec === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else return null;
  return dateISO(d);
}

function nextOnOrAfter(p, fromISO) {
  if (p.recurrence === 'once') return p.startDate;
  let cur = p.startDate;
  let guard = 0;
  while (cur < fromISO && guard < 5000) {
    const next = stepDate(cur, p.recurrence);
    if (!next) return null;
    cur = next;
    guard++;
  }
  return cur;
}

// ---- Прогноз -------------------------------------------------------------

// Прогноз остатка на целевую дату.
// Метод 1 (основной): текущий баланс + плановые платежи с завтрашнего дня
//   по целевую дату включительно.
// Метод 2 (подсказка): экстраполяция по среднему чистому потоку за 30 дней.
export function forecast(targetISO) {
  const today = dateISO();
  const balance = currentBalance();

  let plannedIn = 0, plannedOut = 0;
  const items = [];
  if (targetISO >= today) {
    for (const p of state.planned) {
      const occ = expandOccurrences(p, today, targetISO);
      if (!occ.length) continue;
      const per = baseAmount(p);
      const sum = per * occ.length;
      if (p.type === 'income') plannedIn += sum; else plannedOut += sum;
      items.push({ planned: p, count: occ.length, total: sum, next: occ[0] });
    }
  }

  const projected = balance + plannedIn - plannedOut;

  // Оценка по средним тратам за последние 30 дней.
  const from30 = addDays(today, -30);
  const t30 = totals(from30, today);
  const avgDailyNet = (t30.income - t30.expense) / 30;
  const daysAhead = Math.max(0, daysBetween(today, targetISO));
  const avgEstimate = balance + avgDailyNet * daysAhead;

  return {
    today, targetISO, daysAhead,
    balance, plannedIn, plannedOut, projected,
    avgDailyNet, avgEstimate,
    items: items.sort((a, b) => (a.next < b.next ? -1 : 1)),
  };
}

// ---- Бюджеты -------------------------------------------------------------

export async function saveBudget(data) {
  const existing = data.id ? state.budgets.find((b) => b.id === data.id) : null;
  const b = existing ? { ...existing, ...data, limit: Number(data.limit) } : makeBudget(data);
  await db.put('budgets', b);
  const idx = state.budgets.findIndex((x) => x.id === b.id);
  if (idx >= 0) state.budgets[idx] = b; else state.budgets.push(b);
  emit();
  return b;
}

export async function deleteBudget(id) {
  await db.remove('budgets', id);
  state.budgets = state.budgets.filter((b) => b.id !== id);
  emit();
}

// Статус бюджетов за текущий месяц.
export function budgetStatus() {
  const [from, to] = periodRange('month');
  return state.budgets.map((b) => {
    const cat = categoryById(b.categoryId);
    let spent = 0;
    for (const t of transactionsInRange(from, to)) {
      if (t.type === 'expense' && t.categoryId === b.categoryId) spent += baseAmount(t);
    }
    return {
      budget: b, category: cat, spent,
      limit: b.limit,
      remaining: b.limit - spent,
      ratio: b.limit > 0 ? spent / b.limit : 0,
    };
  }).sort((a, b) => b.ratio - a.ratio);
}

// ---- Экспорт / импорт ----------------------------------------------------

export async function exportAll() {
  const dump = await db.exportAll();
  return { app: 'FinTracker', version: 1, exportedAt: new Date().toISOString(), data: dump };
}

export async function importAll(payload) {
  const data = payload && payload.data ? payload.data : payload;
  await db.importAll(data);
  await init();
}

export function transactionsToCSV() {
  const rows = [['date', 'type', 'category', 'amount', 'currency', 'rate', 'amount_base', 'note']];
  for (const t of sortedTransactions()) {
    const cat = categoryById(t.categoryId);
    rows.push([
      t.date, t.type, cat ? categoryName(cat) : '', t.amount, t.currency,
      t.rate, baseAmount(t).toFixed(2),
      (t.note || '').replace(/"/g, '""'),
    ]);
  }
  return rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
}

export async function resetAll({ keepCategories = false } = {}) {
  const stores = keepCategories
    ? ['transactions', 'planned', 'budgets']
    : ['transactions', 'categories', 'planned', 'budgets'];
  for (const s of stores) await db.clear(s);
  await init(); // настройки (язык/тема/фон) сохраняются; категории пере-создаются, если удалены
}
