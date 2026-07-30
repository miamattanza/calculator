// store.js — единый источник состояния и бизнес-логики.
// Представления (views) читают данные и вызывают методы отсюда,
// напрямую с IndexedDB не работают. Это упрощает будущий перенос
// на облачную синхронизацию (iCloud): меняется только db-слой.

import { db } from './db.js';
import { setLang, t } from './i18n.js';
import { dateISO, monthKey, addDays, daysBetween, CURRENCIES } from './format.js';
import {
  DEFAULT_CATEGORIES, DEFAULT_SETTINGS, DEFAULT_TILE_MAP, makeCategory,
  makeTransaction, makePlanned, makeBudget, makeGoal,
} from './models.js';
import { isBuiltinIcon } from './icons.js';

const state = {
  transactions: [],
  categories: [],
  planned: [],
  budgets: [],
  goals: [],
  settings: { ...DEFAULT_SETTINGS },
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(state); }

// ---- Инициализация -------------------------------------------------------

export async function init() {
  const [transactions, categories, planned, budgets, goals, settingsRows] = await Promise.all([
    db.getAll('transactions'),
    db.getAll('categories'),
    db.getAll('planned'),
    db.getAll('budgets'),
    db.getAll('goals'),
    db.getAll('settings'),
  ]);

  state.transactions = transactions;
  state.categories = categories;
  state.planned = planned;
  state.budgets = budgets;
  state.goals = goals;

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

  // Убираем старые PNG-картинки категорий (наследие v1.30), если остались.
  if (!state.settings.iconsReverted) {
    const changed = [];
    for (const c of state.categories) {
      if (isBuiltinIcon(c.image)) { delete c.image; changed.push(c); }
    }
    if (changed.length) await db.bulkPut('categories', changed);
    await setSetting('iconsReverted', true);
  }

  // Новые иконки-плитки + цвета палитры для стандартных категорий (один раз).
  // Не трогаем категории с загруженной пользователем картинкой.
  if (!state.settings.tilesV1) {
    const changed = [];
    for (const c of state.categories) {
      const m = c.key && DEFAULT_TILE_MAP[c.key];
      if (!m) continue;
      if (c.image) continue; // своя картинка — оставляем
      let upd = false;
      if (m.iconKey && c.iconKey !== m.iconKey) { c.iconKey = m.iconKey; upd = true; }
      if (m.color && c.color !== m.color) { c.color = m.color; upd = true; }
      if (upd) changed.push(c);
    }
    if (changed.length) await db.bulkPut('categories', changed);
    await setSetting('tilesV1', true);
  }

  // Позиции категорий: приводим к чистым (без «дыр» и коллизий) 0..N-1 внутри
  // каждого типа — ровно то, что пользователь сейчас видит. Дальше позиции
  // абсолютные: перенос/удаление оставляют пустые ячейки, ничего не сдвигая.
  if (!state.settings.slotsV1) {
    const changed = [];
    for (const type of ['expense', 'income']) {
      categoriesByType(type).forEach((c, i) => { if ((c.order || 0) !== i) { c.order = i; changed.push(c); } });
    }
    if (changed.length) await db.bulkPut('categories', changed);
    await setSetting('slotsV1', true);
  }

  // Тема — только светлая/тёмная. Наследие ('system'/'manual') и первый запуск
  // приводим к конкретной теме один раз, ориентируясь на системную настройку.
  if (state.settings.theme !== 'light' && state.settings.theme !== 'dark') {
    const prefersDark = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-color-scheme: dark)').matches;
    await setSetting('theme', prefersDark ? 'dark' : 'light');
  }

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

// Текущая («ходовая») валюта — в ней записываются новые операции; по умолчанию
// совпадает с основной. Меняется, например, на время поездки.
// Устойчиво: если валюта не задана, совпадает с основной или её курс к основной
// неизвестен — используем основную валюту (иначе на экране могла появиться
// «зависшая» старая валюта, напр. рубль при основной евро).
export function currentCurrency() {
  const base = state.settings.baseCurrency;
  const cur = state.settings.currentCurrency;
  if (!cur || cur === base) return base;
  if (rateToBase(cur) == null) return base;
  return cur;
}

