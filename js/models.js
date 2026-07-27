// models.js — фабрики сущностей и данные по умолчанию.

export const APP_VERSION = '1.18.1';

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Категории по умолчанию (создаются при первом запуске).
// icon — эмодзи (нативно рендерится на iOS), color — акцент.
// key — стабильный идентификатор для перевода имени (см. i18n «cat_<key>»).
// У пользовательских категорий key отсутствует — показывается их имя как есть.
export const DEFAULT_CATEGORIES = [
  // Расходы
  { key: 'groceries',     name: 'Продукты',    type: 'expense', icon: '🛒', color: '#34C759' },
  { key: 'cafe',          name: 'Кафе',        type: 'expense', icon: '☕️', color: '#FF9500' },
  { key: 'transport',     name: 'Транспорт',   type: 'expense', icon: '🚕', color: '#5AC8FA' },
  { key: 'housing',       name: 'Жильё',       type: 'expense', icon: '🏠', color: '#AF52DE' },
  { key: 'health',        name: 'Здоровье',    type: 'expense', icon: '💊', color: '#FF2D55' },
  { key: 'entertainment', name: 'Развлечения', type: 'expense', icon: '🎬', color: '#FF375F' },
  { key: 'shopping',      name: 'Покупки',     type: 'expense', icon: '🛍', color: '#BF5AF2' },
  { key: 'communication', name: 'Связь',       type: 'expense', icon: '📱', color: '#64D2FF' },
  { key: 'other',         name: 'Прочее',      type: 'expense', icon: '🔖', color: '#8E8E93' },
  // Доходы
  { key: 'salary',        name: 'Зарплата',    type: 'income',  icon: '💼', color: '#34C759' },
  { key: 'sidejob',       name: 'Подработка',  type: 'income',  icon: '🧾', color: '#30D158' },
  { key: 'gift',          name: 'Подарок',     type: 'income',  icon: '🎁', color: '#FF9F0A' },
  { key: 'investments',   name: 'Инвестиции',  type: 'income',  icon: '📈', color: '#0A84FF' },
  { key: 'other_income',  name: 'Прочее',      type: 'income',  icon: '💰', color: '#8E8E93' },
];

export function makeCategory({ name, type, icon, color, order, key, image, currency }) {
  const c = { id: uid(), name, type, icon: icon || '🔖', color: color || '#8E8E93', order: order || 0 };
  if (key) c.key = key;
  if (image) c.image = image;
  if (currency) c.currency = currency;
  return c;
}

export function makeTransaction({ type, amount, currency, rate, categoryId, date, note }) {
  return {
    id: uid(),
    type,                       // 'income' | 'expense'
    amount: Number(amount),     // в валюте операции
    currency: currency || 'RUB',
    rate: Number(rate) || 1,    // курс к базовой валюте
    categoryId: categoryId || null,
    date,                       // YYYY-MM-DD
    note: note || '',
    createdAt: Date.now(),
  };
}

export function makePlanned({ type, amount, currency, rate, categoryId, note, recurrence, startDate, endDate }) {
  return {
    id: uid(),
    type,
    amount: Number(amount),
    currency: currency || 'RUB',
    rate: Number(rate) || 1,
    categoryId: categoryId || null,
    note: note || '',
    recurrence: recurrence || 'monthly', // once|daily|weekly|monthly|yearly
    startDate,                           // YYYY-MM-DD
    endDate: endDate || null,
    active: true,
  };
}

export function makeBudget({ categoryId, limit, currency }) {
  return { id: uid(), categoryId, limit: Number(limit), currency: currency || 'RUB', period: 'month' };
}

export function makeGoal({ name, amount, currency }) {
  return { id: uid(), name: name || '', amount: Number(amount) || 0, currency: currency || 'RUB', createdAt: Date.now() };
}

// Настройки по умолчанию.
export const DEFAULT_SETTINGS = {
  baseCurrency: 'RUB',
  currentCurrency: 'RUB', // «ходовая» валюта для новых операций (напр. в поездке)
  convertAll: false,      // false — сценарий 1 (у каждой операции своя валюта);
                          // true — сценарий 2 (вся история в текущей валюте)
  language: 'ru',
  theme: 'system',      // system | light | dark
  splitHistory: true,   // раздельная история по типу в окнах Расходы/Доходы
  fitHistory: true,     // подгонять число строк истории под размер экрана (v1.4)
  maxRows: 10,          // лимит строк истории, когда fitHistory выключен
  langChosen: false,    // выбран ли язык при первом запуске
  background: 'none',   // фоновый паттерн ('none' | id | 'custom')
  bgCustom: null,       // свой фон (dataURL)
  themeColor: '#241C15',// базовый цвет ручной темы
  budgetTotal: 0,       // общий месячный лимит (0 = не задан)
  budgetDetailed: false,// детализировать лимиты по категориям
  budgetMutedMonth: '', // месяц (YYYY-MM), в котором уведомление о лимите отключено
  rates: {},            // курсы валют к основной: 1 <code> = rates[code] базовой
  convCurrencies: null, // список валют конвертера (null = все по умолчанию)
  seeded: false,        // созданы ли дефолтные категории
};
