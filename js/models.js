// models.js — фабрики сущностей и данные по умолчанию.

export const APP_VERSION = '1.92';

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Категории по умолчанию (создаются при первом запуске).
// icon — эмодзи (нативно рендерится на iOS), color — акцент.
// key — стабильный идентификатор для перевода имени (см. i18n «cat_<key>»).
// У пользовательских категорий key отсутствует — показывается их имя как есть.
// Соответствие стандартных категорий новым иконкам-плиткам (iconKey) и цвету
// группы из палитры. Стандартные доходы пока на эмодзи (иконки доходов уже есть
// в проекте и доступны для выбора в редакторе), но с цветами из палитры.
export const DEFAULT_TILE_MAP = {
  groceries:     { iconKey: 'groceries',                color: '#993229' },
  cafe:          { iconKey: 'cafe-restaurants',         color: '#993229' },
  transport:     { iconKey: 'public-transport',         color: '#305A88' },
  housing:       { iconKey: 'rent-mortgage',            color: '#84542A' },
  health:        { iconKey: 'doctors-diagnostics',      color: '#2C775C' },
  entertainment: { iconKey: 'cinema-theatre-concerts',  color: '#96782C' },
  shopping:      { iconKey: 'clothing-shoes',           color: '#8A3865' },
  communication: { iconKey: 'internet-tv',              color: '#84542A' },
  other:         { iconKey: 'miscellaneous',            color: '#726B65' },
  // Доходы — только цвет (эмодзи оставляем)
  salary:        { color: '#2E8A5F' },
  sidejob:       { color: '#2E8A5F' },
  gift:          { color: '#3F7836' },
  investments:   { color: '#2A2F51' },
  other_income:  { color: '#726B65' },
};

// Позиции (order) заданы явно: у расходов на первой странице 7 категорий и одна
// пустая ячейка «+» (slot 7 пропущен), ещё две категории — на второй странице
// (slots 8–9). Так пользователь сразу видит, что категории можно добавлять и что
// список продолжается на следующей странице.
export const DEFAULT_CATEGORIES = [
  // Расходы (иконки-плитки)
  { key: 'groceries',     name: 'Продукты',    type: 'expense', icon: '🛒', color: '#993229', iconKey: 'groceries',              order: 0 },
  { key: 'cafe',          name: 'Кафе',        type: 'expense', icon: '☕️', color: '#993229', iconKey: 'cafe-restaurants',       order: 1 },
  { key: 'transport',     name: 'Транспорт',   type: 'expense', icon: '🚕', color: '#305A88', iconKey: 'public-transport',       order: 2 },
  { key: 'housing',       name: 'Жильё',       type: 'expense', icon: '🏠', color: '#84542A', iconKey: 'rent-mortgage',          order: 3 },
  { key: 'health',        name: 'Здоровье',    type: 'expense', icon: '💊', color: '#2C775C', iconKey: 'doctors-diagnostics',    order: 4 },
  { key: 'entertainment', name: 'Развлечения', type: 'expense', icon: '🎬', color: '#96782C', iconKey: 'cinema-theatre-concerts', order: 5 },
  { key: 'shopping',      name: 'Покупки',     type: 'expense', icon: '🛍', color: '#8A3865', iconKey: 'clothing-shoes',         order: 6 },
  // slot 7 — пустая ячейка «+»
  { key: 'communication', name: 'Связь',       type: 'expense', icon: '📱', color: '#84542A', iconKey: 'internet-tv',            order: 8 },
  { key: 'other',         name: 'Прочее',      type: 'expense', icon: '🔖', color: '#726B65', iconKey: 'miscellaneous',          order: 9 },
  // Доходы (эмодзи, цвета из палитры)
  { key: 'salary',        name: 'Зарплата',    type: 'income',  icon: '💼', color: '#2E8A5F', order: 0 },
  { key: 'sidejob',       name: 'Подработка',  type: 'income',  icon: '🧾', color: '#2E8A5F', order: 1 },
  { key: 'gift',          name: 'Подарок',     type: 'income',  icon: '🎁', color: '#3F7836', order: 2 },
  { key: 'investments',   name: 'Инвестиции',  type: 'income',  icon: '📈', color: '#2A2F51', order: 3 },
  { key: 'other_income',  name: 'Прочее',      type: 'income',  icon: '💰', color: '#726B65', order: 4 },
];

export function makeCategory({ name, type, icon, color, order, key, image, currency, iconKey, iconColor, noBg }) {
  const c = { id: uid(), name, type, icon: icon || '🔖', color: color || '#726B65', order: order || 0 };
  if (key) c.key = key;
  if (image) c.image = image;
  if (iconKey) c.iconKey = iconKey;
  if (currency) c.currency = currency;
  if (iconColor) c.iconColor = iconColor;   // цвет иконки (по умолчанию белый)
  if (noBg) c.noBg = true;                   // «без фона»: показывать только иконку
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
  currentCurrency: null,  // «ходовая» валюта (null = следует за основной)
  convertAll: false,      // false — сценарий 1 (у каждой операции своя валюта);
                          // true — сценарий 2 (вся история в текущей валюте)
  language: 'ru',
  theme: 'system',      // 'system' — служебное значение первого запуска: store
                        // приведёт его к light/dark по системной теме. Далее — только light | dark.
  splitHistory: true,   // раздельная история по типу в окнах Расходы/Доходы
  fitHistory: true,     // подгонять число строк истории под размер экрана (v1.4)
  maxRows: 10,          // лимит строк истории, когда fitHistory выключен
  sumPlusLeft: false,   // кнопка «+» (сложение сумм) слева (над «1») вместо справа (над «3»)
  soundFeedback: false, // звуковой сигнал при записи операции (вибро — всегда)
  langChosen: false,    // выбран ли язык при первом запуске
  onboarded: false,     // показан ли вводный тур
  background: 'none',   // фоновый паттерн ('none' | id | 'custom')
  bgCustom: null,       // свой фон (dataURL)
  budgetTotal: 0,       // общий месячный лимит (0 = не задан)
  budgetDetailed: false,// детализировать лимиты по категориям
  budgetMutedMonth: '', // месяц (YYYY-MM), в котором уведомление о лимите отключено
  rates: {},            // курсы валют к основной: 1 <code> = rates[code] базовой
  convCurrencies: null, // список валют конвертера (null = все по умолчанию)
  lastBackupAt: 0,      // время последней резервной копии (Экспорт)
  backupSnoozeUntil: 0, // до какого времени отложено напоминание о копии
  seeded: false,        // созданы ли дефолтные категории
};