// Курс валюты к ОСНОВНОЙ: 1 <cur> = rateToBase(cur) основной валюты.
// null — курс неизвестен (не задан вручную и не загружен).
export function rateToBase(cur) {
  const base = state.settings.baseCurrency;
  if (cur === base) return 1;
  const v = Number((state.settings.rates || {})[cur]);
  return v > 0 ? v : null;
}

// Перевод суммы из основной валюты в произвольную (для отображения).
export function convertFromBase(baseValue, cur) {
  const r = rateToBase(cur);
  return r ? baseValue / r : baseValue;
}

// Безопасная смена ОСНОВНОЙ валюты: прошлые операции не «переклеиваются» —
// они хранят свою валюту и сумму; пересчитываем лишь курс к новой базе и
// карту курсов, чтобы статистика оставалась верной. Если курс новой базы к
// старой неизвестен — оставляем как есть (визуально суммы уже в своих валютах).
export async function changeBaseCurrency(newBase) {
  const oldBase = state.settings.baseCurrency;
  if (!newBase || newBase === oldBase) return;
  const oldRates = state.settings.rates || {};
  const oldToBase = (c) => (c === oldBase ? 1 : (Number(oldRates[c]) > 0 ? Number(oldRates[c]) : null));
  const K = oldToBase(newBase); // сколько старой базы в 1 новой базе
  if (K) {
    const newRates = {};
    for (const c of Object.keys(CURRENCIES)) {
      if (c === newBase) continue;
      const rc = oldToBase(c);
      if (rc != null) newRates[c] = rc / K;
    }
    state.settings.rates = newRates;
    await db.put('settings', { key: 'rates', value: newRates });
    // Курс у операций/плановых — снимок native→база; переносим к новой базе.
    for (const t of state.transactions) { t.rate = (Number(t.rate) || 1) / K; await db.put('transactions', t); }
    for (const p of state.planned) { p.rate = (Number(p.rate) || 1) / K; await db.put('planned', p); }
  }
  state.settings.baseCurrency = newBase;
  await db.put('settings', { key: 'baseCurrency', value: newBase });
  // Текущая валюта, если она «следовала» за основной (не задана или совпадала
  // со старой основной), теперь следует за новой — иначе на главном экране
  // осталась бы прежняя валюта.
  const cur = state.settings.currentCurrency;
  if (!cur || cur === oldBase) {
    state.settings.currentCurrency = newBase;
    await db.put('settings', { key: 'currentCurrency', value: newBase });
  }
  emit();
}

// ---- Категории -----------------------------------------------------------

