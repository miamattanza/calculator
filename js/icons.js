// icons.js — вспомогательная функция для распознавания «встроенных» иконок
// категорий (путь icons/categories/...). Набор картинок из проекта удалён;
// helper нужен для однократной обратной миграции (снятие ранее применённых
// встроенных картинок у категорий) и безопасного рендера.
export const CATEGORY_ICON_DIR = 'icons/categories/';

export function isBuiltinIcon(image) {
  return typeof image === 'string' && image.indexOf(CATEGORY_ICON_DIR) === 0;
}
