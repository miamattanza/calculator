// icons.js — «банк» встроенных иконок категорий (расходы). Картинки лежат в
// icons/categories/<key>.png. Русские названия — из исходного manifest.
export const CATEGORY_ICON_DIR = "icons/categories/";
export function categoryIconPath(key) { return CATEGORY_ICON_DIR + key + ".png"; }

// Полный набор иконок (порядок как в исходной коллекции).
export const CATEGORY_ICONS = [
  { key: "rent-mortgage", label: "Аренда / ипотека" },
  { key: "utilities", label: "Коммунальные услуги" },
  { key: "internet-tv", label: "Интернет и ТВ" },
  { key: "cleaning", label: "Уборка и клининг" },
  { key: "groceries", label: "Продукты (дом)" },
  { key: "cafe-restaurants", label: "Кафе и рестораны" },
  { key: "fast-food", label: "Фастфуд и стритфуд" },
  { key: "coffee-snacks", label: "Кофе с собой / снеки" },
  { key: "public-transport", label: "Общественный транспорт" },
  { key: "taxi-carsharing", label: "Такси / каршеринг" },
  { key: "personal-car", label: "Личный автомобиль" },
  { key: "car-maintenance", label: "Ремонт и ТО авто" },
  { key: "car-insurance", label: "Страховка авто" },
  { key: "flights", label: "Авиаперелёты" },
  { key: "train-bus-longdistance", label: "Ж/д и автобусы дальнего следования" },
  { key: "pharmacy", label: "Аптеки и лекарства" },
  { key: "doctors-diagnostics", label: "Врачи и диагностика" },
  { key: "health-insurance", label: "ДМС / полисы" },
  { key: "sport-fitness", label: "Спорт и фитнес" },
  { key: "sports-gear", label: "Спортивный инвентарь" },
  { key: "clothing-shoes", label: "Одежда, обувь, аксессуары" },
  { key: "salon-beauty", label: "Салонная красота" },
  { key: "cosmetics-perfume", label: "Косметика и парфюм" },
  { key: "hygiene-household-chem", label: "Гигиена и быт. химия" },
  { key: "courses-training", label: "Курсы и тренинги" },
  { key: "books-magazines", label: "Книги и журналы" },
  { key: "tutors-mentors", label: "Репетиторы / менторы" },
  { key: "cinema-theatre-concerts", label: "Кино, театры, концерты" },
  { key: "hobbies-games", label: "Хобби и игры" },
  { key: "alcohol-hookah", label: "Алкоголь и кальяны" },
  { key: "travel-tours", label: "Путешествия и туры" },
  { key: "gifts-celebrations", label: "Подарки и поздравления" },
  { key: "kids-needs", label: "Детские нужды" },
  { key: "pets", label: "Домашние животные" },
  { key: "taxes", label: "Налоги" },
  { key: "loans-interest", label: "Кредиты и проценты" },
  { key: "pension-investments", label: "Пенсионные и инвестиции" },
  { key: "home-repair-construction", label: "Ремонт и строительство" },
  { key: "furniture-appliances", label: "Мебель и техника" },
  { key: "electronics-repair-services", label: "Сервисы и ремонт электроники" },
  { key: "software-subscriptions", label: "Подписки на софт и сервисы" },
  { key: "mobile-apps-games", label: "Приложения и игры" },
  { key: "life-property-insurance", label: "Страховка жизни / имущества" },
  { key: "bank-fees", label: "Банковские комиссии" },
  { key: "membership-fees", label: "Членские взносы" },
  { key: "unexpected-expenses", label: "Непредвиденные расходы" },
  { key: "miscellaneous", label: "Прочее" },
  { key: "charity-donations", label: "Благотворительность и пожертвования" },
  { key: "fines-penalties", label: "Штрафы и пени" },
  { key: "transfers-to-family", label: "Переводы родственникам" },
];

const KEYS = new Set(CATEGORY_ICONS.map((i) => i.key));
// true, если image указывает на встроенную иконку (а не на загруженную dataURL).
export function isBuiltinIcon(image) {
  return typeof image === "string" && image.indexOf(CATEGORY_ICON_DIR) === 0;
}
export function builtinKeyFromImage(image) {
  if (!isBuiltinIcon(image)) return null;
  const k = image.slice(CATEGORY_ICON_DIR.length).replace(/\.png$/, "");
  return KEYS.has(k) ? k : null;
}