// Активные категории типа (без «архивных» — удалённых из меню, но оставшихся
// ради истории). archived-категории видны только в истории/аналитике по id.
export function categoriesByType(type) {
  return state.categories
    .filter((c) => c.type === type && !c.archived)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function categoryById(id) {
  return state.categories.find((c) => c.id === id) || null;
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

// Первая свободная позиция (slot) среди категорий данного типа. Позиции —
// абсолютные (с «дырами»): при удалении/переносе места не «схлопываются».
export function firstFreeSlot(type) {
  const used = new Set(state.categories.filter((c) => c.type === type && !c.archived).map((c) => c.order || 0));
  let i = 0; while (used.has(i)) i++; return i;
}

export async function saveCategory(data) {
  const existing = data.id ? categoryById(data.id) : null;
  // Новой категории без явной позиции даём первую свободную ячейку своего типа.
  if (!existing && data.order == null) data = { ...data, order: firstFreeSlot(data.type) };
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

// Обмен местами двух категорий: меняем их позиции (order) без сдвига остальных.
export async function reorderCategorySwap(type, idA, idB) {
  if (idA === idB) return;
  const a = categoryById(idA);
  const b = categoryById(idB);
  if (!a || !b) return;
  const tmp = a.order || 0; a.order = b.order || 0; b.order = tmp;
  await db.bulkPut('categories', [a, b]);
  emit();
}

// Перенос категории на конкретную позицию (перетаскивание на свободную ячейку).
// Позиции абсолютные: прежняя ячейка остаётся пустой, остальные НЕ сдвигаются.
// Если целевая ячейка вдруг занята — меняемся с занявшим (защита от гонок).
export async function moveCategoryToSlot(type, id, slot) {
  const cat = categoryById(id);
  if (!cat || (cat.order || 0) === slot) return;
  const changed = [cat];
  const occupant = state.categories.find((c) => c.type === type && c.id !== id && !c.archived && (c.order || 0) === slot);
  if (occupant) { occupant.order = cat.order || 0; changed.push(occupant); }
  cat.order = slot;
  await db.bulkPut('categories', changed);
  emit();
}

export function categoryInUse(id) {
  return state.transactions.some((t) => t.categoryId === id) ||
         state.planned.some((p) => p.categoryId === id) ||
         state.budgets.some((b) => b.categoryId === id);
}

// Удаление категории с сохранением истории: категория «архивируется» — убирается
// из меню (categoriesByType её больше не отдаёт), но запись остаётся в базе,
// поэтому в истории/аналитике по-прежнему видны её иконка и название (с пометкой).
export async function archiveCategory(id) {
  const cat = categoryById(id);
  if (!cat) return;
  cat.archived = true;
  await db.put('categories', cat);
  emit();
}

// Полное удаление категории (когда истории нет — можно убрать бесследно).
export async function deleteCategory(id) {
  await db.remove('categories', id);
  state.categories = state.categories.filter((c) => c.id !== id);
  emit();
}

// Удаление категории вместе со всеми связанными данными: операции, плановые
// платежи и лимиты этой категории тоже удаляются.
export async function deleteCategoryWithData(id) {
  for (const tx of state.transactions.filter((t) => t.categoryId === id)) await db.remove('transactions', tx.id);
  state.transactions = state.transactions.filter((t) => t.categoryId !== id);
  for (const p of state.planned.filter((p) => p.categoryId === id)) await db.remove('planned', p.id);
  state.planned = state.planned.filter((p) => p.categoryId !== id);
  for (const b of state.budgets.filter((b) => b.categoryId === id)) await db.remove('budgets', b.id);
  state.budgets = state.budgets.filter((b) => b.categoryId !== id);
  await db.remove('categories', id);
  state.categories = state.categories.filter((c) => c.id !== id);
  emit();
}

// ---- Операции ------------------------------------------------------------

export async function saveTransaction(data) {
  const existing = data.id ? state.transactions.find((t) => t.id === data.id) : null;
  // При частичном обновлении (например, только заметки) сохраняем прежние
  // значения полей, которых нет в data.
  const trx = existing
    ? { ...existing, ...data,
        amount: data.amount != null ? Number(data.amount) : existing.amount,
        rate: data.rate != null ? Number(data.rate) : existing.rate }
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
    if (f.currency && t.currency !== f.currency) return false;
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

// Валюты, реально использованные в операциях (для фильтра поиска).
// Порядок: сначала основная (если встречалась), затем прочие по алфавиту.
export function usedCurrencies() {
  const base = state.settings.baseCurrency;
  const set = new Set();
  for (const t of state.transactions) if (t.currency) set.add(t.currency);
  const list = [...set];
  return list.sort((a, b) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)));
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

// Число дней ведения учёта: от самой ранней операции до сегодня включительно.
export function dataSpanDays() {
  if (!state.transactions.length) return 0;
  let min = null;
  for (const t of state.transactions) if (min === null || t.date < min) min = t.date;
  return Math.max(1, daysBetween(min, dateISO()) + 1);
}

// Средний дневной чистый поток (доходы−расходы) за ВЕСЬ период ведения учёта:
// (все доходы − все расходы) ÷ число дней. Чем дольше ведётся учёт, тем точнее.
export function averageDailyNet() {
  if (!state.transactions.length) return 0;
  let i = 0, o = 0;
  for (const t of state.transactions) { if (t.type === 'income') i += baseAmount(t); else o += baseAmount(t); }
  return (i - o) / dataSpanDays();
}

// Средний дневной вклад плановых платежей (зарплата и т.п.), приведённый к дню.
export function plannedDailyNet() {
  const perDay = { once: 0, daily: 1, weekly: 1 / 7, monthly: 1 / 30.44, yearly: 1 / 365 };
  let sum = 0;
  for (const p of state.planned) {
    if (!p.active) continue;
    const rate = perDay[p.recurrence] || 0;
    if (!rate) continue;
    sum += baseAmount(p) * rate * (p.type === 'income' ? 1 : -1);
  }
  return sum;
}

// Оценка накопления на цель. dailyRate = тренд по истории + плановые доходы.
export function planningEstimate(goalAmount) {
  const spanDays = dataSpanDays();
  const enoughData = spanDays >= 30;
  const dailyRate = averageDailyNet() + plannedDailyNet();
  const amount = Number(goalAmount) || 0;
  const balance = currentBalance();
  const canBuyNow = amount > 0 && balance >= amount; // уже хватает — покупка сразу
  let days = null, date = null, reachable = false;
  if (!canBuyNow && dailyRate > 0 && amount > 0) {
    // копим недостающую часть от текущего баланса
    const need = amount - Math.max(0, balance);
    days = Math.ceil(need / dailyRate);
    date = addDays(dateISO(), days);
    reachable = true;
  }
  return { enoughData, spanDays, dailyRate, monthlyRate: dailyRate * 30.44, days, date, reachable, balance, canBuyNow, remainingAfter: balance - amount };
}

// Прогноз остатка на целевую дату:
//   остаток = текущий баланс
//           + плановые платежи (доходы−расходы) до целевой даты
//           + тренд (средний дневной чистый поток × число дней вперёд)
export function forecast(targetISO) {
  const today = dateISO();
  const balance = currentBalance();
  const daysAhead = Math.max(0, daysBetween(today, targetISO));

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

  const trendDaily = averageDailyNet();
  const trendDelta = trendDaily * daysAhead;
  const projected = balance + plannedIn - plannedOut + trendDelta;

  return {
    today, targetISO, daysAhead, enoughData: dataSpanDays() >= 30,
    balance, plannedIn, plannedOut, trendDaily, trendDelta, projected,
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

// Все расходы за текущий месяц (для общего лимита).
export function monthExpenseTotal() {
  const [from, to] = periodRange('month');
  let sum = 0;
  for (const t of transactionsInRange(from, to)) if (t.type === 'expense') sum += baseAmount(t);
  return sum;
}

export function currentMonthKey() { return monthKey(dateISO()); }

// Сводный статус лимита за месяц (для сигнала в шапке). В детальном режиме —
// сумма лимитов и трат по бюджетным категориям; иначе — общий лимит.
export function budgetOverallStatus() {
  const s = state.settings;
  let limit = 0, spent = 0;
  if (s.budgetDetailed) {
    const [from, to] = periodRange('month');
    for (const b of state.budgets) {
      limit += Number(b.limit) || 0;
      for (const t of transactionsInRange(from, to)) if (t.type === 'expense' && t.categoryId === b.categoryId) spent += baseAmount(t);
    }
  } else {
    limit = Number(s.budgetTotal) || 0;
    spent = monthExpenseTotal();
  }
  const ratio = limit > 0 ? spent / limit : 0;
  return { has: limit > 0, limit, spent, ratio, over: limit > 0 && spent > limit, muted: s.budgetMutedMonth === currentMonthKey() };
}

// ---- Цели (Планирование) -------------------------------------------------

export async function saveGoal(data) {
  const existing = data.id ? state.goals.find((g) => g.id === data.id) : null;
  const g = existing ? { ...existing, ...data, amount: Number(data.amount) || 0 } : makeGoal(data);
  await db.put('goals', g);
  const idx = state.goals.findIndex((x) => x.id === g.id);
  if (idx >= 0) state.goals[idx] = g; else state.goals.push(g);
  emit();
  return g;
}

export async function deleteGoal(id) {
  await db.remove('goals', id);
  state.goals = state.goals.filter((g) => g.id !== id);
  emit();
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
    ? ['transactions', 'planned', 'budgets', 'goals']
    : ['transactions', 'categories', 'planned', 'budgets', 'goals'];
  for (const s of stores) await db.clear(s);
  await init(); // настройки (язык/тема/фон) сохраняются; категории пере-создаются, если удалены
}
