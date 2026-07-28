// icons.js — набор иконок-плиток категорий (SVG-спрайт icons/ui-icons.svg).
// Каждая запись: key, русское имя, группа (цвет), symbol — id в спрайте.
export const CATEGORY_ICONS = [
  { key: "rent-mortgage", label: "Аренда / ипотека", group: "housing", groupLabel: "Жильё и коммунальные услуги", symbol: "tile-rent-mortgage", color: "#84542A", colorDark: "#603B1A" },
  { key: "utilities", label: "Коммунальные услуги", group: "housing", groupLabel: "Жильё и коммунальные услуги", symbol: "tile-utilities", color: "#84542A", colorDark: "#603B1A" },
  { key: "internet-tv", label: "Интернет и ТВ", group: "housing", groupLabel: "Жильё и коммунальные услуги", symbol: "tile-internet-tv", color: "#84542A", colorDark: "#603B1A" },
  { key: "cleaning", label: "Уборка и клининг", group: "housing", groupLabel: "Жильё и коммунальные услуги", symbol: "tile-cleaning", color: "#84542A", colorDark: "#603B1A" },
  { key: "groceries", label: "Продукты (дом)", group: "food", groupLabel: "Питание", symbol: "tile-groceries", color: "#993229", colorDark: "#74221A" },
  { key: "cafe-restaurants", label: "Кафе и рестораны", group: "food", groupLabel: "Питание", symbol: "tile-cafe-restaurants", color: "#993229", colorDark: "#74221A" },
  { key: "fast-food", label: "Фастфуд и стритфуд", group: "food", groupLabel: "Питание", symbol: "tile-fast-food", color: "#993229", colorDark: "#74221A" },
  { key: "coffee-snacks", label: "Кофе с собой / снеки", group: "food", groupLabel: "Питание", symbol: "tile-coffee-snacks", color: "#993229", colorDark: "#74221A" },
  { key: "public-transport", label: "Общественный транспорт", group: "transport", groupLabel: "Транспорт и поездки", symbol: "tile-public-transport", color: "#305A88", colorDark: "#1F4165" },
  { key: "taxi-carsharing", label: "Такси / каршеринг", group: "transport", groupLabel: "Транспорт и поездки", symbol: "tile-taxi-carsharing", color: "#305A88", colorDark: "#1F4165" },
  { key: "personal-car", label: "Личный автомобиль", group: "transport", groupLabel: "Транспорт и поездки", symbol: "tile-personal-car", color: "#305A88", colorDark: "#1F4165" },
  { key: "car-maintenance", label: "Ремонт и ТО авто", group: "transport", groupLabel: "Транспорт и поездки", symbol: "tile-car-maintenance", color: "#305A88", colorDark: "#1F4165" },
  { key: "car-insurance", label: "Страховка авто", group: "transport", groupLabel: "Транспорт и поездки", symbol: "tile-car-insurance", color: "#305A88", colorDark: "#1F4165" },
  { key: "flights", label: "Авиаперелёты", group: "transport", groupLabel: "Транспорт и поездки", symbol: "tile-flights", color: "#305A88", colorDark: "#1F4165" },
  { key: "train-bus-longdistance", label: "Ж/д и автобусы дальнего следования", group: "transport", groupLabel: "Транспорт и поездки", symbol: "tile-train-bus-longdistance", color: "#305A88", colorDark: "#1F4165" },
  { key: "pharmacy", label: "Аптеки и лекарства", group: "health", groupLabel: "Здоровье и уход", symbol: "tile-pharmacy", color: "#2C775C", colorDark: "#1B5540" },
  { key: "doctors-diagnostics", label: "Врачи и диагностика", group: "health", groupLabel: "Здоровье и уход", symbol: "tile-doctors-diagnostics", color: "#2C775C", colorDark: "#1B5540" },
  { key: "health-insurance", label: "ДМС / полисы", group: "health", groupLabel: "Здоровье и уход", symbol: "tile-health-insurance", color: "#2C775C", colorDark: "#1B5540" },
  { key: "sport-fitness", label: "Спорт и фитнес", group: "health", groupLabel: "Здоровье и уход", symbol: "tile-sport-fitness", color: "#2C775C", colorDark: "#1B5540" },
  { key: "sports-gear", label: "Спортивный инвентарь", group: "health", groupLabel: "Здоровье и уход", symbol: "tile-sports-gear", color: "#2C775C", colorDark: "#1B5540" },
  { key: "clothing-shoes", label: "Одежда, обувь, аксессуары", group: "style", groupLabel: "Одежда и внешность", symbol: "tile-clothing-shoes", color: "#8A3865", colorDark: "#69264B" },
  { key: "salon-beauty", label: "Салонная красота", group: "style", groupLabel: "Одежда и внешность", symbol: "tile-salon-beauty", color: "#8A3865", colorDark: "#69264B" },
  { key: "cosmetics-perfume", label: "Косметика и парфюм", group: "style", groupLabel: "Одежда и внешность", symbol: "tile-cosmetics-perfume", color: "#8A3865", colorDark: "#69264B" },
  { key: "hygiene-household-chem", label: "Гигиена и быт. химия", group: "style", groupLabel: "Одежда и внешность", symbol: "tile-hygiene-household-chem", color: "#8A3865", colorDark: "#69264B" },
  { key: "courses-training", label: "Курсы и тренинги", group: "education", groupLabel: "Саморазвитие и образование", symbol: "tile-courses-training", color: "#43368C", colorDark: "#2F246A" },
  { key: "books-magazines", label: "Книги и журналы", group: "education", groupLabel: "Саморазвитие и образование", symbol: "tile-books-magazines", color: "#43368C", colorDark: "#2F246A" },
  { key: "tutors-mentors", label: "Репетиторы / менторы", group: "education", groupLabel: "Саморазвитие и образование", symbol: "tile-tutors-mentors", color: "#43368C", colorDark: "#2F246A" },
  { key: "cinema-theatre-concerts", label: "Кино, театры, концерты", group: "leisure", groupLabel: "Досуг и развлечения", symbol: "tile-cinema-theatre-concerts", color: "#96782C", colorDark: "#725A1D" },
  { key: "hobbies-games", label: "Хобби и игры", group: "leisure", groupLabel: "Досуг и развлечения", symbol: "tile-hobbies-games", color: "#96782C", colorDark: "#725A1D" },
  { key: "alcohol-hookah", label: "Алкоголь и кальяны", group: "leisure", groupLabel: "Досуг и развлечения", symbol: "tile-alcohol-hookah", color: "#96782C", colorDark: "#725A1D" },
  { key: "travel-tours", label: "Путешествия и туры", group: "leisure", groupLabel: "Досуг и развлечения", symbol: "tile-travel-tours", color: "#96782C", colorDark: "#725A1D" },
  { key: "gifts-celebrations", label: "Подарки и поздравления", group: "family", groupLabel: "Семья и личные отношения", symbol: "tile-gifts-celebrations", color: "#3F7836", colorDark: "#2A5823" },
  { key: "kids-needs", label: "Детские нужды", group: "family", groupLabel: "Семья и личные отношения", symbol: "tile-kids-needs", color: "#3F7836", colorDark: "#2A5823" },
  { key: "pets", label: "Домашние животные", group: "family", groupLabel: "Семья и личные отношения", symbol: "tile-pets", color: "#3F7836", colorDark: "#2A5823" },
  { key: "taxes", label: "Налоги", group: "finance", groupLabel: "Финансовые обязательства", symbol: "tile-taxes", color: "#2A2F51", colorDark: "#161A31" },
  { key: "loans-interest", label: "Кредиты и проценты", group: "finance", groupLabel: "Финансовые обязательства", symbol: "tile-loans-interest", color: "#2A2F51", colorDark: "#161A31" },
  { key: "pension-investments", label: "Пенсионные и инвестиционные взносы", group: "finance", groupLabel: "Финансовые обязательства", symbol: "tile-pension-investments", color: "#2A2F51", colorDark: "#161A31" },
  { key: "home-repair-construction", label: "Ремонт и строительство", group: "home_repair", groupLabel: "Быт и ремонт", symbol: "tile-home-repair-construction", color: "#646D2C", colorDark: "#454B1B" },
  { key: "furniture-appliances", label: "Покупка мебели и техники", group: "home_repair", groupLabel: "Быт и ремонт", symbol: "tile-furniture-appliances", color: "#646D2C", colorDark: "#454B1B" },
  { key: "electronics-repair-services", label: "Сервисы и ремонт электроники", group: "home_repair", groupLabel: "Быт и ремонт", symbol: "tile-electronics-repair-services", color: "#646D2C", colorDark: "#454B1B" },
  { key: "software-subscriptions", label: "Подписки на софт и сервисы", group: "digital", groupLabel: "Цифровые услуги", symbol: "tile-software-subscriptions", color: "#296670", colorDark: "#19464D" },
  { key: "mobile-apps-games", label: "Приложения и игры", group: "digital", groupLabel: "Цифровые услуги", symbol: "tile-mobile-apps-games", color: "#296670", colorDark: "#19464D" },
  { key: "life-property-insurance", label: "Страховка жизни / имущества", group: "mandatory", groupLabel: "Прочие обязательные", symbol: "tile-life-property-insurance", color: "#52396A", colorDark: "#38244C" },
  { key: "bank-fees", label: "Банковские комиссии", group: "mandatory", groupLabel: "Прочие обязательные", symbol: "tile-bank-fees", color: "#52396A", colorDark: "#38244C" },
  { key: "membership-fees", label: "Членские взносы", group: "mandatory", groupLabel: "Прочие обязательные", symbol: "tile-membership-fees", color: "#52396A", colorDark: "#38244C" },
  { key: "unexpected-expenses", label: "Непредвиденные расходы", group: "buffer", groupLabel: "Буферные категории", symbol: "tile-unexpected-expenses", color: "#726B65", colorDark: "#5B5249" },
  { key: "miscellaneous", label: "Прочее", group: "buffer", groupLabel: "Буферные категории", symbol: "tile-miscellaneous", color: "#726B65", colorDark: "#5B5249" },
  { key: "charity-donations", label: "Благотворительность и пожертвования", group: "bonus", groupLabel: "Дополнительные умные категории", symbol: "tile-charity-donations", color: "#7A297A", colorDark: "#571957" },
  { key: "fines-penalties", label: "Штрафы и пени", group: "bonus", groupLabel: "Дополнительные умные категории", symbol: "tile-fines-penalties", color: "#7A297A", colorDark: "#571957" },
  { key: "transfers-to-family", label: "Переводы родственникам", group: "bonus", groupLabel: "Дополнительные умные категории", symbol: "tile-transfers-to-family", color: "#7A297A", colorDark: "#571957" },
];

const BY_KEY = new Map(CATEGORY_ICONS.map((i) => [i.key, i]));
export function iconByKey(key) { return BY_KEY.get(key) || null; }

// Осталось для однократной обратной миграции старых PNG-иконок (v1.30).
export const CATEGORY_ICON_DIR = "icons/categories/";
export function isBuiltinIcon(image) {
  return typeof image === "string" && image.indexOf(CATEGORY_ICON_DIR) === 0;
}
